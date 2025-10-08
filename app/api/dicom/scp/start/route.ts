import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { mkdirSync, existsSync } from "fs";

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
    const { userId, aeTitle, port } = await req.json();
    if (!userId)
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    const ae = (aeTitle || "RECEIVER").toString();
    const p = Number(port) || 11112;

    const reg = getRegistry();
    if (reg.has(userId)) {
      const existing = reg.get(userId)!;
      return NextResponse.json({
        running: true,
        pid: existing.pid,
        outDir: existing.outDir,
        ae: existing.ae,
        port: existing.port,
      });
    }

    const outDir = join(process.cwd(), "receives", userId);
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

    const args = ["-v", "-aet", ae, "-od", outDir, String(p)];
    const candidateBinaries: string[] = [];
    if (process.platform === "win32") {
      candidateBinaries.push(
        process.env.DCMTK_STORESCP || "storescp.exe",
        "storescp",
        "C\\\\ProgramData\\\\chocolatey\\\\bin\\\\storescp.exe",
        "C\\\\Program Files\\\\dcmtk\\\\bin\\\\storescp.exe",
        "C\\\\Program Files (x86)\\\\dcmtk\\\\bin\\\\storescp.exe",
        "C\\\\dcmtk\\\\bin\\\\storescp.exe"
      );
    } else {
      candidateBinaries.push(process.env.DCMTK_STORESCP || "storescp");
    }

    let child = spawn(candidateBinaries[0], args, { shell: false });
    let usedBinary = candidateBinaries[0];

    // If ENOENT, try fallbacks (other paths and with shell=true)
    await new Promise<void>((resolve) => {
      let settled = false;
      const tryNext = (idx: number) => {
        if (settled) return;
        if (idx >= candidateBinaries.length) {
          // last resort: try through shell PATH
          child = spawn("storescp", args, { shell: true });
          usedBinary = "storescp (shell)";
          settled = true;
          resolve();
          return;
        }
        const bin = candidateBinaries[idx];
        child = spawn(bin, args, { shell: false });
        usedBinary = bin;
        let tried = false;
        child.once("error", (err: any) => {
          if (tried) return;
          tried = true;
          if (err && err.code === "ENOENT") {
            tryNext(idx + 1);
          } else {
            settled = true;
            resolve();
          }
        });
        // Give a tick for spawn error if any
        setTimeout(() => {
          if (!tried && child.pid) {
            settled = true;
            resolve();
          }
        }, 50);
      };
      tryNext(0);
    });

    // Capture a short burst of startup logs so UI can confirm launch
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      // also keep rolling logs in registry if stored later
    });
    child.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
    });

    // Wait a brief moment to ensure it started
    await new Promise((r) => setTimeout(r, 400));

    if (!child.pid) {
      return NextResponse.json(
        { error: "Failed to start storescp" },
        { status: 500 }
      );
    }

    const command = `storescp ${args
      .map((a) => (/\s/.test(a) ? `"${a}"` : a))
      .join(" ")}`;
    // Store in registry along with rolling logs and command
    const initialLogs = stdout || stderr;
    reg.set(userId, {
      pid: child.pid,
      outDir,
      ae,
      port: p,
      command,
      logs: initialLogs,
    });

    // Continue appending to the in-memory log buffer for later status fetches
    child.stdout.on("data", (d) => {
      const entry = reg.get(userId);
      if (entry) entry.logs = (entry.logs || "") + d.toString();
    });
    child.stderr.on("data", (d) => {
      const entry = reg.get(userId);
      if (entry) entry.logs = (entry.logs || "") + d.toString();
    });

    // Emit to server console for visibility
    console.log(`[storescp] started pid=${child.pid} cmd=${command}`);
    if (initialLogs) console.log(`[storescp] startup logs:\n${initialLogs}`);

    return NextResponse.json({
      running: true,
      pid: child.pid,
      outDir,
      ae,
      port: p,
      command,
      logs: stdout || stderr,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to start SCP" },
      { status: 500 }
    );
  }
}
