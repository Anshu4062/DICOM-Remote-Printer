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

    // Special admin backdoor: user "admin" with password "radshareadmin"
    if (email === "admin" && password === "radshareadmin") {
      await dbConnect();
      let admin = await User.findOne({ email: "admin" });
      if (!admin) {
        const bcryptjs = await import("bcryptjs");
        const hashed = await bcryptjs.default.hash(password, 12);
        admin = await User.create({
          name: "Administrator",
          email: "admin",
          password: hashed,
          role: "admin",
        });
      } else if (admin.role !== "admin") {
        admin.role = "admin" as any;
        await admin.save();
      }
      const token = jwt.sign(
        { userId: admin._id, email: admin.email, role: "admin" },
        process.env.JWT_SECRET!,
        { expiresIn: "7d" }
      );
      const response = NextResponse.json(
        {
          message: "Login successful",
          token,
          user: { id: admin._id, name: admin.name, email: admin.email, role: "admin" },
          admin: true,
        },
        { status: 200 }
      );
      response.cookies.set("token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      return response;
    }

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
      { userId: user._id, email: user.email, role: user.role },
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
          role: (user as any).role || "user",
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
