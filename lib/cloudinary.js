import crypto from "crypto";

/**
 * Minimal Cloudinary helper (no SDK — uses the signed REST upload API via fetch).
 * Config in .env.local: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
 */

export function cloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

/** Build a Cloudinary signature (SHA-1 of sorted params + api_secret). */
function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createHash("sha1").update(toSign + apiSecret).digest("hex");
}

/**
 * Upload an image buffer to Cloudinary at `<folder>/<publicId>` and return its
 * permanent secure URL.
 */
export async function uploadToCloudinary(buffer, { publicId, folder, mime, filename }) {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud || !apiKey || !apiSecret) throw new Error("Cloudinary is not configured.");

  const timestamp = Math.floor(Date.now() / 1000);

  // Only these params are signed (file, api_key, resource_type, cloud_name are excluded).
  const signature = signParams({ folder, public_id: publicId, timestamp }, apiSecret);

  const fd = new FormData();
  fd.append("file", new Blob([buffer], { type: mime || "application/octet-stream" }), filename || publicId);
  fd.append("api_key", apiKey);
  fd.append("timestamp", String(timestamp));
  fd.append("public_id", publicId);
  fd.append("folder", folder);
  fd.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    throw new Error(`Cloudinary upload failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return { url: data.secure_url, publicId: data.public_id };
}
