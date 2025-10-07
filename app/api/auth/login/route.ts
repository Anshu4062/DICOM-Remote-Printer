import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

// Ensure Node.js runtime (bcrypt/jsonwebtoken are not Edge-compatible)
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    console.log("[LOGIN] Incoming request");
    const { email, password } = await request.json();
    console.log("[LOGIN] Payload received", {
      emailPresent: !!email,
      passwordPresent: !!password,
    });

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    console.log("[LOGIN] Connecting to database...");
    await dbConnect();
    console.log("[LOGIN] DB connected");

    // Find user
    const user = await User.findOne({ email });
    console.log("[LOGIN] User lookup result", { found: !!user });
    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log("[LOGIN] Password match?", isPasswordValid);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );
    console.log("[LOGIN] Token generated");

    const response = NextResponse.json(
      {
        message: "Login successful",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
        },
      },
      { status: 200 }
    );

    // Also set an HTTP-only cookie for middleware-based protection
    response.cookies.set("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    console.log("[LOGIN] Cookie set, responding 200");

    return response;
  } catch (error) {
    console.error("[LOGIN] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
