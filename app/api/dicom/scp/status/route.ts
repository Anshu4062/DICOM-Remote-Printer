import { NextRequest, NextResponse } from "next/server";
import { join } from "path";
import { existsSync, readdirSync } from "fs";

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
      // DCMTK storescp often writes files without an extension (e.g., DX..., PDF...)
      // Show all files, excluding obvious temp fragments
      files = readdirSync(outDir).filter(
        (f) => !f.endsWith(".tmp") && !f.endsWith(".part")
      );
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
