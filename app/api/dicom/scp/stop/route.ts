import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";

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
    if (!record) return NextResponse.json({ running: false });

    try {
      process.kill(record.pid);
    } catch {}
    reg.delete(userId);
    // Additionally, ensure any lingering storescp processes are terminated (e.g., orphaned instances)
    await new Promise<void>((resolve) => {
      const cmd =
        process.platform === "win32"
          ? "taskkill /IM storescp.exe /F /T"
          : "pkill -f storescp || true";
      exec(cmd, () => resolve());
    });
    return NextResponse.json({ running: false });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to stop SCP" },
      { status: 500 }
    );
  }
}
