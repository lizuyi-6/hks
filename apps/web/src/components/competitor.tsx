"use client";

import { useState } from "react";
import { NextStepCard, SectionCard, SourceTag, StatusBadge } from "@a1plus/ui";
import { parseErrorResponse } from "@/lib/errors";

type Envelope<T> = {
  mode: string;
  provider: string;
  traceId: string;
  sourceRefs: Array<{ title: string; url?: string; note?: string }>;
  disclaimer: string;
  normalizedPayload: T;
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
  // legacy fields
  trademarks?: Array<{ name: string; trademark_count: number; patent_count: number; reg_status: string }>;
  patents_count?: number;
};

const jsonHeaders = { "Content-Type": "application/json" };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend${path}`, {
    ...init,
    headers: { ...jsonHeaders, ...(init?.headers ?? {}) }
  });
  if (!response.ok) throw parseErrorResponse(await response.text(), path);
  return response.json() as Promise<T>;
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

export function CompetitorWorkspace() {
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
      if (!response.result) {
        throw new Error("追踪结果为空");
      }
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
      <SectionCard title="竞争对手追踪" eyebrow="竞争对手">
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
            ) : (
              "追踪竞争对手"
            )}
          </button>
          {loading ? (
            <div className="rounded-2xl border border-rust/20 bg-rust/5 p-4">
              <p className="text-sm text-rust">
                正在查询竞争对手知识产权信息，请稍候...
              </p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </form>
      </SectionCard>

      {result && payload ? (
        <>
        <SectionCard
          title="追踪结果"
          eyebrow="结果"
          actions={<SourceTag mode={result.mode as "real" | "mock"} provider={result.provider} />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">IP 活跃度</p>
              <div className="mt-3">
                <StatusBadge label={payload.ip_activity} tone={activityTone(payload.ip_activity)} />
              </div>
              {payload.analysis ? (
                <p className="mt-3 text-sm leading-7 text-slate-600">{payload.analysis}</p>
              ) : payload.recommendation ? (
                <p className="mt-3 text-sm leading-7 text-slate-600">{payload.recommendation}</p>
              ) : null}
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

          {/* IP Landscape */}
          {payload.ip_landscape && Object.keys(payload.ip_landscape).length > 0 ? (
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
          ) : null}

          {/* Threats */}
          {payload.threats && payload.threats.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">潜在威胁</p>
              <div className="grid gap-3">
                {payload.threats.map((t, i) => (
                  <div key={i} className={`rounded-xl border p-3 ${severityColor(t.severity)}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge label={t.severity} tone={activityTone(t.severity)} />
                    </div>
                    <p className="text-sm font-medium">{t.threat}</p>
                    <p className="mt-1 text-xs opacity-80">应对建议：{t.defense}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Opportunities */}
          {payload.opportunities && payload.opportunities.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">机会点</p>
              <ul className="list-disc pl-5 space-y-2">
                {payload.opportunities.map((o, i) => (
                  <li key={i} className="text-sm leading-6 text-slate-600">{o}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Recommendations */}
          {payload.recommendations && payload.recommendations.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">行动建议</p>
              <ol className="list-decimal pl-5 space-y-2">
                {payload.recommendations.map((r, i) => (
                  <li key={i} className="text-sm leading-6 text-slate-600">{r}</li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
            {result.disclaimer}
          </div>
        </SectionCard>
        <NextStepCard
          title="建议进行合同审查"
          description="竞争对手追踪完成，建议进行合同审查以保护自身知识产权。"
          action={{ label: "前往合同审查", href: "/contracts" }}
        />
        </>
      ) : null}
    </div>
  );
}
