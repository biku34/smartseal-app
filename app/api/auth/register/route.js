import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { signToken, TOKEN_COOKIE, cookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STAGE_BY_ROLE = {
  manufacturer: "Manufacturer",
  distributor: "Distributor",
  retailer: "Retailer",
  admin: "Admin",
};

const pad = (n, w) => String(n).padStart(w, "0");

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Reuse an existing org's id when the org name already exists, else mint a new one. */
async function resolveOrgId(orgName) {
  const existing = await User.findOne({
    orgName: new RegExp(`^${escapeRegex(orgName)}$`, "i"),
  })
    .select("orgId")
    .lean();
  if (existing?.orgId) return existing.orgId;

  const orgIds = await User.distinct("orgId");
  let seq = orgIds.length;
  let orgId;
  do {
    seq += 1;
    orgId = `ORG-MFG-${pad(seq, 2)}`;
  } while (orgIds.includes(orgId));
  return orgId;
}

/** Sequential, collision-checked user id like USR-MFG-001. */
async function generateUserId() {
  let seq = await User.countDocuments();
  let userId;
  do {
    seq += 1;
    userId = `USR-MFG-${pad(seq, 3)}`;
    // eslint-disable-next-line no-await-in-loop
  } while (await User.exists({ userId }));
  return userId;
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const username = String(body.username || "").trim().toLowerCase();
    const orgName = String(body.orgName || "").trim();
    const password = String(body.password || "");

    // --- Validation ---
    if (!name || !email || !username || !orgName || !password) {
      return NextResponse.json(
        { error: "Name, email, username, organization name and password are all required." },
        { status: 400 }
      );
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }
    if (username.length < 3) {
      return NextResponse.json(
        { error: "Username must be at least 3 characters." },
        { status: 400 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
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

    // --- Uniqueness checks ---
    if (await User.exists({ username })) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    if (await User.exists({ email })) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }

    const hashed = await bcrypt.hash(password, 10);

    // --- Auto-assigned fields (role/stage/active are NOT taken from the client) ---
    const role = "manufacturer";
    const stage = STAGE_BY_ROLE[role];
    const orgId = await resolveOrgId(orgName);
    const userId = await generateUserId();

    const user = await User.create({
      userId,
      orgId,
      name,
      email,
      username,
      orgName,
      password: hashed,
      role,
      stage,
      active: true,
    });

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

    const res = NextResponse.json(
      {
        user: {
          userId: user.userId,
          username: user.username,
          name: user.name,
          email: user.email,
          role: user.role,
          stage: user.stage,
          orgId: user.orgId,
          orgName: user.orgName,
          active: user.active,
          createdAt: user.createdAt,
        },
      },
      { status: 201 }
    );
    res.cookies.set(TOKEN_COOKIE, token, cookieOptions());
    return res;
  } catch (err) {
    console.error("[register] error:", err);
    // Duplicate key safety net (unique index race).
    if (err?.code === 11000) {
      return NextResponse.json(
        { error: "That username or email is already registered." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
