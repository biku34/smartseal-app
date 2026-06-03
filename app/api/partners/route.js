import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { verifyToken, TOKEN_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

async function getAuth() {
  const token = cookies().get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

/* GET /api/partners — list registered logistics partners (for the distributor dropdown). */
export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    try {
      await dbConnect();
    } catch {
      return NextResponse.json(
        { error: "Cannot reach the database. Make sure MongoDB is running." },
        { status: 503 }
      );
    }

    const docs = await User.find({ role: "logistics", active: true })
      .select("userId username orgName")
      .sort({ orgName: 1 })
      .lean();

    const partners = docs.map((u) => ({
      userId: u.userId,
      username: u.username,
      orgName: u.orgName,
    }));
    return NextResponse.json({ partners });
  } catch (err) {
    console.error("[partners GET] error:", err);
    return NextResponse.json({ error: "Could not load partners." }, { status: 500 });
  }
}
