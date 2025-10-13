import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

// Ensure Node.js runtime (bcrypt/jsonwebtoken are not Edge-compatible)
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    console.log("[REGISTER] Incoming request");
    const { name, email, password } = await request.json();
    console.log("[REGISTER] Payload received", {
      namePresent: !!name,
      emailPresent: !!email,
      passwordPresent: !!password,
    });

    // Validate input
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    console.log("[REGISTER] Connecting to database...");
    await dbConnect();
    console.log("[REGISTER] DB connected");

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    console.log("[REGISTER] Existing user?", !!existingUser);
    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists with this email" },
        { status: 400 }
      );
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    console.log("[REGISTER] Password hashed");

    // Create user
    // Prevent users from registering the reserved admin username
    if (email?.toLowerCase() === "admin") {
      return NextResponse.json(
        { error: "'admin' is a reserved username" },
        { status: 400 }
      );
    }
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      // Elevate to admin if the special email is used
      role: email.toLowerCase() === "admin@user.com" ? "admin" : "user",
    });
    console.log("[REGISTER] User created", { userId: user._id });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );
    console.log("[REGISTER] Token generated");

    const response = NextResponse.json(
      {
        message: "User created successfully",
        token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 }
    );

    // Also set an HTTP-only cookie for middleware-based protection
    response.cookies.set("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });
    console.log("[REGISTER] Cookie set, responding 201");

    return response;
  } catch (error) {
    console.error("[REGISTER] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
