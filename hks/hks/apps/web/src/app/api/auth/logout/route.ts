import { NextResponse } from "next/server";
import { authCookieName } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  // Delete on the outgoing response so the browser actually clears the
  // session cookie. cookies().delete inside a Route Handler is unreliable.
  res.cookies.delete(authCookieName);
  return res;
}
