import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { existsSync } from "fs";
import JSZip from "jszip";
import dbConnect from "@/lib/mongodb";
import ImageHistory from "@/models/ImageHistory";
import UserSettings from "@/models/UserSettings";
import { Types } from "mongoose";
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

    // Fetch user anonymization settings
    const getUserSettings = async (userId: string) => {
      try {
        const settings = await UserSettings.findOne({
          userId: new Types.ObjectId(userId),
        }).lean();
        return (settings as any)?.settings || {};
      } catch (error) {
        console.error("Failed to fetch user settings:", error);
        return {};
      }
    };

    // Compute the next Sequence Name label for this user given a base prefix
    const getNextSequenceLabel = async (userId: string, basePrefix: string) => {
      const escapeRegex = (s: string) =>
        s.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
      const pattern = `^${escapeRegex(basePrefix)}\\d*$`;
      const count = await ImageHistory.countDocuments({
        userId,
        "metadata.sequenceName": { $regex: pattern, $options: "i" },
      });
      return count >= 1 ? `${basePrefix}${count + 1}` : basePrefix;
    };

    // Apply anonymization to DICOM file using dcmodify
    const anonymizeDicomFile = async (
      filePath: string,
      settings: any,
      filename: string,
      sequenceLabel: string
    ) => {
      const prefix =
        sequenceLabel || (settings && settings.customPrefix) || "***";

      const tags: string[] = ["(0018,0024)"]; // Sequence Name always
      if (settings?.anonymizePatientName) tags.push("(0010,0010)");
      if (settings?.anonymizePatientId) tags.push("(0010,0020)");
      if (settings?.anonymizeInstitutionName)
        tags.push("(0008,0080)", "(0008,1040)");
      if (settings?.anonymizeInstitutionAddress) tags.push("(0008,1010)");
      if (settings?.anonymizeReferringPhysician) tags.push("(0008,0090)");
      if (settings?.anonymizeAccessionNumber) tags.push("(0008,0050)");

      const runForTag = async (tag: string) => {
        try {
          const cmd = `dcmodify --modify "${tag}=${prefix}" "${filePath}"`;
          console.log(`Anonymizing DICOM: ${cmd}`);
          await execAsync(cmd);
        } catch (e) {
          console.warn(`modify failed for ${tag}, trying insert`);
          try {
            const cmd2 = `dcmodify --insert "${tag}=${prefix}" "${filePath}"`;
            console.log(`Anonymizing DICOM (insert): ${cmd2}`);
            await execAsync(cmd2);
          } catch (e2) {
            console.error(`Failed to set ${tag} on ${filename}:`, e2);
          }
        }
      };

      for (const t of tags) {
        await runForTag(t);
      }

      console.log(`Successfully anonymized: ${filename}`);
      return filePath;
    };

    // Apply anonymization to metadata object
    const anonymizeMetadata = (
      metadata: any,
      settings: any,
      filename: string,
      sequenceLabel: string
    ) => {
      const anonymized = { ...metadata };
      const prefix =
        sequenceLabel || (settings && settings.customPrefix) || "***";

      // Always set Sequence Name in cached metadata too
      anonymized.sequenceName = prefix;

      if (!settings || Object.keys(settings).length === 0) {
        return anonymized;
      }

      if (settings.anonymizePatientName) {
        anonymized.patientName = prefix;
      }
      if (settings.anonymizePatientId) {
        anonymized.patientId = prefix;
      }
      if (settings.anonymizeInstitutionName) {
        anonymized.institutionName = prefix;
      }
      if (settings.anonymizeInstitutionAddress) {
        anonymized.stationName = prefix;
      }
      if (settings.anonymizeReferringPhysician) {
        anonymized.referringPhysicianName = prefix;
      }
      if (settings.anonymizeAccessionNumber) {
        anonymized.accessionNumber = prefix;
      }

      return anonymized;
    };

    const parseKeyFields = (stdout: string) => {
      // add sequenceName
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
        sequenceName: pickFirstNonEmpty("0018,0024"),
      } as any;
    };

    // Case 1: ZIP archive containing one or more DICOM files
    if (ext === ".zip" || file.type === "application/zip") {
      // Get user anonymization settings
      const userSettings = await getUserSettings(userId);
      const basePrefix =
        (userSettings?.customPrefix && userSettings.customPrefix.trim()) ||
        "***";
      const sequenceLabel = await getNextSequenceLabel(userId, basePrefix);

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

          // Apply anonymization to the DICOM file
          await anonymizeDicomFile(
            outPath,
            userSettings,
            outName,
            sequenceLabel
          );

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
          "sequenceName",
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
              const anonymizedParsed = anonymizeMetadata(
                parsed,
                userSettings,
                f,
                sequenceLabel
              );
              keyMeta = prefer(keyMeta, anonymizedParsed);
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
                Buffer.from(JSON.stringify(anonymizedParsed, null, 2))
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

    // Get user anonymization settings
    const userSettings = await getUserSettings(userId);
    const basePrefix =
      (userSettings?.customPrefix && userSettings.customPrefix.trim()) || "***";
    const sequenceLabel = await getNextSequenceLabel(userId, basePrefix);

    // Generate unique filename
    const timestamp = Date.now();
    const baseName = file.name || "dicom";
    const filename = `${timestamp}_${
      baseName.endsWith(".dcm") ? baseName : baseName + ".dcm"
    }`;
    const filepath = join(uploadsDir, filename);
    await writeFile(filepath, buffer);

    // Apply anonymization to the DICOM file
    await anonymizeDicomFile(filepath, userSettings, filename, sequenceLabel);

    // Extract key metadata and cache immediately
    let keyMeta: any = {};
    try {
      console.log(`Running dcmdump on: ${filepath}`);
      const { stdout } = await execAsync(`dcmdump "${filepath}"`);
      const parsed = parseKeyFields(stdout);
      keyMeta = anonymizeMetadata(
        parsed,
        userSettings,
        filename,
        sequenceLabel
      );
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

    // Additionally: auto-compress single DICOM into a ZIP for transport/display consistency
    try {
      const zip = new JSZip();
      const zipInnerName = filename;
      zip.file(zipInnerName, buffer);
      const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
      const zipFilename = `${timestamp}_${baseName.replace(
        /\.[^/.]+$/,
        ""
      )}.zip`;
      const zipFilepath = join(uploadsDir, zipFilename);
      await writeFile(zipFilepath, zipBuffer);

      // Record history as a grouped ZIP with one file
      const historyEntry = new ImageHistory({
        userId,
        filename: zipFilename,
        action: "uploaded",
        metadata: {
          zip: true,
          fileCount: 1,
          files: [filename],
          ...keyMeta,
        },
        createdAt: new Date(),
      });
      await historyEntry.save();

      // Cache metadata under both the dicom and the zip name
      try {
        const cacheDir = join(uploadsDir, "_meta");
        if (!existsSync(cacheDir)) await mkdir(cacheDir, { recursive: true });
        await writeFile(
          join(cacheDir, `${zipFilename}.json`),
          Buffer.from(JSON.stringify(keyMeta, null, 2))
        );
      } catch {}

      return NextResponse.json(
        {
          message: "File uploaded and compressed",
          filename: zipFilename,
          original: filename,
          zipFile: zipFilename,
          metadata: keyMeta,
        },
        { status: 200 }
      );
    } catch (e) {
      // Fallback: if zipping fails, still save plain entry
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
          message: "File uploaded successfully (zip failed)",
          filename: filename,
          filepath: filepath,
          size: file.size,
          type: file.type,
          metadata: keyMeta,
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
