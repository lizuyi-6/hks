"use client";

import { useEffect } from "react";

export default function Error({
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
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "2rem",
      fontFamily: "system-ui, sans-serif"
    }}>
      <h2 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
        出错了
      </h2>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        {error.message || "页面加载时发生了一个错误"}
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
    </div>
  );
}
