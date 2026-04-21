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
  if (severity === "high") return "text-error-700 bg-error-50 border-error-100";
  if (severity === "medium") return "text-warning-700 bg-warning-50 border-warning-100";
  return "text-success-700 bg-success-50 border-success-100";
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
        throw new Error("??????");
      }
      setResult(response.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "????");
    } finally {
      setLoading(false);
    }
  }

  const payload = result?.normalizedPayload;

  return (
    <div className="space-y-4">
      <SectionCard title="??????" eyebrow="Competitor">
        <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-4">
          <input
            name="companyName"
            placeholder="??????????"
            className="rounded-md border border-border bg-surface px-3 py-2 outline-none ring-primary-500/20 focus:ring focus:border-primary-500"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-8 items-center gap-2 rounded-md bg-primary-600 px-4 text-sm font-medium text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ???...
              </>
            ) : (
              "??????"
            )}
          </button>
          {loading ? (
            <div className="rounded-md border border-border bg-neutral-50 p-4">
              <p className="text-sm text-text-tertiary">
                ??????????????????...
              </p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-error-700">{error}</p> : null}
        </form>
      </SectionCard>

      {result && payload ? (
        <>
        <SectionCard
          title="????"
          eyebrow="Result"
          actions={<SourceTag mode={result.mode as "real" | "mock"} provider={result.provider} />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-border p-4">
              <p className="text-sm font-semibold text-text-primary">IP ???</p>
              <div className="mt-3">
                <StatusBadge label={payload.ip_activity} tone={activityTone(payload.ip_activity)} />
              </div>
              {payload.analysis ? (
                <p className="mt-3 text-sm text-text-secondary">{payload.analysis}</p>
              ) : payload.recommendation ? (
                <p className="mt-3 text-sm text-text-secondary">{payload.recommendation}</p>
              ) : null}
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="text-sm font-semibold text-text-primary">????</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="text-center">
                  <p className="num-display text-2xl text-text-primary">{payload.patents_count ?? "-"}</p>
                  <p className="text-xs text-text-tertiary">???</p>
                </div>
                <div className="text-center">
                  <p className="num-display text-2xl text-text-primary">{(payload.trademarks ?? []).length || "-"}</p>
                  <p className="text-xs text-text-tertiary">????</p>
                </div>
              </div>
            </div>
          </div>

          {payload.ip_landscape && Object.keys(payload.ip_landscape).length > 0 ? (
            <div className="mt-4 rounded-md border border-border p-4">
              <p className="text-sm font-semibold text-text-primary mb-3">????????</p>
              <div className="divide-y divide-border">
                {Object.entries(payload.ip_landscape).map(([key, value]) => (
                  <div key={key} className="py-2 first:pt-0 last:pb-0">
                    <p className="text-xs font-medium text-text-tertiary mb-1">{key}</p>
                    <p className="text-sm text-text-primary">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {payload.threats && payload.threats.length > 0 ? (
            <div className="mt-4 rounded-md border border-border p-4">
              <p className="text-sm font-semibold text-text-primary mb-3">????</p>
              <div className="divide-y divide-border">
                {payload.threats.map((t, i) => (
                  <div key={i} className={`rounded-md border p-3 mb-2 last:mb-0 ${severityColor(t.severity)}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge label={t.severity} tone={activityTone(t.severity)} />
                    </div>
                    <p className="text-sm font-medium">{t.threat}</p>
                    <p className="mt-1 text-xs opacity-80">?????{t.defense}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {payload.opportunities && payload.opportunities.length > 0 ? (
            <div className="mt-4 rounded-md border border-border p-4">
              <p className="text-sm font-semibold text-text-primary mb-3">???</p>
              <ul className="list-disc pl-5 space-y-1.5">
                {payload.opportunities.map((o, i) => (
                  <li key={i} className="text-sm text-text-secondary">{o}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {payload.recommendations && payload.recommendations.length > 0 ? (
            <div className="mt-4 rounded-md border border-border p-4">
              <p className="text-sm font-semibold text-text-primary mb-3">????</p>
              <ol className="list-decimal pl-5 space-y-1.5">
                {payload.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-text-secondary">{r}</li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="mt-4 rounded-md border border-warning-100 bg-warning-50 p-4 text-sm text-warning-700">
            {result.disclaimer}
          </div>
        </SectionCard>
        <NextStepCard
          title="????????"
          description="???????????????????????????"
          action={{ label: "??????", href: "/contracts" }}
        />
        </>
      ) : null}
    </div>
  );
}
