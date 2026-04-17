"use client";

import { useState } from "react";
import { NextStepCard, SectionCard, SourceTag, StatusBadge } from "@a1plus/ui";
import { parseErrorResponse } from "@/lib/errors";

type Envelope<T> = {
  mode: string;
  provider: string;
  traceId: string;
  retrievedAt?: string;
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

type TrackResult = {
  company: string;
  ip_activity: string;
  analysis?: string;
  recommendation?: string;
  recommendations?: string[];
  threats?: Array<{ threat: string; severity: string; defense: string }>;
  opportunities?: string[];
  ip_landscape?: Record<string, string>;
  trademarks?: Array<{ name: string; trademark_count: number; patent_count: number; reg_status: string }>;
  patents_count?: number;
};

type Tab = "monitoring" | "competitor";

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

function activityTone(activity: string) {
  if (activity === "high") return "danger" as const;
  if (activity === "medium") return "warning" as const;
  return "success" as const;
}

function severityColor(severity: string) {
  if (severity === "high") return "text-rose-600 bg-rose-50 border-rose-200";
  if (severity === "medium") return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-emerald-600 bg-emerald-50 border-emerald-200";
}

function MonitoringTab() {
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
      if (!response.result) throw new Error("扫描结果为空");
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
            ) : "执行侵权扫描"}
          </button>
          {loading && (
            <div className="rounded-2xl border border-rust/20 bg-rust/5 p-4">
              <p className="text-sm text-rust">正在扫描网络中可能存在的侵权行为，请稍候...</p>
            </div>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </form>
      </SectionCard>

      {result && (
        <SectionCard title="扫描结果" eyebrow="Result" actions={<SourceTag mode={result.mode as "real" | "mock"} provider={result.provider} />}>
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
              <p className="text-2xl font-bold text-amber-600">{result.normalizedPayload.total - result.normalizedPayload.high_count}</p>
              <p className="text-sm text-slate-500">中低风险</p>
            </div>
          </div>
          <div className="space-y-3">
            {result.normalizedPayload.alerts.map((alert, index) => (
              <div key={`${alert.title}-${index}`} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">{alert.title}</p>
                  <StatusBadge label={alert.severity} tone={severityTone(alert.severity)} />
                </div>
                <p className="mt-2 text-sm leading-7 text-slate-600">{alert.description}</p>
                {alert.source_url && (
                  <a href={alert.source_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-rust underline">查看来源</a>
                )}
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">{result.disclaimer}</div>
        </SectionCard>
      )}
    </div>
  );
}

function CompetitorTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<TrackResult> | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const response = await request<{ job_id: string; status: string; result?: Envelope<TrackResult> }>("/competitors/track", {
        method: "POST",
        body: JSON.stringify({ company_name: String(formData.get("companyName") ?? "") })
      });
      if (!response.result) throw new Error("追踪结果为空");
      setResult(response.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "查询失败");
    } finally {
      setLoading(false);
    }
  }

  const payload = result?.normalizedPayload;

  return (
    <div className="space-y-6">
      <SectionCard title="竞争对手追踪" eyebrow="Competitor">
        <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-4">
          <input
            name="companyName"
            placeholder="输入竞争对手公司名称"
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
                查询中...
              </>
            ) : "追踪竞争对手"}
          </button>
          {loading && (
            <div className="rounded-2xl border border-rust/20 bg-rust/5 p-4">
              <p className="text-sm text-rust">正在查询竞争对手知识产权信息，请稍候...</p>
            </div>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </form>
      </SectionCard>

      {result && payload && (
        <SectionCard title="追踪结果" eyebrow="Result" actions={<SourceTag mode={result.mode as "real" | "mock"} provider={result.provider} />}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">IP 活跃度</p>
              <div className="mt-3"><StatusBadge label={payload.ip_activity} tone={activityTone(payload.ip_activity)} /></div>
              {payload.analysis && <p className="mt-3 text-sm leading-7 text-slate-600">{payload.analysis}</p>}
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">数据概览</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="text-center">
                  <p className="text-xl font-bold text-slate-900">{payload.patents_count ?? "-"}</p>
                  <p className="text-sm text-slate-500">专利数</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-slate-900">{(payload.trademarks ?? []).length || "-"}</p>
                  <p className="text-sm text-slate-500">商标记录</p>
                </div>
              </div>
            </div>
          </div>

          {payload.ip_landscape && Object.keys(payload.ip_landscape).length > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">知识产权布局分析</p>
              <div className="grid gap-3">
                {Object.entries(payload.ip_landscape).map(([key, value]) => (
                  <div key={key} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500 mb-1">{key}</p>
                    <p className="text-sm leading-6 text-slate-700">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {payload.threats && payload.threats.length > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">潜在威胁</p>
              <div className="grid gap-3">
                {payload.threats.map((t, i) => (
                  <div key={i} className={`rounded-xl border p-3 ${severityColor(t.severity)}`}>
                    <div className="flex items-center gap-2 mb-1"><StatusBadge label={t.severity} tone={activityTone(t.severity)} /></div>
                    <p className="text-sm font-medium">{t.threat}</p>
                    <p className="mt-1 text-xs opacity-80">应对建议：{t.defense}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {payload.opportunities && payload.opportunities.length > 0 && (
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">机会点</p>
              <ul className="list-disc pl-5 space-y-2">
                {payload.opportunities.map((o, i) => <li key={i} className="text-sm leading-6 text-slate-600">{o}</li>)}
              </ul>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">{result.disclaimer}</div>
        </SectionCard>
      )}
    </div>
  );
}

export function MonitoringWorkspace() {
  const [activeTab, setActiveTab] = useState<Tab>("monitoring");

  const tabs: { key: Tab; label: string }[] = [
    { key: "monitoring", label: "侵权监控" },
    { key: "competitor", label: "竞品追踪" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-rust text-rust"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "monitoring" && <MonitoringTab />}
      {activeTab === "competitor" && <CompetitorTab />}

      <NextStepCard
        title="建议查看资产台账"
        description="监控和追踪完成后，建议查看 IP 资产台账了解整体情况。"
        action={{ label: "前往资产台账", href: "/assets" }}
      />
    </div>
  );
}
