import { NextResponse } from "next/server";
import { apiBaseUrl } from "@/lib/env";

interface AnalyticsEvent {
  event: string;
  timestamp: number;
  page?: string;
  [key: string]: unknown;
}

interface AnalyticsRequest {
  events: AnalyticsEvent[];
  session_id?: string;
}

export async function POST(request: Request) {
  try {
    const body: AnalyticsRequest = await request.json();
    const { events, session_id } = body;

    if (!events || !Array.isArray(events)) {
      return NextResponse.json(
        { error: "Invalid events format" },
        { status: 400 }
      );
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[Analytics] Received events:", events.length);
      console.log("[Analytics] Session ID:", session_id);
      events.forEach((event, index) => {
        console.log(`[Analytics] Event ${index + 1}:`, JSON.stringify(event, null, 2));
      });
    }

    const analyticsEnabled = process.env.FEATURE_ANALYTICS === "true";

    if (analyticsEnabled) {
      try {
        const backendUrl = process.env.NEXT_PRIVATE_API_BASE_URL || apiBaseUrl;
        const response = await fetch(`${backendUrl}/analytics/events`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            events,
            session_id,
            user_id: null
          })
        });

        if (!response.ok) {
          console.error("[Analytics] Failed to forward to backend:", response.status);
        }
      } catch (error) {
        console.error("[Analytics] Error forwarding to backend:", error);
      }
    }

    return NextResponse.json({
      ok: true,
      received: events.length
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to process analytics events" },
      { status: 500 }
    );
  }
}

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Analytics debug only available in development" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    message: "Analytics endpoint",
    usage: {
      method: "POST",
      body: {
        events: [{ event: "page_view", page: "/dashboard", timestamp: Date.now() }],
        session_id: "optional_session_id"
      }
    }
  });
}
