import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { signToken, verifyToken, TOKEN_COOKIE, cookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function getAuth() {
  const token = cookies().get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

function publicUser(u) {
  return {
    userId: u.userId,
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role,
    stage: u.stage,
    orgId: u.orgId,
    orgName: u.orgName,
    active: u.active,
    createdAt: u.createdAt,
  };
}

async function freshToken(u) {
  return signToken({
    sub: u._id.toString(),
    userId: u.userId,
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role,
    stage: u.stage,
    orgId: u.orgId,
    orgName: u.orgName,
  });
}

/* GET /api/profile — current user's profile */
export async function GET() {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  try {
    await dbConnect();
  } catch {
    return NextResponse.json({ error: "Cannot reach the database." }, { status: 503 });
  }
  const user = await User.findById(auth.sub).lean();
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  return NextResponse.json({ user: publicUser(user) });
}

/* PATCH /api/profile — update name, email and (optionally) password */
export async function PATCH(req) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const currentPassword = body.currentPassword ? String(body.currentPassword) : "";
  const newPassword = body.newPassword ? String(body.newPassword) : "";

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (newPassword) {
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "New password must be at least 6 characters." }, { status: 400 });
    }
    if (!currentPassword) {
      return NextResponse.json({ error: "Enter your current password to set a new one." }, { status: 400 });
    }
  }

  try {
    await dbConnect();
  } catch {
    return NextResponse.json({ error: "Cannot reach the database." }, { status: 503 });
  }

  const user = await User.findById(auth.sub);
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  // Email uniqueness (if changed)
  if (email !== user.email) {
    const taken = await User.findOne({ email, _id: { $ne: user._id } }).select("_id").lean();
    if (taken) {
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }
  }

  // Password change (verify current first)
  if (newPassword) {
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
    }
    user.password = await bcrypt.hash(newPassword, 10);
  }

  user.name = name;
  user.email = email;

  try {
    await user.save();
  } catch (err) {
    if (err?.code === 11000) {
      return NextResponse.json({ error: "That email is already in use." }, { status: 409 });
    }
    console.error("[profile PATCH] error:", err);
    return NextResponse.json({ error: "Could not save your profile." }, { status: 500 });
  }

  // Refresh the auth cookie so the new name/email propagate.
  const res = NextResponse.json({ user: publicUser(user) });
  res.cookies.set(TOKEN_COOKIE, await freshToken(user), cookieOptions());
  return res;
}
