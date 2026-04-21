import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/env";
import { authCookieName } from "@/lib/auth";

interface RefreshState {
  token?: string;
  clearCookie?: boolean;
}

async function proxyWithRetry(
  request: Request,
  pathname: string,
  url: URL,
  token: string | undefined,
  body: ArrayBuffer | undefined,
  refreshState: RefreshState,
  attempt: number = 0
): Promise<Response> {
  const target = `${apiBaseUrl}/${pathname}${url.search}`;

  const response = await fetch(target, {
    method: request.method,
    headers: (() => {
      const headers: Record<string, string> = {};
      const ct = request.headers.get("content-type");
      if (ct) {
        // Ensure charset=utf-8 for JSON requests to handle non-ASCII characters
        if (ct.includes("application/json") && !ct.includes("charset")) {
          headers["Content-Type"] = "application/json; charset=utf-8";
        } else {
          headers["Content-Type"] = ct;
        }
      }
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      // Forward additional useful client headers.
      for (const h of ["Accept", "Accept-Language", "X-Request-Id", "Idempotency-Key"]) {
        const v = request.headers.get(h);
        if (v) headers[h] = v;
      }
      return headers;
    })(),
    body: request.method === "GET" ? undefined : body,
    cache: "no-store",
    // Forward client disconnects (navigation, tab close, unmount) to the
    // backend so long-running LLM streams are aborted instead of piling up.
    signal: request.signal,
  });

  if (response.status === 401 && token && attempt === 0) {
    try {
      const refreshRes = await fetch(`${apiBaseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        const newToken = data.accessToken ?? data.access_token;
        if (newToken) {
          // Stash the refreshed token so the caller can attach Set-Cookie to
          // the outgoing NextResponse. Writing via cookies().set() inside a
          // Route Handler is not guaranteed to reach the browser in Next.js 15.
          refreshState.token = newToken;
          return proxyWithRetry(request, pathname, url, newToken, body, refreshState, 1);
        }
      }
      // Refresh failed on an unrecoverable 401: the cookie-borne token is no
      // longer decodable (e.g. leftover `mock_token_*` from the pre-real BFF
      // era, or a key rotation). Signal the outer layer to delete the cookie
      // so the next navigation falls through middleware to /login instead of
      // looping on 401s with an undead session.
      refreshState.clearCookie = true;
    } catch {
      refreshState.clearCookie = true;
    }
  }

  return response;
}

function applyRefreshedCookie(res: NextResponse, refreshState: RefreshState) {
  if (refreshState.token) {
    res.cookies.set(authCookieName, refreshState.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  } else if (refreshState.clearCookie) {
    res.cookies.set(authCookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }
  return res;
}

async function proxy(request: Request, params: { path: string[] }) {
  const pathname = params.path.join("/");
  const url = new URL(request.url);
  const cookieToken = (await cookies()).get(authCookieName)?.value;
  const headerToken = request.headers.get("Authorization")?.replace("Bearer ", "");
  const token = cookieToken || headerToken;

  const body = request.method !== "GET" ? await request.arrayBuffer() : undefined;

  const refreshState: RefreshState = {};

  try {
    const response = await proxyWithRetry(request, pathname, url, token, body, refreshState);

    // Treat any upstream response that comes back with a Content-Disposition
    // header as a download (compliance reports, trademark docs, signed PDFs,
    // etc.) so the browser does the right thing regardless of URL prefix.
    const upstreamDisposition = response.headers.get("content-disposition");
    if (
      pathname.includes("/documents/") ||
      pathname.startsWith("documents/") ||
      upstreamDisposition
    ) {
      const buffer = await response.arrayBuffer();
      return applyRefreshedCookie(
        new NextResponse(buffer, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get("content-type") ?? "application/octet-stream",
            "Content-Disposition": upstreamDisposition ?? "attachment",
          },
        }),
        refreshState,
      );
    }

    // SSE stream relay
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream") && response.body) {
      const reader = response.body.getReader();
      const stream = new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            controller.enqueue(value);
          } catch (err) {
            // Upstream reset mid-stream: surface as a controller error so
            // the client-side SSE reader transitions to an error state
            // instead of hanging on a silently dead socket.
            try {
              controller.error(err);
            } catch {
              // Already errored/closed — nothing to do.
            }
          }
        },
        cancel() {
          reader.cancel().catch(() => {});
        },
      });
      return applyRefreshedCookie(
        new NextResponse(stream, {
          status: response.status,
          headers: {
            "Content-Type": "text/event-stream",
            // ``no-transform`` blocks intermediate proxies (nginx, Vercel
            // edge) from compressing / batching the SSE body, which would
            // otherwise hold tokens until the stream ends.
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            // Forward the upstream flush hint verbatim; fall back to ``no``
            // so any reverse proxy in front of us also flushes chunks.
            "X-Accel-Buffering":
              response.headers.get("x-accel-buffering") ?? "no",
          },
        }),
        refreshState,
      );
    }

    const buffer = await response.arrayBuffer();
    return applyRefreshedCookie(
      new NextResponse(buffer, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get("content-type") ?? "application/json",
        },
      }),
      refreshState,
    );
  } catch (err) {
    console.error("[BFF] proxy error:", err);
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
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
