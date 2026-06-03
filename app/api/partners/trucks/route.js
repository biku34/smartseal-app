import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongodb";
import Truck from "@/models/Truck";
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

/* GET /api/partners/trucks?partnerId=USR-LGP-001
   Trucks belonging to a given logistics partner (for the distributor's carrier picker). */
export async function GET(req) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const partnerId = String(searchParams.get("partnerId") || "").trim();
    if (!partnerId) {
      return NextResponse.json({ trucks: [] });
    }

    try {
      await dbConnect();
    } catch {
      return NextResponse.json(
        { error: "Cannot reach the database. Make sure MongoDB is running." },
        { status: 503 }
      );
    }

    const docs = await Truck.find({ ownerUserId: partnerId })
      .select("truckId truckNumber type capacity driverName")
      .sort({ createdAt: -1 })
      .lean();

    const trucks = docs.map((t) => ({
      truckId: t.truckId,
      truckNumber: t.truckNumber,
      type: t.type || "",
      capacity: t.capacity || "",
      driverName: t.driverName || "",
    }));
    return NextResponse.json({ trucks });
  } catch (err) {
    console.error("[partners/trucks GET] error:", err);
    return NextResponse.json({ error: "Could not load trucks." }, { status: 500 });
  }
}
