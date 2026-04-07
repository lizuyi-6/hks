"use client";

import { useState } from "react";
import { NextStepCard, SectionCard, SourceTag, StatusBadge } from "@a1plus/ui";
import { parseErrorResponse } from "@/lib/errors";

type Envelope<T> = {
  mode: string;
  provider: string;
  traceId: string;
  retrievedAt: string;
  sourceRefs: Array<{ title: string; url?: string; note?: string }>;
  disclaimer: string;
  normalizedPayload: T;
};

type ScanResult = {
  query: string;
  alerts: Array<{
    title: string;
    severity: "high" | "medium" | "low";
    description: string;
    source_url: string;
    found_at: string;
  }>;
  total: number;
  high_count: number;
  message?: string;
};

const jsonHeaders = { "Content-Type": "application/json" };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = "/api/backend";
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...jsonHeaders, ...(init?.headers ?? {}) }
  });
  if (!response.ok) throw parseErrorResponse(await response.text(), path);
  return response.json() as Promise<T>;
}

function severityTone(severity: string) {
  if (severity === "high") return "danger" as const;
  if (severity === "medium") return "warning" as const;
  return "info" as const;
}

export function MonitoringWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<ScanResult> | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const response = await request<{ job_id: string; status: string; result?: Envelope<ScanResult> }>("/monitoring/scan", {
        method: "POST",
        body: JSON.stringify({ query: String(formData.get("query") ?? "") })
      });
      if (!response.result) {
        throw new Error("扫描结果为空");
      }
      setResult(response.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "扫描失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard title="侵权监控" eyebrow="Monitoring">
        <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-4">
          <input
            name="query"
            placeholder="输入商标名称或关键词进行侵权扫描"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                扫描中...
              </>
            ) : (
              "执行侵权扫描"
            )}
          </button>
          {loading ? (
            <div className="rounded-2xl border border-rust/20 bg-rust/5 p-4">
              <p className="text-sm text-rust">
                ⏳ 正在扫描网络中可能存在的侵权行为，请稍候...
              </p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </form>
      </SectionCard>

      {result ? (
        <>
        <SectionCard
          title="扫描结果"
          eyebrow="Result"
          actions={<SourceTag mode={result.mode as "real" | "mock"} provider={result.provider} />}
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{result.normalizedPayload.total}</p>
              <p className="text-sm text-slate-500">发现条目</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-rose-600">{result.normalizedPayload.high_count}</p>
              <p className="text-sm text-slate-500">高风险</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">
                {result.normalizedPayload.total - result.normalizedPayload.high_count}
              </p>
              <p className="text-sm text-slate-500">中低风险</p>
            </div>
          </div>
          <div className="space-y-3">
            {(result.normalizedPayload.alerts ?? []).map((alert, index) => (
              <div
                key={`${alert.title}-${index}`}
                className="rounded-2xl border border-slate-200 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">{alert.title}</p>
                  <StatusBadge label={alert.severity} tone={severityTone(alert.severity)} />
                </div>
                <p className="mt-2 text-sm leading-7 text-slate-600">{alert.description}</p>
                {alert.source_url ? (
                  <a
                    href={alert.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm text-rust underline"
                  >
                    查看来源
                  </a>
                ) : null}
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
            {result.disclaimer}
          </div>
        </SectionCard>
        <NextStepCard
          title="建议追踪竞争对手"
          description="侵权扫描完成，建议追踪竞争对手的 IP 动态以全面评估风险。"
          action={{ label: "前往竞争对手追踪", href: "/competitors" }}
        />
        </>
      ) : null}
    </div>
  );
}
