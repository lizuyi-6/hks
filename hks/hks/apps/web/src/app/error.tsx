"use client";

import { useEffect } from "react";
import { trackError } from "@/lib/analytics";

export default function Error({
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
      message: error.message,
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface-sunken p-6 text-text-primary">
      <h2 className="text-lg font-semibold">出错了</h2>
      <p className="text-sm text-text-secondary">
        {error.message || "页面加载时发生了一个错误"}
      </p>
      {error.digest && (
        <code className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-mono text-text-secondary">
          {error.digest}
        </code>
      )}
      <div className="flex gap-2 mt-2">
        <button
          onClick={reset}
          className="inline-flex h-8 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
        >
          重试
        </button>
        <button
          onClick={() => { window.location.href = "/"; }}
          className="inline-flex h-8 items-center rounded-md border border-border px-4 text-sm text-text-secondary hover:bg-neutral-50 transition-colors"
        >
          返回首页
        </button>
      </div>
    </div>
  );
}
