import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import UserSettings from "@/models/UserSettings";

export const runtime = "nodejs";

// GET /api/admin/user-settings?userId=...
export async function GET(req: NextRequest) {
  try {
    await dbConnect();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Missing userId" },
        { status: 400 }
      );
    }
    const doc = await UserSettings.findOne({ userId }).lean();
    return NextResponse.json(
      { success: true, settings: doc || null },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed" },
      { status: 500 }
    );
  }
}

// POST /api/admin/user-settings
// { userId, endpointId?, settings }
export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const body = await req.json();
    const { userId, endpointId = null, settings = {} } = body || {};
    if (!userId) {
      return NextResponse.json(
        { success: false, error: "Missing userId" },
        { status: 400 }
      );
    }
    const updated = await UserSettings.findOneAndUpdate(
      { userId },
      { userId, endpointId, settings },
      { upsert: true, new: true, runValidators: true }
    );
    return NextResponse.json(
      { success: true, settings: updated },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message || "Failed" },
      { status: 500 }
    );
  }
}
