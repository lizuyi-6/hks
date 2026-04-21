"use client";

import { useEffect } from "react";
import { trackError } from "@/lib/analytics";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    trackError({
      event: "error",
      error_type: "js_error",
      message: `[GlobalError] ${error.message}`,
      stack: error.stack,
    });
  }, [error]);

  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: "#FAFAFA", fontFamily: "Inter, system-ui, sans-serif" }}>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "1.5rem",
          gap: "0.75rem",
          color: "#18181B"
        }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>应用错误</h2>
          <p style={{ fontSize: "0.875rem", color: "#52525B", margin: 0 }}>
            {error.message || "应用发生了严重错误"}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
            <button
              onClick={reset}
              style={{
                height: "2rem",
                padding: "0 1rem",
                backgroundColor: "#4F46E5",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: 500
              }}
            >
              重试
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                height: "2rem",
                padding: "0 1rem",
                backgroundColor: "white",
                color: "#52525B",
                border: "1px solid #E4E4E7",
                borderRadius: "0.375rem",
                cursor: "pointer",
                fontSize: "0.875rem",
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none"
              }}
            >
              返回首页
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
