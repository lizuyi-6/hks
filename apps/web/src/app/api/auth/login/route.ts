import { NextResponse } from "next/server";
import { authCookieName } from "@/lib/auth";

const apiBaseUrl = process.env.NEXT_PRIVATE_API_BASE_URL ?? "http://127.0.0.1:8000";
const isProduction = process.env.NODE_ENV === "production";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "请求格式错误" }, { status: 400 });
  }

  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ detail: "邮箱和密码不能为空" }, { status: 400 });
  }

  try {
    const response = await fetch(`${apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new NextResponse(errorText, {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const token = data.accessToken ?? data.access_token;

    const res = NextResponse.json(data);
    if (token) {
      res.cookies.set(authCookieName, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }
    return res;
  } catch (err) {
    console.error("[auth/login] upstream error:", err);
    return NextResponse.json({ detail: "上游服务异常，请稍后重试" }, { status: 502 });
  }
}
