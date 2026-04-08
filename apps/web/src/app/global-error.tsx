"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
        margin: 0
      }}>
        <h2 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
          应用错误
        </h2>
        <p style={{ color: "#666", marginBottom: "1.5rem" }}>
          {error.message || "应用发生了严重错误"}
        </p>
        <button
          onClick={reset}
          style={{
            padding: "0.5rem 1.5rem",
            backgroundColor: "#0070f3",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "1rem"
          }}
        >
          重试
        </button>
      </body>
    </html>
  );
}
