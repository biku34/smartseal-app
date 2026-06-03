import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongodb";
import Logistics from "@/models/Logistics";
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

/* GET /api/partner/logistics — shipments assigned to the signed-in logistics partner. */
export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }
    if (auth.role !== "logistics") {
      return NextResponse.json({ error: "Logistics partner access only." }, { status: 403 });
    }

    try {
      await dbConnect();
    } catch {
      return NextResponse.json(
        { error: "Cannot reach the database. Make sure MongoDB is running." },
        { status: 503 }
      );
    }

    const partnerId = auth.userId;
    const docs = await Logistics.find({ assignedPartnerId: partnerId })
      .sort({ updatedAt: -1 })
      .lean();

    return NextResponse.json({ items: docs.map(serialize) });
  } catch (err) {
    console.error("[partner logistics GET] error:", err);
    return NextResponse.json({ error: "Could not load assigned logistics." }, { status: 500 });
  }
}

/** Shape an assigned shipment for the partner UI. */
function serialize(d) {
  return {
    logisticsId: d.logisticsId,
    productId: d.productId,
    name: d.name,
    category: d.category,
    sku: d.sku,
    batch: d.batch,
    quantity: d.quantity,
    price: d.price,
    manufacturer: d.manufacturer || d.company || "",
    location: d.location,
    exp: d.exp,
    images: Array.isArray(d.images) ? d.images : [],
    // logistics plan
    carrier: d.carrier || "",
    origin: d.origin || "",
    destination: d.destination || "",
    dispatchDate: d.dispatchDate || "",
    etaDate: d.etaDate || "",
    trackingNo: d.trackingNo || "",
    status: d.status || "Planned",
    shipQuantity: d.shipQuantity || 0,
    // who assigned it
    distributorUsername: d.distributorUsername || "",
    distributorUserId: d.distributorUserId || "",
    updatedAt: d.updatedAt || d.createdAt || null,
  };
}
