"use client";

import { useState } from "react";
import type { DataMode } from "@a1plus/domain";
import { ApplicationError, getErrorDisplayInfo, parseErrorResponse } from "@/lib/errors";
import { proxyBaseUrl } from "@/lib/env";
import { trackAPIPerformance, trackError } from "@/lib/analytics";
import { Alert } from "@a1plus/ui";

export type ProviderHealth = {
  providers: Array<{
    port: string;
    mode: DataMode;
    provider: string;
    available: boolean;
    reason?: string;
  }>;
};

export type Envelope<T> = {
  mode: DataMode;
  provider: string;
  traceId: string;
  retrievedAt: string;
  sourceRefs: Array<{ title: string; url?: string; note?: string }>;
  disclaimer: string;
  normalizedPayload: T;
};

export type DiagnosisPayload = {
  summary: string;
  priorityAssets: string[];
  risks: string[];
  nextActions: string[];
  recommendedTrack: "trademark" | "patent" | "copyright";
  recommendedTrademarkCategories: string[];
};

const jsonHeaders = { "Content-Type": "application/json" };

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const startTime = Date.now();
  const response = await fetch(`${proxyBaseUrl}${path}`, {
    ...init,
    headers: { ...jsonHeaders, ...(init?.headers ?? {}) }
  });
  const durationMs = Date.now() - startTime;

  trackAPIPerformance(path, method, response.status, durationMs);

  if (!response.ok) {
    const detail = await response.text();
    const err = parseErrorResponse(detail, path);
    trackError({
      event: "error",
      error_type: "api_error",
      message: `workspace.request failed: ${method} ${path} status=${response.status}`,
    });
    throw err;
  }
  return response.json() as Promise<T>;
}

export function ErrorDisplay({ error }: { error: string | ApplicationError }) {
  const [showDetails, setShowDetails] = useState(false);
  const isAppError = error instanceof ApplicationError;
  const info = isAppError ? getErrorDisplayInfo(error.errorType) : { color: "gray", label: "未知错误" };

  const variantMap: Record<string, "error" | "warning" | "info"> = {
    red: "error",
    yellow: "warning",
    orange: "warning",
    blue: "info",
    purple: "info",
  };
  const variant = variantMap[info.color] ?? "info";

  return (
    <Alert variant={variant} showIcon={true}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-medium text-text-primary">
            {isAppError ? error.message : error}
          </p>
          {isAppError && error.errorLocation && (
            <p className="mt-1 text-xs text-text-tertiary">{error.errorLocation}</p>
          )}
          {isAppError && error.requestId && (
            <p className="text-xs text-text-tertiary mt-1">请求ID: {error.requestId}</p>
          )}
        </div>
        {isAppError && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-text-tertiary hover:text-text-secondary underline shrink-0"
          >
            {showDetails ? "收起" : "详情"}
          </button>
        )}
      </div>
      {showDetails && isAppError && (
        <div className="mt-2 pt-2 border-t border-border space-y-1">
          <p className="text-xs text-text-tertiary">错误位置: {error.errorLocation}</p>
          <p className="text-xs text-text-tertiary">错误类型: {error.errorType}</p>
          <p className="text-xs text-text-tertiary">时间: {error.timestamp}</p>
          {error.details && Object.keys(error.details).length > 0 && (
            <p className="text-xs text-text-tertiary">详情: {JSON.stringify(error.details)}</p>
          )}
        </div>
      )}
    </Alert>
  );
}
