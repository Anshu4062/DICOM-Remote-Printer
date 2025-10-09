import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { existsSync } from "fs";
import JSZip from "jszip";
import dbConnect from "@/lib/mongodb";
import ImageHistory from "@/models/ImageHistory";
import { exec } from "child_process";
import { promisify } from "util";

// Ensure Node.js runtime for fs and JSZip
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await dbConnect();

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const userId = formData.get("userId") as string;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), "uploads", userId);
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Helper: detect DICOM by magic ("DICM" at offset 0x80)
    const isDicomBuffer = (buf: Buffer) => {
      if (buf.length < 132) return false;
      return buf.slice(128, 132).toString() === "DICM";
    };

    // Convert uploaded file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = extname(file.name).toLowerCase();

    const execAsync = promisify(exec);

    const parseKeyFields = (stdout: string) => {
      const pickFirstNonEmpty = (tag: string) => {
        // Find the first occurrence of this tag that actually has a value in [..]
        const re = new RegExp(
          `\\(${tag}\\)\\s+\\w+\\s+(?:\\[([^\\]]+)\\]|\\(no value available\\))`,
          "ig"
        );
        let m: RegExpExecArray | null;
        while ((m = re.exec(stdout)) !== null) {
          if (m[1] && m[1].trim()) return m[1].trim();
        }
        return undefined;
      };
      const pickAny = (tags: string[]) => {
        for (const t of tags) {
          const v = pickFirstNonEmpty(t);
          if (v !== undefined) return v;
        }
        return undefined;
      };
      return {
        patientName: pickFirstNonEmpty("0010,0010"),
        patientId: pickFirstNonEmpty("0010,0020"),
        patientSex: pickFirstNonEmpty("0010,0040"),
        patientBirthDate: pickFirstNonEmpty("0010,0030"),
        modality: pickFirstNonEmpty("0008,0060"),
        studyDescription: pickFirstNonEmpty("0008,1030"),
        institutionName: pickAny(["0008,0080", "0008,1040"]),
        stationName: pickFirstNonEmpty("0008,1010"),
        studyInstanceUID: pickFirstNonEmpty("0020,000d"),
        seriesInstanceUID: pickFirstNonEmpty("0020,000e"),
        sopInstanceUID: pickFirstNonEmpty("0008,0018"),
        studyId: pickFirstNonEmpty("0020,0010"),
        accessionNumber: pickFirstNonEmpty("0008,0050"),
        referringPhysicianName: pickFirstNonEmpty("0008,0090"),
      } as any;
    };

    // Case 1: ZIP archive containing one or more DICOM files
    if (ext === ".zip" || file.type === "application/zip") {
      const zip = await JSZip.loadAsync(buffer);
      const savedFiles: string[] = [];
      const entries = Object.values(zip.files);
      for (const entry of entries) {
        if (entry.dir) continue;
        const entryBuf = Buffer.from(await entry.async("uint8array"));
        if (isDicomBuffer(entryBuf)) {
          const safeName = entry.name.split("/").pop() || "image.dcm";
          const outName = `${Date.now()}_${
            safeName.endsWith(".dcm") ? safeName : safeName + ".dcm"
          }`;
          const outPath = join(uploadsDir, outName);
          await writeFile(outPath, entryBuf);
          savedFiles.push(outName);
        }
      }
      if (savedFiles.length === 0) {
        return NextResponse.json(
          { error: "No DICOM files found in ZIP" },
          { status: 400 }
        );
      }

      // Also save the original ZIP file
      const zipFilename = `${Date.now()}_${file.name || "upload.zip"}`;
      const zipFilepath = join(uploadsDir, zipFilename);
      await writeFile(zipFilepath, buffer);

      // Try to extract key metadata from the DICOMs for caching and default history display
      // Strategy: iterate all saved files in the ZIP, parse, and merge preferring defined values
      let keyMeta: any = {};
      const prefer = (current: any, incoming: any) => {
        const out: any = { ...current };
        const fields = [
          "patientName",
          "patientId",
          "patientSex",
          "patientBirthDate",
          "modality",
          "studyDescription",
          "institutionName",
          "stationName",
          "studyInstanceUID",
          "seriesInstanceUID",
          "studyId",
          "accessionNumber",
          "referringPhysicianName",
        ];
        for (const f of fields) {
          if (out[f] === undefined || out[f] === "-") {
            if (incoming && incoming[f] !== undefined && incoming[f] !== "-") {
              out[f] = incoming[f];
            }
          }
        }
        return out;
      };
      let duplicateFound = false;
      try {
        if (savedFiles.length > 0) {
          const cacheDir = join(uploadsDir, "_meta");
          if (!existsSync(cacheDir)) await mkdir(cacheDir, { recursive: true });
          for (const f of savedFiles) {
            try {
              const p = join(uploadsDir, f);
              console.log(`Running dcmdump on: ${p}`);
              const { stdout } = await execAsync(`dcmdump "${p}"`);
              const parsed = parseKeyFields(stdout);
              keyMeta = prefer(keyMeta, parsed);
              // Duplicate check using SOP Instance UID if available
              if (parsed?.sopInstanceUID) {
                const exists = await ImageHistory.findOne({
                  userId,
                  "metadata.sopInstanceUID": parsed.sopInstanceUID,
                });
                if (exists) duplicateFound = true;
              }
              // cache JSON for each dicom so later requests are instant
              await writeFile(
                join(cacheDir, `${f}.json`),
                Buffer.from(JSON.stringify(parsed, null, 2))
              );
              console.log(`Cached metadata for: ${f}`);
            } catch (e) {
              console.error(
                `Failed to parse/cache ${f}:`,
                (e as any)?.message || e
              );
            }
          }
        }
      } catch (metaError) {
        console.error("Metadata extraction error:", metaError);
      }

      if (duplicateFound) {
        return NextResponse.json(
          { duplicate: true, message: "Image already exists" },
          { status: 409 }
        );
      }

      // Save a single grouped history entry for the ZIP, include key metadata
      const historyEntry = new ImageHistory({
        userId,
        filename: zipFilename,
        action: "uploaded",
        metadata: {
          zip: true,
          fileCount: savedFiles.length,
          files: savedFiles,
          ...keyMeta,
        },
        createdAt: new Date(),
      });
      await historyEntry.save();

      // Also write a cache JSON under the ZIP filename for stable lookup in history
      try {
        const cacheDir = join(uploadsDir, "_meta");
        if (!existsSync(cacheDir)) await mkdir(cacheDir, { recursive: true });
        await writeFile(
          join(cacheDir, `${zipFilename}.json`),
          Buffer.from(JSON.stringify(keyMeta, null, 2))
        );
        console.log(`Cached metadata for ZIP: ${zipFilename}`);
      } catch (zipCacheError) {
        console.error("ZIP cache write error:", zipCacheError);
      }

      return NextResponse.json(
        {
          message: "ZIP processed",
          files: savedFiles,
          zipFile: zipFilename,
          metadata: keyMeta,
        },
        { status: 200 }
      );
    }

    // Case 2: Raw DICOM with or without extension
    if (!isDicomBuffer(buffer)) {
      return NextResponse.json(
        { error: "Uploaded file is not a valid DICOM" },
        { status: 400 }
      );
    }

    // Generate unique filename
    const timestamp = Date.now();
    const baseName = file.name || "dicom";
    const filename = `${timestamp}_${
      baseName.endsWith(".dcm") ? baseName : baseName + ".dcm"
    }`;
    const filepath = join(uploadsDir, filename);
    await writeFile(filepath, buffer);

    // Extract key metadata and cache immediately
    let keyMeta: any = {};
    try {
      console.log(`Running dcmdump on: ${filepath}`);
      const { stdout } = await execAsync(`dcmdump "${filepath}"`);
      keyMeta = parseKeyFields(stdout);
      console.log(`Extracted metadata:`, keyMeta);

      // Duplicate check by SOP Instance UID if available
      if (keyMeta?.sopInstanceUID) {
        const exists = await ImageHistory.findOne({
          userId,
          "metadata.sopInstanceUID": keyMeta.sopInstanceUID,
        });
        if (exists) {
          return NextResponse.json(
            { duplicate: true, message: "Image already exists" },
            { status: 409 }
          );
        }
      }

      try {
        const cacheDir = join(uploadsDir, "_meta");
        if (!existsSync(cacheDir)) await mkdir(cacheDir, { recursive: true });
        await writeFile(
          join(cacheDir, `${filename}.json`),
          Buffer.from(JSON.stringify(keyMeta, null, 2))
        );
        console.log(`Cached metadata for: ${filename}`);
      } catch (cacheError) {
        console.error("Cache write error:", cacheError);
      }
    } catch (metaError) {
      console.error("Metadata extraction error:", metaError);
    }

    // Save history entry for uploaded file with key metadata
    const historyEntry = new ImageHistory({
      userId,
      filename,
      action: "uploaded",
      metadata: { ...keyMeta },
      createdAt: new Date(),
    });
    await historyEntry.save();

    return NextResponse.json(
      {
        message: "File uploaded successfully",
        filename: filename,
        filepath: filepath,
        size: file.size,
        type: file.type,
        metadata: keyMeta,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
