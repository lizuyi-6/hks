import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/env";
import { authCookieName } from "@/lib/auth";

export async function POST(request: Request) {
  const response = await fetch(`${apiBaseUrl}/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: await request.text(),
    cache: "no-store"
  });

  if (!response.ok) {
    return new NextResponse(await response.text(), { status: response.status });
  }

  const payload = (await response.json()) as { accessToken?: string; access_token?: string };
  const token = payload.accessToken ?? payload.access_token;
  if (!token) {
    return new NextResponse("Missing access token", { status: 502 });
  }
  (await cookies()).set(authCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  return NextResponse.json({ ok: true });
}
