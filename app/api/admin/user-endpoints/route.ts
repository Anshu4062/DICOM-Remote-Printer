import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import UserEndpoint from "@/models/UserEndpoint";
import DicomEndpoint from "@/models/DicomEndpoint";

export const runtime = "nodejs";

// GET /api/admin/user-endpoints?userId=...
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  try {
    await dbConnect();
    if (userId) {
      const links = await UserEndpoint.find({ userId }).lean();
      const endpoints = await DicomEndpoint.find({
        _id: { $in: links.map((l: any) => l.endpointId) },
      }).lean();
      return NextResponse.json({ success: true, endpoints }, { status: 200 });
    }
    // When no userId provided, return all assignments: { userId, endpointId }
    const links = await UserEndpoint.find({}).lean();
    return NextResponse.json({ success: true, links }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Failed" },
      { status: 500 }
    );
  }
}

// POST body: { userId, endpointId }
export async function POST(req: NextRequest) {
  try {
    const { userId, endpointId } = await req.json();
    if (!userId || !endpointId) {
      return NextResponse.json(
        { success: false, error: "userId and endpointId required" },
        { status: 400 }
      );
    }
    await dbConnect();
    await UserEndpoint.updateOne(
      { userId, endpointId },
      {},
      { upsert: true, setDefaultsOnInsert: true }
    );
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Failed" },
      { status: 500 }
    );
  }
}

// DELETE body: { userId, endpointId }
export async function DELETE(req: NextRequest) {
  try {
    const { userId, endpointId } = await req.json();
    if (!userId || !endpointId) {
      return NextResponse.json(
        { success: false, error: "userId and endpointId required" },
        { status: 400 }
      );
    }
    await dbConnect();
    await UserEndpoint.deleteOne({ userId, endpointId });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Failed" },
      { status: 500 }
    );
  }
}
