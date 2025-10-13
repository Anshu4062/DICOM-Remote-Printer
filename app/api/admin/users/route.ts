import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  try {
    await dbConnect();
    const users = await User.find(
      {},
      {
        name: 1,
        email: 1,
        role: 1,
        createdAt: 1,
        updatedAt: 1,
      }
    )
      .sort({ createdAt: -1 })
      .lean();

    const safe = users.map((u: any) => ({
      id: String(u._id),
      name: u.name,
      email: u.email,
      role: u.role || "user",
      createdAt: u.createdAt,
    }));

    return NextResponse.json({ success: true, users: safe }, { status: 200 });
  } catch (err) {
    console.error("[ADMIN USERS] Error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to load users" },
      { status: 500 }
    );
  }
}
