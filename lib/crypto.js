import crypto from "crypto";

/**
 * Symmetric encryption used for the per-transaction QR payload.
 *
 * The QR for a product encodes ONLY the transactionId, encrypted with a key
 * derived from the uploader's userId (plus a server-side pepper). Anyone who
 * knows the userId (and has the server secret) can decrypt it to recover the
 * transactionId; the QR itself reveals nothing in plaintext.
 */
const ALGO = "aes-256-gcm";

function keyForUser(userId) {
  const pepper = process.env.JWT_SECRET || "smartseal-dev-secret";
  return crypto.createHash("sha256").update(`${userId}:${pepper}`).digest(); // 32 bytes
}

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(str) {
  let s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

/** Encrypt `plaintext` (e.g. a transactionId) bound to a user's id. Returns a compact token. */
export function encryptForUser(plaintext, userId) {
  const key = keyForUser(userId);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // token = b64url(iv | tag | ciphertext)
  return b64url(Buffer.concat([iv, tag, ct]));
}

/** Reverse of encryptForUser. Throws if the token was tampered with or the userId is wrong. */
export function decryptForUser(token, userId) {
  const raw = fromB64url(token);
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, keyForUser(userId), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
