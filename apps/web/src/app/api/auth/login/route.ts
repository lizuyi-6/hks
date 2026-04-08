import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authCookieName } from "@/lib/auth";

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

    if (password.length < 6) {
      return NextResponse.json(
        { detail: "密码长度至少为6位" },
        { status: 400 }
      );
    }

    const mockToken = `mock_token_${Date.now()}_${email}`;

    (await cookies()).set(authCookieName, mockToken, {
      httpOnly: true,
      sameSite: "lax",
      path: "/"
    });

    return NextResponse.json({
      ok: true,
      access_token: mockToken,
      message: "登录成功（Mock模式）"
    });
  } catch (error) {
    return NextResponse.json(
      { detail: "请求格式错误" },
      { status: 400 }
    );
  }
}
