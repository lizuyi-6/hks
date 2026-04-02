import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authCookieName } from "./lib/auth";

const publicPaths = new Set(["/login", "/register"]);

export function middleware(request: NextRequest) {
  const token = request.cookies.get(authCookieName)?.value;
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  if (pathname.startsWith("/api")) {
    return response;
  }

  if (publicPaths.has(pathname) && token) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (!publicPaths.has(pathname) && pathname !== "/" && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
