import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/sessionConstants";

/** Pages from the original backbone that the room replaces. They all lead home. */
const OLD_PAGES = ["/login", "/register", "/dashboard", "/docs", "/settings"];

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const url = req.nextUrl.clone();
  url.search = "";

  if (OLD_PAGES.some((p) => path === p || path.startsWith(`${p}/`))) {
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  const session = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!session) {
    // Signed out: the front page has the one GitHub button, and brings you back here after.
    url.pathname = "/";
    url.searchParams.set("next", `${path}${req.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  // The old project screen: the room is the only screen now.
  const old = /^\/workspace\/([^/]+)\/?$/.exec(path);
  if (old) {
    url.pathname = `/workspace/${old[1]}/room`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/register",
    "/docs",
    "/settings/:path*",
    "/dashboard",
    "/dashboard/:path*",
    "/workspace",
    "/workspace/:path*",
    "/device",
    "/device/:path*",
    "/join/:path*",
    "/start",
  ],
};
