import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { signToken, TOKEN_COOKIE, cookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required." },
        { status: 400 }
      );
    }

    try {
      await dbConnect();
    } catch {
      return NextResponse.json(
        { error: "Cannot reach the database. Make sure MongoDB is running, then try again." },
        { status: 503 }
      );
    }

    const user = await User.findOne({ username });
    // Use a generic message so we don't reveal whether the username exists.
    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid username or password." },
        { status: 401 }
      );
    }

    const token = await signToken({
      sub: user._id.toString(),
      userId: user.userId,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      stage: user.stage,
      orgId: user.orgId,
      orgName: user.orgName,
    });

    const res = NextResponse.json({
      user: {
        userId: user.userId,
        username: user.username,
        name: user.name,
        role: user.role,
        stage: user.stage,
        orgId: user.orgId,
        orgName: user.orgName,
      },
    });
    res.cookies.set(TOKEN_COOKIE, token, cookieOptions());
    return res;
  } catch (err) {
    console.error("[login] error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
