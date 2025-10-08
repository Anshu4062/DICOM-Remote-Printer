import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join, extname } from "path";
import { existsSync } from "fs";
import JSZip from "jszip";
import dbConnect from "@/lib/mongodb";
import ImageHistory from "@/models/ImageHistory";

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

      // Save a single grouped history entry for the ZIP
      const historyEntry = new ImageHistory({
        userId,
        filename: file.name || "upload.zip",
        action: "uploaded",
        metadata: {
          zip: true,
          fileCount: savedFiles.length,
          files: savedFiles,
        },
        createdAt: new Date(),
      });
      await historyEntry.save();

      return NextResponse.json(
        { message: "ZIP processed", files: savedFiles },
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

    // Save history entry for uploaded file
    const historyEntry = new ImageHistory({
      userId,
      filename,
      action: "uploaded",
      metadata: {},
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
