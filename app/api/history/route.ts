import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ImageHistory from "@/models/ImageHistory";

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

    const history = await ImageHistory.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50); // Limit to last 50 entries

    return NextResponse.json({ success: true, history });
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

    return NextResponse.json({ success: true, entry: historyEntry });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to save history" },
      { status: 500 }
    );
  }
}
