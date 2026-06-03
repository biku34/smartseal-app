import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
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

/* GET /api/catalog — every product across all manufacturers (for distributors). */
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

    const docs = await Product.find({}).sort({ createdAt: -1 }).limit(500).lean();
    return NextResponse.json({ products: docs.map(serialize) });
  } catch (err) {
    console.error("[catalog GET] error:", err);
    return NextResponse.json({ error: "Could not load the catalog." }, { status: 500 });
  }
}

function serialize(p) {
  return {
    productId: p.productId,
    name: p.name,
    category: p.category,
    sku: p.sku,
    batch: p.batch,
    quantity: p.quantity,
    price: p.price,
    company: p.company,
    location: p.location,
    mfg: p.mfg,
    exp: p.exp,
    desc: p.desc,
    status: p.status,
    createdAt: p.createdAt || null,
    images: Array.isArray(p.images) ? p.images : [],
    // Who listed it
    manufacturer: p.company || p.ownerUsername || "Unknown",
  };
}
