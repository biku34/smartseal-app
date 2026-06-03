import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
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

function generateTruckId() {
  return "TRK-V" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

/* GET /api/trucks — the signed-in partner's fleet. */
export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    try {
      await dbConnect();
    } catch {
      return NextResponse.json(
        { error: "Cannot reach the database. Make sure MongoDB is running." },
        { status: 503 }
      );
    }

    const docs = await Truck.find({ owner: auth.sub }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ trucks: docs.map(serialize) });
  } catch (err) {
    console.error("[trucks GET] error:", err);
    return NextResponse.json({ error: "Could not load trucks." }, { status: 500 });
  }
}

/* POST /api/trucks — register a truck. */
export async function POST(req) {
  try {
    const auth = await getAuth();
    if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const truckNumber = String(body.truckNumber || "").trim();
    if (!truckNumber) {
      return NextResponse.json({ error: "Truck number is required." }, { status: 400 });
    }

    try {
      await dbConnect();
    } catch {
      return NextResponse.json(
        { error: "Cannot reach the database. Make sure MongoDB is running, then try again." },
        { status: 503 }
      );
    }

    let truckId = generateTruckId();
    // eslint-disable-next-line no-await-in-loop
    while (await Truck.exists({ truckId })) truckId = generateTruckId();

    let truck;
    try {
      truck = await Truck.create({
        truckId,
        owner: auth.sub,
        ownerUsername: auth.username,
        ownerUserId: auth.userId || auth.sub,
        truckNumber,
        type: String(body.type || "").trim(),
        capacity: String(body.capacity || "").trim(),
        driverName: String(body.driverName || "").trim(),
        driverPhone: String(body.driverPhone || "").trim(),
        notes: String(body.notes || "").trim(),
      });
    } catch (e) {
      if (e?.code === 11000) {
        return NextResponse.json(
          { error: "You've already registered a truck with that number." },
          { status: 409 }
        );
      }
      throw e;
    }

    return NextResponse.json({ truck: serialize(truck) }, { status: 201 });
  } catch (err) {
    console.error("[trucks POST] error:", err);
    return NextResponse.json({ error: "Could not save the truck." }, { status: 500 });
  }
}

/* DELETE /api/trucks?id=TRK-VXXXX — remove a truck from the fleet. */
export async function DELETE(req) {
  try {
    const auth = await getAuth();
    if (!auth) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const truckId = searchParams.get("id");
    if (!truckId) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    try {
      await dbConnect();
    } catch {
      return NextResponse.json(
        { error: "Cannot reach the database. Make sure MongoDB is running." },
        { status: 503 }
      );
    }

    const res = await Truck.deleteOne({ owner: auth.sub, truckId });
    if (!res.deletedCount) {
      return NextResponse.json({ error: "Truck not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[trucks DELETE] error:", err);
    return NextResponse.json({ error: "Could not remove the truck." }, { status: 500 });
  }
}

function serialize(t) {
  return {
    truckId: t.truckId,
    truckNumber: t.truckNumber,
    type: t.type || "",
    capacity: t.capacity || "",
    driverName: t.driverName || "",
    driverPhone: t.driverPhone || "",
    notes: t.notes || "",
    createdAt: t.createdAt || null,
  };
}
