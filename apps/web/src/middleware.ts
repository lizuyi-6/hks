import { NextRequest, NextResponse } from "next/server";

const authCookieName = "a1plus-session";
const publicPaths = ["/", "/login", "/register", "/forgot-password", "/reset-password"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Inject pathname header
  const response = NextResponse.next();
  response.headers.set("x-pathname", pathname);

  // Check auth for workspace pages
  const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const isApi = pathname.startsWith("/api/");
  const isStatic = pathname.startsWith("/_next/") || pathname.startsWith("/favicon");

  if (!isPublic && !isApi && !isStatic) {
    const session = request.cookies.get(authCookieName)?.value;
    if (!session) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
