import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import dbConnect from "@/lib/mongodb";
import Product from "@/models/Product";
import { verifyToken, TOKEN_COOKIE } from "@/lib/auth";
import { cloudinaryConfigured, uploadToCloudinary } from "@/lib/cloudinary";
import { encryptForUser } from "@/lib/crypto";

export const runtime = "nodejs";

// Local fallback folder (used only when Cloudinary is not configured).
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "products");
const PUBLIC_PREFIX = "/uploads/products";

// Cloudinary destination folder for product photos.
const CLOUDINARY_FOLDER = (process.env.CLOUDINARY_FOLDER || "smartseal/products").replace(/\/+$/, "");

const EXT_BY_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

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

function generateProductId() {
  return "PRD-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

function pickExtension(file) {
  const fromName = path.extname(file.name || "").toLowerCase();
  if (fromName) return fromName;
  return EXT_BY_MIME[file.type] || ".png";
}

/* ------------------------------------------------------------------ */
/*  POST /api/products  — create a product (+ save photos to Cloudinary)*/
/* ------------------------------------------------------------------ */
export async function POST(req) {
  try {
    const auth = await getAuth();
    if (!auth) {
      return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
    }

    const form = await req.formData();

    const name = String(form.get("name") || "").trim();
    const category = String(form.get("category") || "Electronics");
    const sku = String(form.get("sku") || "").trim();
    const batch = String(form.get("batch") || "").trim();
    const quantity = parseInt(form.get("quantity")) || 0;
    const price = parseFloat(form.get("price")) || 0;
    const company = String(form.get("company") || "").trim();
    const location = String(form.get("location") || "").trim();
    const mfg = String(form.get("mfg") || "");
    const exp = String(form.get("exp") || "");
    const descRaw = String(form.get("desc") || "").trim();

    if (!name || !sku || !batch || quantity <= 0 || price < 0 || !company || !location) {
      return NextResponse.json(
        { error: "Please fill all mandatory configuration fields." },
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

    // Unique product id (also used as the photo file name).
    let productId = generateProductId();
    // eslint-disable-next-line no-await-in-loop
    while (await Product.exists({ productId })) productId = generateProductId();

    // --- Save uploaded photos, named by productId ---
    const files = form
      .getAll("images")
      .filter((f) => typeof f === "object" && f && typeof f.arrayBuffer === "function" && f.size > 0);

    const useCloudinary = cloudinaryConfigured();
    const images = [];

    if (files.length) {
      if (!useCloudinary) await fs.mkdir(UPLOAD_DIR, { recursive: true });

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = pickExtension(file);
        // First photo: <productId>; extras: <productId>_2, _3 ...
        const baseName = i === 0 ? productId : `${productId}_${i + 1}`;
        const buffer = Buffer.from(await file.arrayBuffer());

        if (useCloudinary) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const { url } = await uploadToCloudinary(buffer, {
              publicId: baseName,
              folder: CLOUDINARY_FOLDER,
              mime: file.type,
              filename: `${baseName}${ext}`,
            });
            images.push(url);
          } catch (e) {
            console.error("[cloudinary] upload failed:", e);
            return NextResponse.json(
              { error: "Could not upload photos to Cloudinary. Check your Cloudinary credentials in .env.local." },
              { status: 502 }
            );
          }
        } else {
          // eslint-disable-next-line no-await-in-loop
          await fs.writeFile(path.join(UPLOAD_DIR, `${baseName}${ext}`), buffer);
          images.push(`${PUBLIC_PREFIX}/${baseName}${ext}`);
        }
      }
    }

    // Server-assigned ledger fields.
    const statuses = ["Success", "Failed", "Pending"];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const pickup = new Date();
    pickup.setDate(pickup.getDate() + 2);

    const transactionId = "TXN-MFG-" + Math.floor(100000 + Math.random() * 900000);
    // QR encodes ONLY the transactionId, encrypted with the uploader's userId.
    const ownerUserId = auth.userId || auth.sub;
    const qrToken = encryptForUser(transactionId, ownerUserId);

    const product = await Product.create({
      productId,
      owner: auth.sub,
      ownerUsername: auth.username,
      ownerUserId,
      name,
      category,
      sku,
      batch,
      quantity,
      price,
      company,
      location,
      mfg,
      exp,
      desc: descRaw || "No description provided.",
      status,
      transactionId,
      pickupDate: pickup.toLocaleDateString("en-GB"),
      picked: false,
      qrToken,
      images,
    });

    return NextResponse.json({ product: serialize(product) }, { status: 201 });
  } catch (err) {
    console.error("[products POST] error:", err);
    return NextResponse.json(
      { error: "Could not save the product. Please try again." },
      { status: 500 }
    );
  }
}

/* ------------------------------------------------------------------ */
/*  GET /api/products  — list the signed-in user's products            */
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

    const docs = await Product.find({ owner: auth.sub }).sort({ createdAt: -1 }).lean();
    return NextResponse.json({ products: docs.map(serialize) });
  } catch (err) {
    console.error("[products GET] error:", err);
    return NextResponse.json({ error: "Could not load products." }, { status: 500 });
  }
}

/** Shape a product (mongoose doc or lean object) for the client UI. */
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
    transactionId: p.transactionId,
    pickupDate: p.pickupDate,
    picked: p.picked,
    qrToken: p.qrToken || null,
    createdAt: p.createdAt || null,
    images: Array.isArray(p.images) ? p.images : [],
  };
}
