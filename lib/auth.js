import { SignJWT, jwtVerify } from "jose";

const TOKEN_NAME = "token";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days (seconds)

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET. Add it to .env.local.");
  }
  return new TextEncoder().encode(secret);
}

/** Sign a JWT for the given payload (works in Node and Edge runtimes). */
export async function signToken(payload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

/** Verify a JWT and return its payload, or throw if invalid/expired. */
export async function verifyToken(token) {
  const { payload } = await jwtVerify(token, getSecretKey());
  return payload;
}

export const TOKEN_COOKIE = TOKEN_NAME;

/** Cookie options for the auth token. */
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  };
}

/** Cookie options used to clear the auth token on logout. */
export function clearCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  };
}
