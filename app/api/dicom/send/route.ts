import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync, readdirSync } from "fs";
import dbConnect from "@/lib/mongodb";
import ImageHistory from "@/models/ImageHistory";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const { userId, callingAET, calledAET, host, port } = await req.json();

    if (!userId || !callingAET || !calledAET || !host || !port) {
      return NextResponse.json(
        { error: "Missing parameters" },
        { status: 400 }
      );
    }

    const uploadDir = join(process.cwd(), "uploads", userId);
    if (!existsSync(uploadDir)) {
      return NextResponse.json(
        { error: "No uploaded files found for this user" },
        { status: 404 }
      );
    }
    // Determine exactly which files to send: use the most recent 'uploaded' entry's files
    const latestUpload: any = await ImageHistory.findOne({
      userId,
      action: "uploaded",
    })
      .sort({ createdAt: -1 })
      .lean();

    let filesToSend: string[] = [];
    if (
      latestUpload?.metadata?.files &&
      Array.isArray(latestUpload.metadata.files)
    ) {
      filesToSend = latestUpload.metadata.files as string[];
    } else if (latestUpload?.filename) {
      // Fallback to the single file name
      filesToSend = [latestUpload.filename];
    } else {
      // As a last resort, send nothing and ask user to upload first
      return NextResponse.json(
        { error: "No recent upload found to send. Please upload first." },
        { status: 404 }
      );
    }

    // Map to absolute paths and filter out missing or non-DICOM/zip artifacts
    const filePaths = filesToSend
      .map((f) => join(uploadDir, f))
      .filter((p) => existsSync(p));
    if (filePaths.length === 0) {
      return NextResponse.json(
        { error: "Selected files not found on disk. Please re-upload." },
        { status: 404 }
      );
    }

    // Some DCMTK versions (e.g., 3.6.9) don't support --read-from-stdin.
    // To avoid Windows command-length limits, send in batches.
    const batchSize = 20;
    let stdout = "";
    let stderr = "";
    for (let i = 0; i < filePaths.length; i += batchSize) {
      const batch = filePaths.slice(i, i + batchSize);
      const args = [
        "-aet",
        callingAET,
        "-aec",
        calledAET,
        "-v",
        "-nh",
        host,
        String(port),
        ...batch,
      ];

      const child = spawn("storescu", args, {
        shell: false,
      });

      let spawnErr: any = null;
      await new Promise<void>((resolve) => {
        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        child.on("error", (e) => {
          spawnErr = e;
        });
        child.on("close", (code) => {
          if (typeof code === "number" && code !== 0) {
            spawnErr = new Error(`storescu exited with code ${code}`);
          }
          resolve();
        });
      });

      if (spawnErr) {
        return NextResponse.json(
          {
            error: `Failed to run storescu: ${spawnErr.message}`,
            stdout,
            stderr,
            batchStart: i,
            batchEnd: Math.min(i + batchSize, filePaths.length),
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ status: 0, stdout, stderr });

    // Save history entries for sent files
    const endpoint = { callingAET, calledAET, host, port };
    for (const absPath of filePaths) {
      const filename = absPath.split(/\\|\//).pop() as string;
      const historyEntry = new ImageHistory({
        userId,
        filename,
        action: "sent",
        metadata: {},
        endpoint,
        createdAt: new Date(),
      });
      await historyEntry.save();
    }

    return NextResponse.json({ status, stdout, stderr });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to send via storescu" },
      { status: 500 }
    );
  }
}
