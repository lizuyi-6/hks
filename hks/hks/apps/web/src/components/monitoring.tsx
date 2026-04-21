"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  WorkspaceCard,
  DataTag,
  Badge,
  DisclaimerBox,
  SubmitButton,
  FormInput,
} from "@a1plus/ui";
import { parseErrorResponse } from "@/lib/errors";
import { Sparkline } from "@/components/viz";
import {
  PageHeader,
  PillarBanner,
  SectionHeader,
  StatTile,
  KpiCard,
  IconGlyph,
  IconTabBar,
  accentBgClass,
  severityAccent,
  EmptyHero,
  type IconName,
  type Accent,
} from "@/components/workspace/primitives";
import { StackedAreaChart, RadialBar, GaugeArc } from "@/components/workspace/viz-hero";

type Envelope<T> = {
  mode: string;
  provider: string;
  traceId: string;
  retrievedAt?: string;
  sourceRefs: Array<{ title: string; url?: string; note?: string }>;
  disclaimer: string;
  normalizedPayload: T;
};

type Alert = {
  title: string;
  severity: "high" | "medium" | "low";
  description: string;
  source_url: string;
  found_at: string;
};

type ScanResult = {
  query: string;
  alerts: Alert[];
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

type TrendPoint = { weekStart: string; total: number; high: number; medium: number; low: number };

type TrendResponse = {
  series: TrendPoint[];
  totals: { total: number; high: number; medium: number; low: number };
  threatDistribution: Record<string, number>;
  mode: string;
  provider: string;
};

type WatchlistItem = {
  id: string;
  keyword: string;
  type: "trademark" | "keyword" | "domain";
  frequency: "daily" | "weekly";
  lastHit: string | null;
  alerts: number;
  status: "active" | "paused";
};

type Tab = "overview" | "scan" | "competitor" | "watchlist";

const jsonHeaders = { "Content-Type": "application/json" };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend${path}`, {
    ...init,
    headers: { ...jsonHeaders, ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw parseErrorResponse(await response.text(), path);
  return response.json() as Promise<T>;
}

function relativeTime(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.round(diff / (1000 * 60 * 60));
  if (hours < 1) return "刚刚";
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} 天前`;
  return `${Math.round(days / 7)} 周前`;
}

const THREAT_LABELS: Record<string, string> = {
  knockoff: "近似商标",
  squatting: "商标抢注",
  counterfeit: "假冒仿制",
  cybersquatting: "域名抢注",
  misuse: "不当使用",
};

const THREAT_COLORS = [
  "rgb(var(--color-error-500))",
  "rgb(var(--color-warning-500))",
  "rgb(var(--color-primary-600))",
  "rgb(var(--color-info-500))",
  "rgb(var(--color-success-500))",
];

const WATCHLIST_TYPE_META: Record<
  WatchlistItem["type"],
  { icon: IconName; label: string; accent: Accent }
> = {
  trademark: { icon: "trademark", label: "商标", accent: "primary" },
  keyword: { icon: "search", label: "关键字", accent: "info" },
  domain: { icon: "target", label: "域名", accent: "warning" },
};

/* ─────────────────────────────
   OVERVIEW TAB
   ───────────────────────────── */
function OverviewTab({ trend }: { trend: TrendResponse | null }) {
  if (!trend) {
    return (
      <div className="rounded-lg border border-border bg-surface p-6">
        <Sparkline data={[1, 2, 1, 3, 4, 2, 5, 6, 4, 7, 6, 8]} color="rgb(var(--color-primary-600))" width={400} height={40} />
        <p className="mt-3 text-center text-sm text-text-tertiary">加载监控趋势中…</p>
      </div>
    );
  }

  const areaLabels = trend.series.map((p) => p.weekStart.slice(5));
  const highSeries = trend.series.map((p) => p.high);
  const mediumSeries = trend.series.map((p) => p.medium);
  const lowSeries = trend.series.map((p) => p.low);
  const lastWeek = trend.series[trend.series.length - 1];
  const prevWeek = trend.series[trend.series.length - 2] ?? lastWeek;
  const delta = lastWeek && prevWeek ? lastWeek.total - prevWeek.total : 0;
  const deltaTrend = delta > 0 ? "up" : delta < 0 ? "down" : "neutral";

  const threats = Object.entries(trend.threatDistribution);
  const threatTotal = threats.reduce((sum, [, v]) => sum + v, 0);
  const radialItems = threats.map(([key, value], index) => ({
    label: THREAT_LABELS[key] ?? key,
    value,
    color: THREAT_COLORS[index % THREAT_COLORS.length],
  }));
  const highPercent = trend.totals.total
    ? Math.round((trend.totals.high / trend.totals.total) * 100)
    : 0;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="近 12 周告警"
          value={trend.totals.total}
          accent="primary"
          icon="monitoring"
          series={trend.series.map((p) => p.total)}
          delta={delta === 0 ? undefined : `${delta > 0 ? "+" : ""}${delta}`}
          trend={deltaTrend}
          hint="较上周"
        />
        <KpiCard
          label="高风险"
          value={trend.totals.high}
          accent="error"
          icon="alert"
          series={highSeries}
        />
        <KpiCard
          label="中风险"
          value={trend.totals.medium}
          accent="warning"
          icon="clock"
          series={mediumSeries}
        />
        <KpiCard
          label="低风险"
          value={trend.totals.low}
          accent="success"
          icon="check"
          series={lowSeries}
        />
      </section>

      <section className="relative overflow-hidden rounded-lg border border-error-100 bg-gradient-to-br from-error-50/30 via-surface to-surface p-5">
        {/* pulse beacon at top right */}
        <span className="pointer-events-none absolute right-5 top-5 flex h-3 w-3 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-error-500" />
        </span>
        <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
          <SectionHeader
            eyebrow="Stacked trend"
            title="告警分层趋势"
            description="按严重度堆叠 · 近 12 周"
          />
          <DataTag mode={trend.mode as "real" | "mock"} provider={trend.provider} />
        </div>
        <div className="mt-4">
          <StackedAreaChart
            series={[
              { label: "高", color: "rgb(var(--color-error-500))", data: highSeries },
              { label: "中", color: "rgb(var(--color-warning-500))", data: mediumSeries },
              { label: "低", color: "rgb(var(--color-success-500))", data: lowSeries },
            ]}
            labels={areaLabels}
            width={900}
            height={180}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-text-tertiary">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-error-500" />高风险 · {trend.totals.high}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warning-500" />中风险 · {trend.totals.medium}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success-500" />低风险 · {trend.totals.low}
          </span>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-lg border border-border bg-surface p-5">
          <SectionHeader eyebrow="Share" title="高风险占比" description="Risk concentration" />
          <div className="mt-4 flex justify-center text-error-500">
            <GaugeArc
              value={highPercent}
              size={220}
              strokeWidth={14}
              color="currentColor"
              track="rgb(var(--color-border) / 0.8)"
              thresholds={[
                { at: 30, color: "rgb(var(--color-success-500))" },
                { at: 60, color: "rgb(var(--color-warning-500))" },
                { at: 100, color: "rgb(var(--color-error-500))" },
              ]}
              valueLabel={
                <span className="num-display text-3xl tracking-tight text-text-primary">
                  {highPercent}%
                </span>
              }
              caption={<span className="text-xs text-text-tertiary">高 / 全部</span>}
            />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <SectionHeader
            eyebrow="Threat radial"
            title="威胁类型分布"
            description="同心圆弧长 = 数量占比"
          />
          {radialItems.length > 0 && threatTotal > 0 ? (
            <div className="mt-4 flex justify-center pb-[140px]">
              <RadialBar items={radialItems} size={220} strokeWidth={14} gap={4} />
            </div>
          ) : (
            <div className="mt-4 flex h-[200px] items-center justify-center text-xs text-text-tertiary">
              暂无威胁数据
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ─────────────────────────────
   SCAN TAB
   ───────────────────────────── */
function ScanTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<ScanResult> | null>(null);
  const [severityTab, setSeverityTab] = useState<"all" | "high" | "medium" | "low">("all");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const response = await request<{
        job_id: string;
        status: string;
        result?: Envelope<ScanResult>;
      }>("/monitoring/scan", {
        method: "POST",
        body: JSON.stringify({ query: String(formData.get("query") ?? "") }),
      });
      if (!response.result) throw new Error("扫描结果为空");
      setResult(response.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "扫描失败");
    } finally {
      setLoading(false);
    }
  }

  const alerts = useMemo(
    () => result?.normalizedPayload.alerts ?? [],
    [result],
  );
  const high = alerts.filter((a) => a.severity === "high").length;
  const medium = alerts.filter((a) => a.severity === "medium").length;
  const low = alerts.filter((a) => a.severity === "low").length;
  const filtered = useMemo(
    () => (severityTab === "all" ? alerts : alerts.filter((a) => a.severity === severityTab)),
    [alerts, severityTab],
  );

  return (
    <div className="space-y-4">
      <WorkspaceCard title="侵权扫描" eyebrow="Scan">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleSubmit(new FormData(e.currentTarget));
          }}
          className="grid gap-4"
        >
          <FormInput name="query" label="关键词" placeholder="输入商标名称或关键词进行侵权扫描" required />
          <SubmitButton loading={loading} loadingText="扫描中...">
            执行侵权扫描
          </SubmitButton>
          {loading && <p className="text-sm text-text-tertiary">正在扫描网络中可能存在的侵权行为，请稍候...</p>}
          {error && <p className="text-sm text-error-500">{error}</p>}
        </form>
      </WorkspaceCard>

      {result && (
        <>
          <section className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <StatTile label="发现条目" value={result.normalizedPayload.total} icon="search" accent="primary" />
            <StatTile label="高风险" value={high} icon="alert" accent="error" />
            <StatTile label="中风险" value={medium} icon="clock" accent="warning" />
            <StatTile label="低风险" value={low} icon="check" accent="success" />
          </section>

          <WorkspaceCard
            title="扫描结果"
            eyebrow="Alerts"
            actions={
              <DataTag mode={result.mode as "real" | "mock"} provider={result.provider} />
            }
          >
            <div className="mb-3">
              <IconTabBar<"all" | "high" | "medium" | "low">
                active={severityTab}
                onChange={setSeverityTab}
                tabs={[
                  { key: "all", label: "全部", icon: "filter", count: alerts.length },
                  { key: "high", label: "高", icon: "alert", count: high },
                  { key: "medium", label: "中", icon: "clock", count: medium },
                  { key: "low", label: "低", icon: "check", count: low },
                ]}
              />
            </div>
            {filtered.length === 0 ? (
              <EmptyHero
                icon="search"
                title="暂无该等级告警"
                description="可切换 Tab 查看其他严重度，或重新扫描"
              />
            ) : (
              <div className="space-y-3">
                {filtered.map((alert, index) => {
                  const accent = severityAccent(alert.severity);
                  return (
                    <div
                      key={`${alert.title}-${index}`}
                      className={`rounded-lg border border-l-4 border-border bg-surface p-4 ${
                        accent === "error"
                          ? "border-l-error-500"
                          : accent === "warning"
                            ? "border-l-warning-500"
                            : "border-l-success-500"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex items-start gap-2">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${accentBgClass(accent)}`}>
                            <IconGlyph name={accent === "error" ? "alert" : "search"} size={12} />
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-text-primary">{alert.title}</p>
                            <p className="mt-0.5 text-[11px] text-text-tertiary">
                              {new Date(alert.found_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={accent === "error" ? "error" : accent === "warning" ? "warning" : "info"}
                          size="sm"
                          dot
                        >
                          {alert.severity}
                        </Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">{alert.description}</p>
                      {alert.source_url && (
                        <a
                          href={alert.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
                        >
                          <IconGlyph name="external" size={12} />
                          查看来源
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <DisclaimerBox>{result.disclaimer}</DisclaimerBox>
          </WorkspaceCard>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────
   COMPETITOR TAB
   ───────────────────────────── */
function CompetitorTab() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<TrackResult> | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const response = await request<{
        job_id: string;
        status: string;
        result?: Envelope<TrackResult>;
      }>("/competitors/track", {
        method: "POST",
        body: JSON.stringify({ company_name: String(formData.get("companyName") ?? "") }),
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
  const activityScore = payload
    ? payload.ip_activity === "high"
      ? 85
      : payload.ip_activity === "medium"
        ? 55
        : 25
    : 0;
  const activityAccent: Accent = payload
    ? payload.ip_activity === "high"
      ? "error"
      : payload.ip_activity === "medium"
        ? "warning"
        : "success"
    : "info";
  const activityColorCls =
    activityAccent === "error"
      ? "text-error-500"
      : activityAccent === "warning"
        ? "text-warning-500"
        : "text-success-500";
  const threats = useMemo(() => payload?.threats ?? [], [payload]);

  const threatDistribution = useMemo(() => {
    if (threats.length === 0) return null;
    const counts = { high: 0, medium: 0, low: 0 } as Record<string, number>;
    threats.forEach((t) => {
      const sev = (t.severity ?? "").toLowerCase();
      if (sev in counts) counts[sev]++;
    });
    return counts;
  }, [threats]);

  return (
    <div className="space-y-4">
      <WorkspaceCard title="竞争对手追踪" eyebrow="Competitor">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleSubmit(new FormData(e.currentTarget));
          }}
          className="grid gap-4"
        >
          <FormInput name="companyName" label="公司名称" placeholder="输入竞争对手公司名称" required />
          <SubmitButton loading={loading} loadingText="查询中...">
            追踪竞争对手
          </SubmitButton>
          {loading && <p className="text-sm text-text-tertiary">正在查询竞争对手知识产权信息，请稍候...</p>}
          {error && <p className="text-sm text-error-500">{error}</p>}
        </form>
      </WorkspaceCard>

      {result && payload && (
        <>
          <section className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
            <div className="rounded-lg border border-border bg-surface p-5">
              <SectionHeader eyebrow="Activity" title="IP 活跃度" />
              <div className={`mt-3 flex items-center gap-4 ${activityColorCls}`}>
                <GaugeArc
                  value={activityScore}
                  size={150}
                  strokeWidth={11}
                  color="currentColor"
                  track="rgb(var(--color-border) / 0.8)"
                  valueLabel={
                    <span className="num-display text-xl text-text-primary">{activityScore}</span>
                  }
                />
                <div className="flex-1 text-sm">
                  <Badge
                    variant={activityAccent === "error" ? "error" : activityAccent === "warning" ? "warning" : "success"}
                    size="md"
                    dot
                  >
                    {payload.ip_activity}
                  </Badge>
                  {payload.analysis && (
                    <p className="mt-2 text-xs leading-6 text-text-secondary">{payload.analysis}</p>
                  )}
                </div>
              </div>
            </div>

            <StatTile
              label="专利数"
              value={payload.patents_count ?? 0}
              icon="patent"
              accent="info"
              hint={payload.company}
            />
            <StatTile
              label="商标记录"
              value={(payload.trademarks ?? []).length}
              icon="trademark"
              accent="primary"
              hint="含近似商标"
            />
          </section>

          {threatDistribution && (
            <section className="rounded-lg border border-border bg-surface p-5">
              <SectionHeader
                eyebrow="Threats"
                title="威胁严重度分布"
                actions={<Badge variant="outline" size="sm">{threats.length}</Badge>}
              />
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <StatTile label="高威胁" value={threatDistribution.high} icon="alert" accent="error" />
                <StatTile label="中威胁" value={threatDistribution.medium} icon="clock" accent="warning" />
                <StatTile label="低威胁" value={threatDistribution.low} icon="check" accent="success" />
              </div>
              <div className="mt-4 space-y-2">
                {threats.map((t, i) => {
                  const accent = severityAccent(t.severity);
                  return (
                    <div
                      key={i}
                      className={`rounded-md border border-l-4 border-border bg-surface-elevated/60 p-3 ${
                        accent === "error"
                          ? "border-l-error-500"
                          : accent === "warning"
                            ? "border-l-warning-500"
                            : "border-l-success-500"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={accent === "error" ? "error" : accent === "warning" ? "warning" : "success"}
                          size="sm"
                          dot
                        >
                          {t.severity}
                        </Badge>
                        <p className="text-sm font-medium text-text-primary">{t.threat}</p>
                      </div>
                      <p className="mt-1 text-xs leading-6 text-text-secondary">
                        <span className="font-medium text-text-primary">应对：</span>
                        {t.defense}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {payload.ip_landscape && Object.keys(payload.ip_landscape).length > 0 && (
            <WorkspaceCard title="知识产权布局" eyebrow="Landscape">
              <div className="grid gap-2 md:grid-cols-2">
                {Object.entries(payload.ip_landscape).map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded-md border border-border bg-surface-elevated/60 p-3"
                  >
                    <p className="text-xs font-medium text-text-tertiary">{key}</p>
                    <p className="mt-1 text-sm text-text-primary">{value}</p>
                  </div>
                ))}
              </div>
            </WorkspaceCard>
          )}

          {payload.opportunities && payload.opportunities.length > 0 && (
            <WorkspaceCard title="机会点" eyebrow="Opportunities">
              <ul className="space-y-2">
                {payload.opportunities.map((o, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-md border border-success-100 bg-success-50/50 px-3 py-2 text-sm">
                    <IconGlyph name="sparkle" size={12} className="mt-1 text-success-500" />
                    <span className="text-text-primary">{o}</span>
                  </li>
                ))}
              </ul>
            </WorkspaceCard>
          )}

          <DisclaimerBox>{result.disclaimer}</DisclaimerBox>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────
   WATCHLIST TAB
   ───────────────────────────── */
function WatchlistTab() {
  const [items, setItems] = useState<WatchlistItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [newType, setNewType] = useState<WatchlistItem["type"]>("keyword");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await request<{ items: WatchlistItem[] }>("/monitoring/watchlist");
        setItems(res.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败");
      }
    })();
  }, []);

  async function addItem() {
    if (!newKeyword.trim()) return;
    setBusy(true);
    try {
      const created = await request<WatchlistItem>("/monitoring/watchlist", {
        method: "POST",
        body: JSON.stringify({ keyword: newKeyword.trim(), type: newType }),
      });
      setItems((prev) => [
        { ...created, keyword: newKeyword.trim(), type: newType, frequency: "daily" },
        ...(prev ?? []),
      ]);
      setNewKeyword("");
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== id));
    try {
      await fetch(`/api/backend/monitoring/watchlist/${id}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <WorkspaceCard title="新增监控对象" eyebrow="Add watcher">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <FormInput
              name="keyword"
              label="关键词 / 商标 / 域名"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              placeholder="输入要监控的内容"
            />
          </div>
          <div className="flex gap-1 rounded-md border border-border bg-surface p-1">
            {(["trademark", "keyword", "domain"] as const).map((t) => {
              const meta = WATCHLIST_TYPE_META[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setNewType(t)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                    newType === t
                      ? accentBgClass(meta.accent)
                      : "text-text-secondary hover:bg-surface-elevated"
                  }`}
                >
                  <IconGlyph name={meta.icon} size={12} />
                  {meta.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => void addItem()}
            disabled={busy || !newKeyword.trim()}
            className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            <IconGlyph name="plus" size={14} />
            添加
          </button>
        </div>
      </WorkspaceCard>

      <WorkspaceCard
        title="监控对象"
        eyebrow="Watchlist"
        actions={
          items && <Badge variant="outline" size="sm">{items.length}</Badge>
        }
      >
        {error && <p className="text-sm text-error-500">{error}</p>}
        {items === null ? (
          <p className="py-4 text-center text-sm text-text-tertiary">加载中…</p>
        ) : items.length === 0 ? (
          <EmptyHero
            icon="monitoring"
            title="暂未添加监控对象"
            description="添加商标、关键字或域名开始自动监控"
          />
        ) : (
          <div className="divide-y divide-border">
            {items.map((item) => {
              const meta = WATCHLIST_TYPE_META[item.type];
              return (
                <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${accentBgClass(meta.accent)}`}>
                    <IconGlyph name={meta.icon} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {item.keyword || "—"}
                      </p>
                      <Badge
                        variant={item.status === "active" ? "success" : "default"}
                        size="sm"
                        dot
                      >
                        {item.status === "active" ? "监控中" : "已暂停"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] text-text-tertiary">
                      {meta.label} · {item.frequency === "daily" ? "每日扫描" : "每周扫描"} · 最近命中{" "}
                      {relativeTime(item.lastHit)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={item.alerts > 0 ? "warning" : "default"} size="sm">
                      告警 {item.alerts}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => void removeItem(item.id)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-text-tertiary transition-colors hover:border-error-100 hover:bg-error-50/40 hover:text-error-500"
                      aria-label="删除"
                    >
                      <IconGlyph name="trash" size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </WorkspaceCard>
    </div>
  );
}

/* ─────────────────────────────
   MAIN WORKSPACE
   ───────────────────────────── */
export function MonitoringWorkspace() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [trend, setTrend] = useState<TrendResponse | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await request<TrendResponse>("/monitoring/trend?weeks=12");
        setTrend(res);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Monitoring"
        title="监控与追踪"
        icon="monitoring"
        accent="error"
        description="集中查看告警趋势、扫描新告警、追踪竞品并管理监控对象。"
      />

      <PillarBanner
        pillar="push"
        hint="此处的高风险告警会自动喂给"
        extraLinks={[{ label: "查看场景推送时间线", href: "/push-center" }]}
      />

      <IconTabBar<Tab>
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: "overview", label: "概览", icon: "chart", count: trend?.totals.total },
          { key: "scan", label: "侵权扫描", icon: "search" },
          { key: "competitor", label: "竞品追踪", icon: "building" },
          { key: "watchlist", label: "监控对象", icon: "target" },
        ]}
      />

      {activeTab === "overview" && <OverviewTab trend={trend} />}
      {activeTab === "scan" && <ScanTab />}
      {activeTab === "competitor" && <CompetitorTab />}
      {activeTab === "watchlist" && <WatchlistTab />}

      <div className="rounded-lg border border-primary-100 bg-primary-50/60 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">
              <span className="mr-1.5 text-primary-600">→</span>
              查看 IP 资产台账
            </p>
            <p className="mt-1 text-xs text-text-secondary">
              监控和追踪完成后，建议回到资产台账核对最新状态。
            </p>
          </div>
          <Link
            href="/assets"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
          >
            <IconGlyph name="assets" size={14} />
            前往资产台账
          </Link>
        </div>
      </div>
    </div>
  );
}
