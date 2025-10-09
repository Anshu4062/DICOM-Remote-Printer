import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ImageHistory from "@/models/ImageHistory";
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";

const execAsync = promisify(exec);

function parseKeyFields(stdout: string) {
  const pick = (tag: string) => {
    const re = new RegExp(
      `\\(${tag}\\)\\s+\\w+\\s+(?:=[^\\[]+\\s+)?\\[([^\\]]+)\\]`,
      "i"
    );
    const m = stdout.match(re);
    return m ? m[1].trim() : undefined;
  };
  return {
    patientName: pick("0010,0010"),
    patientId: pick("0010,0020"),
    patientSex: pick("0010,0040"),
    patientBirthDate: pick("0010,0030"),
    modality: pick("0008,0060"),
    studyDescription: pick("0008,1030"),
    institutionName: pick("0008,0080") || pick("0008,1010"),
    stationName: pick("0008,1010"),
    studyInstanceUID: pick("0020,000d"),
    seriesInstanceUID: pick("0020,000e"),
    studyId: pick("0020,0010"),
  } as any;
}

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const { userId, limit = 50 } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const entries = await ImageHistory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 50, 200));

    const baseDir = join(process.cwd(), "uploads", userId);
    const cacheDir = join(baseDir, "_meta");
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

    let processed = 0;
    for (const h of entries) {
      const needs =
        !h.metadata?.studyInstanceUID ||
        !h.metadata?.seriesInstanceUID ||
        !h.metadata?.studyId;
      if (!needs) continue;
      try {
        let targetFile = h.filename;
        if (
          h?.metadata?.zip &&
          Array.isArray(h.metadata.files) &&
          h.metadata.files.length
        ) {
          targetFile = h.metadata.files[0];
        }
        const dicomPath = join(baseDir, targetFile);
        if (!existsSync(dicomPath)) continue;
        const { stdout } = await execAsync(`dcmdump "${dicomPath}"`);
        const key = parseKeyFields(stdout);
        if (Object.keys(key).length) {
          h.metadata = { ...(h.metadata || {}), ...key };
          await h.save();
          // write cache for both the target file and the history filename
          try {
            writeFileSync(
              join(cacheDir, `${targetFile}.json`),
              JSON.stringify(key, null, 2)
            );
            writeFileSync(
              join(cacheDir, `${h.filename}.json`),
              JSON.stringify(key, null, 2)
            );
          } catch {}
          processed++;
        }
      } catch {}
    }

    return NextResponse.json({ success: true, processed });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to warm metadata" },
      { status: 500 }
    );
  }
}
