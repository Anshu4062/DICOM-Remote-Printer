import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { existsSync, readdirSync, statSync } from "fs";

export const runtime = "nodejs";

declare global {
  // eslint-disable-next-line no-var
  var __SCP_REGISTRY__:
    | Map<
        string,
        {
          pid: number;
          outDir: string;
          ae: string;
          port: number;
          command?: string;
          logs?: string;
        }
      >
    | undefined;
}

function getRegistry() {
  if (!global.__SCP_REGISTRY__) global.__SCP_REGISTRY__ = new Map();
  return global.__SCP_REGISTRY__;
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();
    if (!userId)
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    const reg = getRegistry();
    const record = reg.get(userId);

    let files: string[] = [];
    let outDir = record?.outDir || join(process.cwd(), "receives", userId);
    if (existsSync(outDir)) {
      // Best-effort: organize any files left flat in the user root into Year/Month/Day/Patient/StudyUID
      try {
        const { promisify } = await import("util");
        const { exec } = await import("child_process");
        const execAsync = promisify(exec);
        const { readdirSync, statSync, mkdirSync, renameSync } = await import(
          "fs"
        );
        const monthNames = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];
        const items = readdirSync(outDir);
        for (const item of items) {
          const p = join(outDir, item);
          const st = statSync(p);
          if (st.isDirectory()) continue; // only organize loose files
          if (
            item.endsWith(".tmp") ||
            item.endsWith(".part") ||
            item.endsWith(".json")
          )
            continue;
          try {
            const { stdout } = await execAsync(`dcmdump "${p}"`);
            const studyUIDMatch = stdout.match(
              /\(0020,000d\)\s+UI\s+\[([^\]]+)\]/i
            );
            const patientNameMatch = stdout.match(
              /\(0010,0010\)\s+PN\s+\[([^\]]*)\]/i
            );
            if (studyUIDMatch && studyUIDMatch[1]) {
              const now = new Date();
              const year = String(now.getFullYear());
              const month = monthNames[now.getMonth()];
              const day = String(now.getDate()).padStart(2, "0");
              const raw = (
                patientNameMatch && patientNameMatch[1]
                  ? patientNameMatch[1]
                  : "Unknown"
              ).trim();
              const safePatient =
                raw.replace(/[\\/:*?"<>|]/g, "_") || "Unknown";
              const studyUID = studyUIDMatch[1].trim();
              const destDir = join(
                outDir,
                year,
                month,
                day,
                safePatient,
                studyUID
              );
              if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
              const newPath = join(destDir, item);
              renameSync(p, newPath);
            }
          } catch {}
        }
      } catch {}

      // Collect files from nested structure, skipping _meta and json
      const collectFiles = (dir: string, prefix = ""): string[] => {
        const result: string[] = [];
        try {
          const items = readdirSync(dir);
          for (const item of items) {
            const itemPath = join(dir, item);
            const stats = statSync(itemPath);

            if (stats.isDirectory()) {
              // Skip metadata cache folders
              if (item === "_meta") continue;
              // Recursively collect files from subdirectories
              result.push(...collectFiles(itemPath, prefix + item + "/"));
            } else if (
              !item.endsWith(".tmp") &&
              !item.endsWith(".part") &&
              !item.endsWith(".json")
            ) {
              // Add file with its path prefix, skip json caches
              result.push(prefix + item);
            }
          }
        } catch (error) {
          console.error(`Error reading directory ${dir}:`, error);
        }
        return result;
      };

      files = collectFiles(outDir);
    }
    return NextResponse.json({
      running: !!record,
      ae: record?.ae,
      port: record?.port,
      outDir,
      files,
      pid: record?.pid,
      command: record?.command,
      logs: record?.logs,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to get status" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId)
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    const reg = getRegistry();
    const record = reg.get(userId);
    const outDir = record?.outDir || join(process.cwd(), "receives", userId);
    // Remove directory contents if present
    const fs = await import("fs/promises");
    // Clear contents of outDir but keep the directory itself
    try {
      const entries = await fs.readdir(outDir, { withFileTypes: true });
      await Promise.all(
        entries.map(async (ent) => {
          const p = join(outDir, ent.name);
          try {
            if (ent.isDirectory()) {
              await fs.rm(p, { recursive: true, force: true });
            } else {
              await fs.rm(p, { force: true });
            }
          } catch {}
        })
      );
    } catch {}
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to clear received files" },
      { status: 500 }
    );
  }
}
