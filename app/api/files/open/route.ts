import { NextRequest, NextResponse } from "next/server";
import { join, normalize } from "path";
import { existsSync, statSync } from "fs";
import { exec } from "child_process";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { userId, scope, relDir } = await req.json();
    if (!userId || !scope)
      return NextResponse.json({ error: "Missing params" }, { status: 400 });

    const base =
      scope === "received"
        ? join(process.cwd(), "receives", userId)
        : join(process.cwd(), "uploads", userId);

    const targetDir = normalize(join(base, relDir || ""));
    if (!targetDir.startsWith(base)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    const pathToOpen =
      existsSync(targetDir) && statSync(targetDir).isDirectory()
        ? targetDir
        : base;

    if (process.platform === "win32") {
      // PowerShell sequence: open → bring to front (no fullscreen)
      const psSafe = pathToOpen.replace(/'/g, "''");
      const ps =
        `powershell -NoProfile -WindowStyle Hidden -Command "` +
        `Start-Process explorer.exe '${psSafe}'; ` +
        `Start-Sleep -Seconds 1; ` +
        `$wshell = New-Object -ComObject wscript.shell; ` +
        `$null = $wshell.AppActivate('File Explorer')` +
        `"`;
      exec(ps);
    } else {
      const openCmd =
        process.platform === "darwin"
          ? `open "${pathToOpen}"`
          : `xdg-open "${pathToOpen}"`;
      exec(openCmd);
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to open folder" },
      { status: 500 }
    );
  }
}
