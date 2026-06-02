import { NextResponse } from "next/server";
import { verifyToken, TOKEN_COOKIE } from "@/lib/auth";

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(TOKEN_COOKIE)?.value;

  let valid = false;
  if (token) {
    try {
      await verifyToken(token);
      valid = true;
    } catch {
      valid = false;
    }
  }

  const isAuthPage = pathname === "/login" || pathname === "/register";
  const isProtected =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/");

  // Block unauthenticated access to protected pages.
  if (isProtected && !valid) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }

  // Keep authenticated users out of the login/register pages.
  if (isAuthPage && valid) {
    return NextResponse.redirect(new URL("/portal", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/dashboard", "/portal/:path*", "/portal", "/login", "/register"],
};
