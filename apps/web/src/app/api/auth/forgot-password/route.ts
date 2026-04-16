import { NextResponse } from "next/server";

const apiMode = process.env.NEXT_PUBLIC_API_MODE ?? "mock";
const apiBaseUrl = process.env.NEXT_PRIVATE_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (apiMode === "mock") {
      return NextResponse.json({
        ok: true,
        message: "如果该邮箱已注册，重置链接已发送",
      });
    }

    const response = await fetch(`${apiBaseUrl}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
