import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import DicomEndpoint from "@/models/DicomEndpoint";

export const runtime = "nodejs";

export async function GET() {
  try {
    await dbConnect();
    const eps = await DicomEndpoint.find({}).sort({ createdAt: -1 }).lean();
    return NextResponse.json(
      { success: true, endpoints: eps },
      { status: 200 }
    );
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Failed" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, calledAET, host, port } = body || {};
    if (!name || !calledAET || !host || !port) {
      return NextResponse.json(
        { success: false, error: "Missing fields" },
        { status: 400 }
      );
    }
    await dbConnect();
    const created = await DicomEndpoint.create({ name, calledAET, host, port });
    return NextResponse.json(
      { success: true, endpoint: created },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body || {};
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing id" },
        { status: 400 }
      );
    }
    await dbConnect();
    await DicomEndpoint.findByIdAndDelete(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Failed" },
      { status: 500 }
    );
  }
}
