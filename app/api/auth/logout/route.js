import { NextResponse } from "next/server";
import { TOKEN_COOKIE, clearCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(TOKEN_COOKIE, "", clearCookieOptions());
  return res;
}
