import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import dbConnect from "@/lib/mongodb";
import Logistics from "@/models/Logistics";
import User from "@/models/User";
import { verifyToken, TOKEN_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

/** Read + verify the auth cookie. Returns the JWT payload or null. */
async function getAuth() {
  const token = cookies().get(TOKEN_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifyToken(token);
  } catch {
    return null;
  }
}

function generateLogisticsId() {
  return "LOG-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

function generateTrackingNo() {
  return "TRK-" + crypto.randomBytes(5).toString("hex").toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  GET /api/logistics — the distributor's logistics queue            */
/* ------------------------------------------------------------------ */
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

    const docs = await Logistics.find({ distributor: auth.sub })
      .sort({ createdAt: -1 })
      .lean();
    return NextResponse.json({ items: docs.map(serialize) });
  } catch (err) {
    console.error("[logistics GET] error:", err);
    return NextResponse.json({ error: "Could not load logistics." }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  POST /api/logistics — push a product into the logistics queue      */
/* ------------------------------------------------------------------ */
export async function POST(req) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const p = body.product || body;

    const productId = String(p.productId || "").trim();
    const name = String(p.name || "").trim();
    if (!productId || !name) {
      return NextResponse.json(
        { error: "A valid product is required." },
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

    const quantity = Number(p.quantity) || 0;

    // Product metadata snapshot captured at push time.
    const snapshot = {
      productId,
      name,
      category: p.category || "Electronics",
      sku: p.sku || "",
      batch: p.batch || "",
      quantity,
      price: Number(p.price) || 0,
      company: p.company || "",
      manufacturer: p.manufacturer || p.company || "",
      location: p.location || "",
      mfg: p.mfg || "",
      exp: p.exp || "",
      desc: p.desc || "",
      productStatus: p.status || "",
      transactionId: p.transactionId || "",
      images: Array.isArray(p.images) ? p.images : [],
    };

    // Upsert: pushing the same product again refreshes its snapshot rather than
    // creating a duplicate. Planning fields are only set on first insert.
    const item = await Logistics.findOneAndUpdate(
      { distributor: auth.sub, productId },
      {
        $set: { ...snapshot },
        $setOnInsert: {
          logisticsId: generateLogisticsId(),
          distributor: auth.sub,
          distributorUsername: auth.username,
          distributorUserId: auth.userId || auth.sub,
          status: "Draft",
          submitted: false,
          shipQuantity: quantity,
          carrier: "",
          // Origin auto-fetched from the product's warehouse / storage location.
          origin: p.location || "",
          destination: "",
          dispatchDate: "",
          etaDate: "",
          trackingNo: "",
          pushedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ item: serialize(item) }, { status: 201 });
  } catch (err) {
    if (err?.code === 11000) {
      return NextResponse.json(
        { error: "This product is already in your logistics queue." },
        { status: 409 }
      );
    }
    console.error("[logistics POST] error:", err);
    return NextResponse.json(
      { error: "Could not add the product to logistics." },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH /api/logistics — submit a shipment plan                      */
/*  Saves the editable planning fields, sets status to "Planned", and  */
/*  auto-generates + persists a tracking number (kept stable on resubmit).*/
/* ------------------------------------------------------------------ */
export async function PATCH(req) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const logisticsId = String(body.logisticsId || "").trim();
    if (!logisticsId) {
      return NextResponse.json({ error: "Missing logisticsId." }, { status: 400 });
    }

    try {
      await dbConnect();
    } catch {
      return NextResponse.json(
        { error: "Cannot reach the database. Make sure MongoDB is running, then try again." },
        { status: 503 }
      );
    }

    const item = await Logistics.findOne({ distributor: auth.sub, logisticsId });
    if (!item) {
      return NextResponse.json({ error: "Shipment not found." }, { status: 404 });
    }

    // Save the editable planning fields (if provided).
    if (body.carrier !== undefined) item.carrier = String(body.carrier);
    if (body.origin !== undefined) item.origin = String(body.origin);
    if (body.destination !== undefined) item.destination = String(body.destination);
    if (body.dispatchDate !== undefined) item.dispatchDate = String(body.dispatchDate);
    if (body.etaDate !== undefined) item.etaDate = String(body.etaDate);

    // Assign a logistics partner (resolve the chosen partner's identity server-side).
    if (body.assignedPartnerId !== undefined) {
      const partnerId = String(body.assignedPartnerId || "").trim();
      if (!partnerId) {
        item.assignedPartnerId = "";
        item.assignedPartnerUsername = "";
        item.assignedPartnerOrg = "";
      } else {
        const partner = await User.findOne({ userId: partnerId, role: "logistics" })
          .select("userId username orgName")
          .lean();
        if (!partner) {
          return NextResponse.json({ error: "Selected logistics partner not found." }, { status: 400 });
        }
        item.assignedPartnerId = partner.userId;
        item.assignedPartnerUsername = partner.username;
        item.assignedPartnerOrg = partner.orgName;
      }
    }

    // Submit: mark as Planned + assign a tracking number (only generate once).
    item.status = "Planned";
    item.submitted = true;
    if (!item.trackingNo) item.trackingNo = generateTrackingNo();

    await item.save();
    return NextResponse.json({ item: serialize(item) });
  } catch (err) {
    console.error("[logistics PATCH] error:", err);
    return NextResponse.json({ error: "Could not submit the shipment." }, { status: 500 });
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE /api/logistics?id=LOG-XXXX — remove an item from the queue  */
/* ------------------------------------------------------------------ */
export async function DELETE(req) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const logisticsId = searchParams.get("id");
    const productId = searchParams.get("productId");
    if (!logisticsId && !productId) {
      return NextResponse.json({ error: "Missing id." }, { status: 400 });
    }

    try {
      await dbConnect();
    } catch {
      return NextResponse.json(
        { error: "Cannot reach the database. Make sure MongoDB is running." },
        { status: 503 }
      );
    }

    const query = { distributor: auth.sub };
    if (logisticsId) query.logisticsId = logisticsId;
    else query.productId = productId;

    const res = await Logistics.deleteOne(query);
    if (!res.deletedCount) {
      return NextResponse.json({ error: "Item not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[logistics DELETE] error:", err);
    return NextResponse.json({ error: "Could not remove the item." }, { status: 500 });
  }
}

/** Shape a logistics doc for the client UI. */
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
    company: d.company,
    manufacturer: d.manufacturer,
    location: d.location,
    mfg: d.mfg,
    exp: d.exp,
    desc: d.desc,
    productStatus: d.productStatus,
    transactionId: d.transactionId,
    images: Array.isArray(d.images) ? d.images : [],
    // planning
    carrier: d.carrier || "",
    origin: d.origin || "",
    destination: d.destination || "",
    dispatchDate: d.dispatchDate || "",
    etaDate: d.etaDate || "",
    mode: d.mode || "Road",
    trackingNo: d.trackingNo || "",
    status: d.status || "Draft",
    submitted: Boolean(d.submitted),
    assignedPartnerId: d.assignedPartnerId || "",
    assignedPartnerUsername: d.assignedPartnerUsername || "",
    assignedPartnerOrg: d.assignedPartnerOrg || "",
    shipQuantity: d.shipQuantity || 0,
    pushedAt: d.pushedAt || d.createdAt || null,
    createdAt: d.createdAt || null,
  };
}
