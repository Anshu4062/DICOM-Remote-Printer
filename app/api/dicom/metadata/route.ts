import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { join } from "path";
import { existsSync, readdirSync } from "fs";
import JSZip from "jszip";
import dbConnect from "@/lib/mongodb";
import ImageHistory from "@/models/ImageHistory";

const execAsync = promisify(exec);

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { userId, filename, scope } = await req.json();

    if (!userId || !filename) {
      return NextResponse.json(
        { error: "Missing userId or filename" },
        { status: 400 }
      );
    }

    const baseDir =
      scope === "received"
        ? join(process.cwd(), "receives", userId)
        : join(process.cwd(), "uploads", userId);
    // Check JSON cache first
    try {
      const cacheDir = join(baseDir, "_meta");
      const cachePath = join(cacheDir, `${filename}.json`);
      if (existsSync(cachePath)) {
        const { readFileSync } = await import("fs");
        const json = readFileSync(cachePath, "utf8");
        const cached = JSON.parse(json);
        return NextResponse.json({
          success: true,
          metadata: cached,
          raw: undefined,
        });
      }
    } catch {}
    const filePath = join(baseDir, filename);

    if (!existsSync(filePath)) {
      // Check if this is a ZIP file that was processed but not saved
      // Look in the history to see if this was a ZIP upload
      await dbConnect();
      const historyEntry = await ImageHistory.findOne({
        userId,
        filename,
        "metadata.zip": true,
      });

      if (
        historyEntry &&
        historyEntry.metadata.files &&
        historyEntry.metadata.files.length > 0
      ) {
        // This was a ZIP upload, get metadata from the first extracted DICOM file
        const firstDicomFile = historyEntry.metadata.files[0];
        const dicomFilePath = join(baseDir, firstDicomFile);

        if (existsSync(dicomFilePath)) {
          const command = `dcmdump "${dicomFilePath}"`;
          const { stdout, stderr } = await execAsync(command);

          if (!stderr) {
            const metadata = parseDicomMetadata(stdout);
            metadata.zipFile = filename;
            metadata.extractedFrom = firstDicomFile;
            metadata.fileCount = historyEntry.metadata.fileCount;
            metadata.files = historyEntry.metadata.files;

            // cache
            try {
              const cacheDir = join(process.cwd(), "uploads", userId, "_meta");
              if (!existsSync(cacheDir))
                require("fs").mkdirSync(cacheDir, { recursive: true });
              require("fs").writeFileSync(
                join(cacheDir, `${firstDicomFile}.json`),
                JSON.stringify(metadata, null, 2)
              );
            } catch {}

            return NextResponse.json({
              success: true,
              metadata,
              raw: stdout,
            });
          }
        }
      }

      // Heuristic: filename may be a UID label, try to locate a matching file by UID
      const uidMatches = filename.match(/\d+(?:\.\d+)+/g);
      const possibleUid = uidMatches?.sort(
        (a: string, b: string) => b.length - a.length
      )[0];
      if (possibleUid) {
        const dir = join(process.cwd(), "uploads", userId);
        if (existsSync(dir)) {
          try {
            const files = readdirSync(dir).filter((f) => !f.startsWith("."));
            for (const f of files) {
              try {
                const cmd = `dcmdump "${join(dir, f)}"`;
                const { stdout } = await execAsync(cmd);
                if (
                  stdout.includes(possibleUid) &&
                  (stdout.includes("(0020,000d)") ||
                    stdout.includes("(0020,000e)") ||
                    stdout.includes("(0008,0018)"))
                ) {
                  const meta = parseDicomMetadata(stdout);
                  return NextResponse.json({
                    success: true,
                    metadata: meta,
                    raw: stdout,
                  });
                }
              } catch {}
            }
          } catch {}
        }
      }

      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    let metadata: any = {};
    let rawStdout: string | undefined;

    // Check if it's a ZIP file
    if (filename.toLowerCase().endsWith(".zip")) {
      // For ZIP files, try to extract and get metadata from the first DICOM file
      try {
        const fileBuffer = require("fs").readFileSync(filePath);
        const zip = await JSZip.loadAsync(fileBuffer);

        // Helper: detect DICOM by signature (DICM at byte offset 128)
        const isDicomBuffer = (buf: Buffer) => {
          if (!buf || buf.length < 132) return false;
          return buf.subarray(128, 132).toString() === "DICM";
        };

        // Find the first DICOM file in the ZIP by extension OR signature
        let chosenName: string | null = null;
        let chosenBuffer: Buffer | null = null;
        for (const [name, file] of Object.entries(zip.files)) {
          if (file.dir) continue;
          const lower = name.toLowerCase();
          const buf = await (file as any).async("nodebuffer");
          if (
            lower.endsWith(".dcm") ||
            lower.endsWith(".dicom") ||
            isDicomBuffer(buf)
          ) {
            chosenName = name;
            chosenBuffer = buf as Buffer;
            break;
          }
        }

        if (chosenBuffer && chosenName) {
          // Extract the DICOM file to a temporary location
          const tempDir = join(process.cwd(), "temp");
          if (!existsSync(tempDir)) {
            require("fs").mkdirSync(tempDir, { recursive: true });
          }

          const tempFilePath = join(tempDir, `temp_${Date.now()}.dcm`);
          require("fs").writeFileSync(tempFilePath, chosenBuffer);

          // Get metadata from the extracted DICOM file
          const command = `dcmdump "${tempFilePath}"`;
          const { stdout, stderr } = await execAsync(command);

          if (!stderr) {
            metadata = parseDicomMetadata(stdout);
            // Add ZIP-specific metadata
            metadata.zipFile = filename;
            metadata.extractedFrom = chosenName;
            try {
              const cacheDir = join(process.cwd(), "uploads", userId, "_meta");
              if (!existsSync(cacheDir))
                require("fs").mkdirSync(cacheDir, { recursive: true });
              require("fs").writeFileSync(
                join(cacheDir, `${chosenName}.json`),
                JSON.stringify(metadata, null, 2)
              );
            } catch {}
            rawStdout = stdout;
          }

          // Clean up temp file
          require("fs").unlinkSync(tempFilePath);
        } else {
          metadata = { error: "No DICOM files found in ZIP" };
        }
      } catch (zipError) {
        metadata = { error: "Failed to process ZIP file" };
      }
    } else {
      // For regular DICOM files, use dcmdump directly
      const command = `dcmdump "${filePath}"`;
      const { stdout, stderr } = await execAsync(command);

      if (stderr) {
        return NextResponse.json(
          { error: `dcmdump stderr: ${stderr}`, stdout },
          { status: 500 }
        );
      }

      metadata = parseDicomMetadata(stdout);
      try {
        const cacheDir = join(process.cwd(), "uploads", userId, "_meta");
        if (!existsSync(cacheDir))
          require("fs").mkdirSync(cacheDir, { recursive: true });
        require("fs").writeFileSync(
          join(cacheDir, `${filename}.json`),
          JSON.stringify(metadata, null, 2)
        );
      } catch {}
      rawStdout = stdout;
    }

    return NextResponse.json({
      success: true,
      metadata,
      raw: rawStdout,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to extract metadata" },
      { status: 500 }
    );
  }
}

function parseDicomMetadata(dcmdumpOutput: string) {
  const lines = dcmdumpOutput.split("\n");
  const metadata: any = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Extract comprehensive metadata fields - matching Weasis level of detail
    if (trimmed.includes("(0010,0010)")) {
      metadata.patientName = extractValue(trimmed);
    } else if (trimmed.includes("(0010,0020)")) {
      metadata.patientId = extractValue(trimmed);
    } else if (trimmed.includes("(0010,0040)")) {
      metadata.patientSex = extractValue(trimmed);
    } else if (trimmed.includes("(0010,0030)")) {
      metadata.patientBirthDate = extractValue(trimmed);
    } else if (trimmed.includes("(0010,1010)")) {
      metadata.patientAge = extractValue(trimmed);
    } else if (trimmed.includes("(0010,1020)")) {
      metadata.patientSize = extractValue(trimmed);
    } else if (trimmed.includes("(0010,1030)")) {
      metadata.patientWeight = extractValue(trimmed);
    } else if (trimmed.includes("(0010,4000)")) {
      metadata.patientComments = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0060)")) {
      metadata.modality = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0050)")) {
      metadata.accessionNumber = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0020)")) {
      metadata.studyDate = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0030)")) {
      metadata.studyTime = extractValue(trimmed);
    } else if (trimmed.includes("(0008,1030)")) {
      metadata.studyDescription = extractValue(trimmed);
    } else if (trimmed.includes("(0008,1032)")) {
      metadata.performingPhysicianName = extractValue(trimmed);
    } else if (trimmed.includes("(0020,000D)")) {
      metadata.studyInstanceUID = extractValue(trimmed);
    } else if (trimmed.includes("(0020,0010)")) {
      metadata.studyId = extractValue(trimmed);
    } else if (trimmed.includes("(0020,0011)")) {
      metadata.seriesNumber = extractValue(trimmed);
    } else if (trimmed.includes("(0008,103E)")) {
      metadata.seriesDescription = extractValue(trimmed);
    } else if (trimmed.includes("(0020,000E)")) {
      metadata.seriesInstanceUID = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0061)")) {
      metadata.bodyPartExamined = extractValue(trimmed);
    } else if (trimmed.includes("(0020,0013)")) {
      metadata.instanceNumber = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0018)")) {
      metadata.sopInstanceUID = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0016)")) {
      metadata.sopClassUID = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0010)")) {
      metadata.rows = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0011)")) {
      metadata.columns = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0002)")) {
      metadata.samplesPerPixel = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0004)")) {
      metadata.photometricInterpretation = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0008)")) {
      metadata.numberOfFrames = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0010)")) {
      metadata.rows = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0011)")) {
      metadata.columns = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0030)")) {
      metadata.pixelSpacing = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0100)")) {
      metadata.bitsAllocated = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0101)")) {
      metadata.bitsStored = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0102)")) {
      metadata.highBit = extractValue(trimmed);
    } else if (trimmed.includes("(0028,0103)")) {
      metadata.pixelRepresentation = extractValue(trimmed);
    } else if (trimmed.includes("(0028,1050)")) {
      metadata.windowCenter = extractValue(trimmed);
    } else if (trimmed.includes("(0028,1051)")) {
      metadata.windowWidth = extractValue(trimmed);
    } else if (trimmed.includes("(0028,1052)")) {
      metadata.rescaleIntercept = extractValue(trimmed);
    } else if (trimmed.includes("(0028,1053)")) {
      metadata.rescaleSlope = extractValue(trimmed);
    } else if (trimmed.includes("(0028,1054)")) {
      metadata.rescaleType = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0070)")) {
      metadata.manufacturer = extractValue(trimmed);
    } else if (trimmed.includes("(0008,1090)")) {
      metadata.manufacturerModelName = extractValue(trimmed);
    } else if (trimmed.includes("(0008,1010)")) {
      metadata.stationName = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0080)")) {
      metadata.institutionName = extractValue(trimmed);
    } else if (trimmed.includes("(0008,1040)")) {
      metadata.institutionalDepartmentName = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0090)")) {
      metadata.referringPhysicianName = extractValue(trimmed);
    } else if (trimmed.includes("(0008,1070)")) {
      metadata.operatorsName = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0013)")) {
      metadata.instanceCreationTime = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0012)")) {
      metadata.instanceCreationDate = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0021)")) {
      metadata.seriesDate = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0031)")) {
      metadata.seriesTime = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0022)")) {
      metadata.acquisitionDate = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0032)")) {
      metadata.acquisitionTime = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0023)")) {
      metadata.contentDate = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0033)")) {
      metadata.contentTime = extractValue(trimmed);
    } else if (trimmed.includes("(0018,0015)")) {
      metadata.bodyPartExamined = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1000)")) {
      metadata.deviceSerialNumber = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1020)")) {
      metadata.softwareVersions = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1030)")) {
      metadata.protocolName = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1100)")) {
      metadata.reconstructionDiameter = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1120)")) {
      metadata.gantryDetectorTilt = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1130)")) {
      metadata.tableHeight = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1140)")) {
      metadata.rotationDirection = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1150)")) {
      metadata.exposureTime = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1151)")) {
      metadata.xRayTubeCurrent = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1152)")) {
      metadata.exposure = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1160)")) {
      metadata.filterMaterial = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1170)")) {
      metadata.generatorPower = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1190)")) {
      metadata.focalSpots = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1200)")) {
      metadata.dateOfLastCalibration = extractValue(trimmed);
    } else if (trimmed.includes("(0018,1210)")) {
      metadata.timeOfLastCalibration = extractValue(trimmed);
    } else if (trimmed.includes("(0018,5100)")) {
      metadata.patientPosition = extractValue(trimmed);
    } else if (trimmed.includes("(0018,5101)")) {
      metadata.viewPosition = extractValue(trimmed);
    } else if (trimmed.includes("(0020,0020)")) {
      metadata.patientOrientation = extractValue(trimmed);
    } else if (trimmed.includes("(0020,0037)")) {
      metadata.imageOrientationPatient = extractValue(trimmed);
    } else if (trimmed.includes("(0020,0032)")) {
      metadata.imagePositionPatient = extractValue(trimmed);
    } else if (trimmed.includes("(0020,1041)")) {
      metadata.sliceLocation = extractValue(trimmed);
    } else if (trimmed.includes("(0020,4000)")) {
      metadata.imageComments = extractValue(trimmed);
    } else if (trimmed.includes("(0020,0062)")) {
      metadata.imageLaterality = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0008)")) {
      metadata.imageType = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0005)")) {
      metadata.specificCharacterSet = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0002)")) {
      metadata.mediaStorageSOPClassUID = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0003)")) {
      metadata.mediaStorageSOPInstanceUID = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0010)")) {
      metadata.transferSyntaxUID = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0012)")) {
      metadata.implementationClassUID = extractValue(trimmed);
    } else if (trimmed.includes("(0008,0013)")) {
      metadata.implementationVersionName = extractValue(trimmed);
    }
  }

  return metadata;
}

function extractValue(line: string): string {
  // Extract value from dcmdump output format
  // Format: (tag) VR [length] Value
  // Example: (0010,0010) PN [SIBONGISENI^MHLONGO]                    #  20, 1 PatientName

  // Look for content between square brackets
  const bracketMatch = line.match(/\[([^\]]+)\]/);
  if (bracketMatch) {
    return bracketMatch[1].trim();
  }

  // Fallback: look for content after the tag and VR
  const match = line.match(/\([^)]+\)\s+\w+\s+\[.*?\]\s+(.*?)(?:\s+#|$)/);
  if (match) {
    return match[1].trim();
  }

  return "";
}
