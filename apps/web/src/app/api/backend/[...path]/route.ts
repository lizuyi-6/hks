import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/env";
import { authCookieName } from "@/lib/auth";

async function proxy(request: Request, params: { path: string[] }) {
  const pathname = params.path.join("/");
  const url = new URL(request.url);
  const target = `${apiBaseUrl}/${pathname}${url.search}`;
  const token = (await cookies()).get(authCookieName)?.value;

  const response = await fetch(target, {
    method: request.method,
    headers: {
      ...(request.headers.get("content-type")
        ? { "Content-Type": request.headers.get("content-type") as string }
        : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: request.method === "GET" ? undefined : await request.arrayBuffer(),
    cache: "no-store"
  });

  if (pathname.includes("/documents/") || pathname.startsWith("documents/")) {
    const buffer = await response.arrayBuffer();
    return new NextResponse(buffer, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition": response.headers.get("content-disposition") ?? "attachment"
      }
    });
  }

  const text = await response.text();

  return new NextResponse(text, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json"
    }
  });
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return proxy(request, await context.params);
}
