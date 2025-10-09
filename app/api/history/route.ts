import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ImageHistory from "@/models/ImageHistory";
import { exec } from "child_process";
import { promisify } from "util";

export const runtime = "nodejs";

// Get image history for a user
export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    let history = await ImageHistory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50); // Limit to last 50 entries

    // Attach cached JSON if available to ensure stable fields on first load
    try {
      const { join } = await import("path");
      const { existsSync, readFileSync, mkdirSync, writeFileSync } =
        await import("fs");
      const execAsync = promisify(exec);
      const parseKeyFields = (stdout: string) => {
        const pickFirstNonEmpty = (tag: string) => {
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
          studyId: pickFirstNonEmpty("0020,0010"),
          accessionNumber: pickFirstNonEmpty("0008,0050"),
          referringPhysicianName: pickFirstNonEmpty("0008,0090"),
        } as any;
      };
      const baseDir = join(process.cwd(), "uploads", userId as string);
      const cacheDir = join(baseDir, "_meta");
      history = history.map((h: any) => {
        // Try both the entry filename and, if a ZIP, the first extracted DICOM
        const mergePrefer = (current: any, incoming: any) => {
          const out: any = { ...current };
          for (const [k, v] of Object.entries(incoming || {})) {
            if (out[k] === undefined || out[k] === "-") out[k] = v;
          }
          return out;
        };

        const primaryPath = join(cacheDir, `${h.filename}.json`);
        if (existsSync(primaryPath)) {
          try {
            const cached = JSON.parse(readFileSync(primaryPath, "utf8"));
            h.metadata = mergePrefer(h.metadata || {}, cached || {});
          } catch {}
        }
        // If a ZIP, walk all file caches and merge to fill gaps
        if (h?.metadata?.zip && Array.isArray(h?.metadata?.files)) {
          for (const f of h.metadata.files) {
            const p = join(cacheDir, `${f}.json`);
            if (existsSync(p)) {
              try {
                const cached = JSON.parse(readFileSync(p, "utf8"));
                h.metadata = mergePrefer(h.metadata || {}, cached || {});
              } catch {}
            }
          }
        }
        return h;
      });

      // If still missing key identifiers, compute for up to 10 entries now and cache
      const toFill = history
        .filter(
          (h: any) =>
            !h.metadata?.studyInstanceUID ||
            !h.metadata?.seriesInstanceUID ||
            !h.metadata?.studyId
        )
        .slice(0, 10);
      for (const h of toFill) {
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
            // ensure cache dir exists and write under both keys
            if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
            try {
              writeFileSync(
                join(cacheDir, `${targetFile}.json`),
                JSON.stringify(key, null, 2)
              );
            } catch {}
            try {
              writeFileSync(
                join(cacheDir, `${h.filename}.json`),
                JSON.stringify(key, null, 2)
              );
            } catch {}
          }
        } catch {}
      }
    } catch {}

    // Ensure deterministic order and JSON-only metadata for client rendering
    const sanitized = history.map((h: any) => ({
      _id: String(h._id),
      userId: String(h.userId),
      filename: h.filename,
      action: h.action,
      metadata: h.metadata || {},
      endpoint: h.endpoint || undefined,
      createdAt: h.createdAt,
    }));

    return NextResponse.json({ success: true, history: sanitized });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to fetch history" },
      { status: 500 }
    );
  }
}

// Add new entry to image history
export async function POST(req: NextRequest) {
  try {
    await dbConnect();

    const { userId, filename, action, metadata, endpoint } = await req.json();

    if (!userId || !filename || !action) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const historyEntry = new ImageHistory({
      userId,
      filename,
      action, // 'uploaded' | 'sent' | 'received'
      metadata: metadata || {},
      endpoint: endpoint || null,
      createdAt: new Date(),
    });

    await historyEntry.save();

    // Persist a per-file metadata JSON cache for faster loads
    try {
      const { join } = await import("path");
      const { existsSync, mkdirSync, writeFileSync } = await import("fs");
      const baseDir = join(process.cwd(), "uploads", userId);
      const cacheDir = join(baseDir, "_meta");
      if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
      const cachePath = join(cacheDir, `${filename}.json`);
      writeFileSync(cachePath, JSON.stringify(metadata || {}, null, 2));
    } catch {}

    return NextResponse.json({ success: true, entry: historyEntry });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to save history" },
      { status: 500 }
    );
  }
}

// Delete a single history entry and associated files/cache
export async function DELETE(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const id = searchParams.get("id");
    const clearAll = searchParams.get("all") === "true";
    if (!userId || !id) {
      if (clearAll && userId) {
        // Bulk delete all history docs and remove all files for this user
        const { join } = await import("path");
        const { rmSync, existsSync } = await import("fs");
        await ImageHistory.deleteMany({ userId });
        try {
          const uploadsDir = join(process.cwd(), "uploads", userId);
          if (existsSync(uploadsDir))
            rmSync(uploadsDir, { recursive: true, force: true });
        } catch {}
        try {
          const receivesDir = join(process.cwd(), "receives", userId);
          if (existsSync(receivesDir))
            rmSync(receivesDir, { recursive: true, force: true });
        } catch {}
        return NextResponse.json({ success: true, cleared: true });
      }
      return NextResponse.json(
        { error: "Missing userId or id" },
        { status: 400 }
      );
    }

    const entry = await ImageHistory.findOne({ _id: id, userId });
    if (!entry) {
      return NextResponse.json({ error: "History not found" }, { status: 404 });
    }

    const { join } = await import("path");
    const { existsSync, unlinkSync, rmdirSync, readdirSync } = await import(
      "fs"
    );

    // Delete primary file
    const uploadsDir = join(process.cwd(), "uploads", userId);
    const filePath = join(uploadsDir, entry.filename);
    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath);
      } catch {}
    }

    // If a ZIP upload, also delete extracted files listed in metadata
    if (entry?.metadata?.zip && Array.isArray(entry?.metadata?.files)) {
      for (const f of entry.metadata.files) {
        const p = join(uploadsDir, f);
        if (existsSync(p)) {
          try {
            unlinkSync(p);
          } catch {}
        }
      }
    }

    // Delete JSON caches for filename and any extracted file
    const cacheDir = join(uploadsDir, "_meta");
    const cachePaths = [join(cacheDir, `${entry.filename}.json`)];
    if (entry?.metadata?.files) {
      for (const f of entry.metadata.files) {
        cachePaths.push(join(cacheDir, `${f}.json`));
      }
    }
    for (const cp of cachePaths) {
      if (existsSync(cp)) {
        try {
          unlinkSync(cp);
        } catch {}
      }
    }

    // Remove the history document
    await ImageHistory.deleteOne({ _id: id, userId });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to delete history" },
      { status: 500 }
    );
  }
}
