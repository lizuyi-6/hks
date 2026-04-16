import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName } from "@/lib/auth";

const apiMode = process.env.NEXT_PUBLIC_API_MODE ?? "mock";
const apiBaseUrl = process.env.NEXT_PRIVATE_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (apiMode === "mock") {
      return NextResponse.json({ ok: true });
    }

    const token = (await cookies()).get(authCookieName)?.value;
    if (!token) {
      return NextResponse.json({ detail: "未登录" }, { status: 401 });
    }

    const response = await fetch(`${apiBaseUrl}/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return NextResponse.json({ detail: "请求失败" }, { status: 400 });
  }
}
