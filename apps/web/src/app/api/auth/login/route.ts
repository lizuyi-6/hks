import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName } from "@/lib/auth";

const apiMode = process.env.NEXT_PUBLIC_API_MODE ?? "mock";
const apiBaseUrl = process.env.NEXT_PRIVATE_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { detail: "邮箱和密码不能为空" },
        { status: 400 }
      );
    }

    if (apiMode === "mock") {
      const mockToken = `mock_token_${Date.now()}_${email}`;

      (await cookies()).set(authCookieName, mockToken, {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });

      return NextResponse.json({
        ok: true,
        accessToken: mockToken,
        tokenType: "bearer",
        message: "登录成功（Mock模式）"
      });
    }

    const response = await fetch(`${apiBaseUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new NextResponse(errorText, {
        status: response.status,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }

    const data = await response.json();
    const token = data.accessToken;

    if (token) {
      (await cookies()).set(authCookieName, token, {
        httpOnly: true,
        sameSite: "lax",
        path: "/"
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { detail: "请求格式错误" },
      { status: 400 }
    );
  }
}
