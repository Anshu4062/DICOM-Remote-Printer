import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync } from "fs";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
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

    // Build storescu command to send all files in user's upload directory (recursively)
    // Requires DCMTK storescu to be available in PATH
    const targetPath =
      process.platform === "win32" ? `"${uploadDir}"` : uploadDir;
    const args = [
      "-aet",
      callingAET,
      "-aec",
      calledAET,
      "-v", // verbose output
      "-nh", // do not halt on unsuccessful store
      host,
      String(port),
      "+sd",
      "+r",
      targetPath,
    ];

    // Try to run `storescu` from PATH
    const child = spawn("storescu", args, {
      shell: process.platform === "win32",
    });

    let stdout = "";
    let stderr = "";
    let spawnErr: any = null;

    await new Promise<void>((resolve) => {
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", (e) => {
        spawnErr = e;
      });
      child.on("close", () => resolve());
    });

    if (spawnErr) {
      return NextResponse.json(
        {
          error: `Failed to run storescu: ${spawnErr.message}`,
          stdout,
          stderr,
        },
        { status: 500 }
      );
    }

    const status = child.exitCode ?? 0;
    if (status !== 0) {
      return NextResponse.json(
        { error: `storescu exited with code ${status}`, stdout, stderr },
        { status: 500 }
      );
    }

    return NextResponse.json({ status, stdout, stderr });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to send via storescu" },
      { status: 500 }
    );
  }
}
