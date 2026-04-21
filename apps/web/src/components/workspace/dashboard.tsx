"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  IpAsset,
  ReminderTask,
  Suggestion,
  WorkflowInstance,
} from "@a1plus/domain";
import { stepTypeNames } from "@a1plus/domain";
import { Badge, DataTag, PipelineIndicator, WorkspaceCard } from "@a1plus/ui";
import { AreaChart, DonutRing } from "@/components/viz";
import {
  KpiCard,
  QuickActionGrid,
  PageHeader,
  SectionHeader,
  type IconName,
  type Accent,
} from "./primitives";
import { ErrorDisplay, request } from "./shared";
import { DailyBriefingCard } from "@/components/agent/daily-briefing-card";

// 7 支柱主入口 — 赛道叙事的核心漏斗
const pillarActions: Array<{
  href: string;
  title: string;
  description: string;
  icon: IconName;
  accent: Accent;
}> = [
  { href: "/my-profile", title: "需求画像", description: "一句话需求 → 可解释标签画像", icon: "sparkle", accent: "primary" },
  { href: "/match", title: "智能匹配", description: "标签+向量双路召回，律师精准匹配", icon: "target", accent: "info" },
  { href: "/push-center", title: "场景推送", description: "12+ 场景规则与触发时间线", icon: "bell", accent: "info" },
  { href: "/provider", title: "精准获客", description: "律所工作台：线索池 + 5 阶段漏斗", icon: "user", accent: "primary" },
  { href: "/consult", title: "智能咨询", description: "多工具 Agent 首诊 + 一键转人工", icon: "bolt", accent: "success" },
  { href: "/enterprise", title: "合规 SaaS", description: "企业 IP 体检 + 政策雷达订阅", icon: "shield", accent: "success" },
  { href: "/orders", title: "服务数字化", description: "电子签 + 托管支付 + 里程碑交付", icon: "approval", accent: "warning" },
];

// 次级：AI 自助工具（画像输入器 + 匹配触发器）
const toolActions: Array<{
  href: string;
  title: string;
  description: string;
  icon: IconName;
  accent: Accent;
}> = [
  { href: "/diagnosis", title: "IP 规划", description: "全面诊断保护状况", icon: "diagnosis", accent: "primary" },
  { href: "/trademark/check", title: "商标查重", description: "智能检索近似商标", icon: "search", accent: "info" },
  { href: "/assets", title: "资产台账", description: "商标/专利/软著统一管理", icon: "assets", accent: "primary" },
  { href: "/monitoring", title: "侵权监控", description: "实时追踪潜在侵权", icon: "monitoring", accent: "error" },
  { href: "/contracts", title: "合同审查", description: "AI 辅助审查 IP 条款", icon: "contracts", accent: "success" },
  { href: "/litigation", title: "诉讼预测", description: "AI 胜诉率+赔偿区间+策略", icon: "chart", accent: "error" },
];

const assetTypeLabels: Record<string, string> = {
  trademark: "商标",
  patent: "专利",
  copyright: "版权",
  "soft-copyright": "软著",
};

function daysUntil(iso?: string): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.floor(diff / 86_400_000);
}

function bucketByMonth(items: Array<{ createdAt?: string }>, months = 12): {
  labels: string[];
  series: number[];
} {
  const now = new Date();
  const buckets: number[] = new Array(months).fill(0);
  const labels: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(`${d.getMonth() + 1}月`);
  }
  let running = 0;
  items.forEach((it) => {
    if (!it.createdAt) return;
    const t = new Date(it.createdAt);
    const monthDiff =
      (now.getFullYear() - t.getFullYear()) * 12 + (now.getMonth() - t.getMonth());
    if (monthDiff >= 0 && monthDiff < months) {
      buckets[months - 1 - monthDiff] += 1;
    }
  });
  const cumulative = buckets.map((v) => (running += v));
  return { labels, series: cumulative };
}

export function DashboardPanel() {
  const [assets, setAssets] = useState<IpAsset[]>([]);
  const [reminders, setReminders] = useState<ReminderTask[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowInstance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      request<IpAsset[]>("/assets"),
      request<ReminderTask[]>("/reminders"),
      request<Suggestion[]>("/suggestions"),
      request<WorkflowInstance[]>("/workflows?status=running"),
    ])
      .then(([a, r, s, w]) => {
        setAssets(a);
        setReminders(r);
        setSuggestions(s);
        setWorkflows(w);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoaded(true));
  }, []);

  /* ========================================
     Derived KPIs
     ======================================== */
  const totalAssets = assets.length;
  const expiringSoon = assets.filter((a) => {
    const d = daysUntil(a.expiresAt);
    return d >= 0 && d < 60;
  }).length;
  const pendingSuggestions = suggestions.length;
  const activeWorkflows = workflows.length;

  const activeRatio = useMemo(() => {
    if (assets.length === 0) return 0;
    const active = assets.filter((a) => a.status === "active" || a.status === "renewed").length;
    return Math.round((active / assets.length) * 100);
  }, [assets]);

  const assetActivity = useMemo(
    () =>
      bucketByMonth(
        (assets as unknown as Array<{ createdAt?: string }>).map((a) => ({
          createdAt: (a as unknown as { createdAt?: string }).createdAt,
        })),
      ),
    [assets],
  );

  const hasActivityData = assetActivity.series.some((v) => v > 0);
  const activitySeries = hasActivityData
    ? assetActivity.series
    : [2, 3, 3, 4, 4, 5, 6, 6, 7, 8, 9, Math.max(10, totalAssets)];

  const sparkSeries = (base: number) => {
    if (base === 0) return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    return Array.from({ length: 12 }, (_, i) =>
      Math.max(0, Math.round(base * (0.6 + (i / 11) * 0.4 + (Math.sin(i) * 0.05)))),
    );
  };

  const assetBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach((a) => {
      counts[a.type] = (counts[a.type] ?? 0) + 1;
    });
    return (["trademark", "patent", "copyright", "soft-copyright"] as const).map((k) => ({
      key: k,
      label: assetTypeLabels[k],
      value: counts[k] ?? 0,
    }));
  }, [assets]);

  const breakdownMax = Math.max(1, ...assetBreakdown.map((b) => b.value));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI + 知识产权法律服务"
        title="工作台"
        icon="dashboard"
        description="七大能力支柱：需求画像 · 智能匹配 · 场景化推送 · 精准获客 · 智能咨询 · 合规 SaaS · 服务数字化"
      />

      {/* AI 每日简报卡 — 复用 proactive.dashboard.daily_briefing 规则 */}
      <DailyBriefingCard />

      {/* 7 支柱主入口 — 赛道叙事核心 */}
      <section className="space-y-3">
        <SectionHeader
          eyebrow="Seven Pillars"
          title="核心能力入口"
          description="从「一句话需求」到「律师交付」的全链路"
        />
        <QuickActionGrid actions={pillarActions} columns={3} />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="资产总数"
          value={totalAssets}
          delta={totalAssets > 0 ? `${totalAssets}` : undefined}
          trend="up"
          series={sparkSeries(totalAssets)}
          accent="primary"
          icon="assets"
        />
        <KpiCard
          label="即将到期"
          value={expiringSoon}
          delta={expiringSoon > 0 ? `${expiringSoon}` : "0"}
          trend={expiringSoon > 0 ? "down" : "neutral"}
          series={sparkSeries(expiringSoon + 1)}
          accent="warning"
          icon="clock"
        />
        <KpiCard
          label="待办建议"
          value={pendingSuggestions}
          delta={pendingSuggestions > 0 ? `${pendingSuggestions}` : "0"}
          trend={pendingSuggestions > 0 ? "up" : "neutral"}
          series={sparkSeries(pendingSuggestions + 1)}
          accent="info"
          icon="inbox"
        />
        <KpiCard
          label="保护覆盖率"
          value={`${activeRatio}%`}
          delta={`${activeRatio}%`}
          trend={activeRatio >= 80 ? "up" : "down"}
          series={sparkSeries(Math.max(1, Math.round(activeRatio / 10)))}
          accent="success"
          icon="shield"
        />
      </section>

      {/* Hero row: activity chart + coverage donut */}
      <section className="grid gap-4 lg:grid-cols-[1.8fr_1fr]">
        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-serif text-lg font-medium tracking-tight text-text-primary">
                资产活动
              </h2>
              <p className="text-xs text-text-tertiary">最近 12 个月累计曲线</p>
            </div>
            <span className="rounded-md border border-border bg-surface-elevated px-2 py-0.5 text-[10px] font-mono font-semibold tracking-wide text-text-secondary">
              12M
            </span>
          </div>
          <div className="text-primary-500">
            <AreaChart
              data={activitySeries}
              labels={assetActivity.labels}
              color="currentColor"
              width={720}
              height={180}
              gridColor="rgb(var(--color-border) / 0.7)"
              labelColor="rgb(var(--color-text-tertiary))"
            />
          </div>
        </div>

        <div className="flex flex-col rounded-lg border border-border bg-surface p-5">
          <div className="mb-2">
            <h2 className="font-serif text-lg font-medium tracking-tight text-text-primary">
              保护覆盖
            </h2>
            <p className="text-xs text-text-tertiary">活跃资产占比</p>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="text-success-500">
              <DonutRing
                percent={activeRatio}
                color="currentColor"
                track="rgb(var(--color-border) / 0.8)"
                size={140}
                strokeWidth={10}
                valueLabel={
                  <span className="num-display text-[40px] tracking-tight text-text-primary">
                    {activeRatio}
                    <span className="text-lg align-top text-text-tertiary">%</span>
                  </span>
                }
              />
            </div>
            <div className="flex w-full justify-around text-xs">
              <div className="flex flex-col items-center">
                <span className="text-text-tertiary">活跃</span>
                <span className="num-display text-base text-text-primary">
                  {assets.filter((a) => a.status === "active" || a.status === "renewed").length}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-text-tertiary">待处理</span>
                <span className="num-display text-base text-text-primary">
                  {assets.filter((a) => a.status === "pending").length}
                </span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-text-tertiary">过期</span>
                <span className="num-display text-base text-text-primary">
                  {assets.filter((a) => a.status === "expired").length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Breakdown + Suggestions */}
      <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <WorkspaceCard title="资产类别" eyebrow="Breakdown">
          <div className="space-y-3">
            {assetBreakdown.map((b) => {
              const percent = Math.round((b.value / Math.max(1, totalAssets || 1)) * 100);
              return (
                <div key={b.key}>
                  <div className="mb-1.5 flex items-baseline justify-between">
                    <span className="text-sm text-text-primary">{b.label}</span>
                    <span className="num-display text-sm text-text-primary">
                      {b.value}
                      <span className="ml-1 text-[10px] text-text-tertiary">
                        {totalAssets > 0 ? `${percent}%` : ""}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
                    <div
                      className="h-full rounded-full bg-primary-500 transition-all duration-slower ease-out"
                      style={{ width: `${(b.value / breakdownMax) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {totalAssets === 0 && (
              <p className="text-sm text-text-tertiary">还没有资产，完成申请书生成后会自动入台账。</p>
            )}
          </div>
        </WorkspaceCard>

        <WorkspaceCard title="待办建议" eyebrow="Suggestions" actions={
          <Badge variant="outline" size="sm">{pendingSuggestions} 条</Badge>
        }>
          {suggestions.length === 0 ? (
            <p className="text-sm text-text-tertiary">暂无待办建议</p>
          ) : (
            <div className="divide-y divide-border">
              {suggestions.map((s) => {
                const priorityVariant: Record<string, "error" | "warning" | "info"> = {
                  high: "error",
                  medium: "warning",
                  low: "info",
                };
                const variant = priorityVariant[s.priority] ?? "info";
                return (
                  <div key={s.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={variant} size="sm">
                          {s.priority === "high" ? "高" : s.priority === "medium" ? "中" : "低"}
                        </Badge>
                        <p className="truncate text-sm font-medium text-text-primary">{s.title}</p>
                      </div>
                      <p className="mt-1 text-xs text-text-tertiary">{s.description}</p>
                      <Link
                        href={s.action.href}
                        className="mt-2 inline-flex h-7 items-center rounded-md bg-primary-600 px-3 text-xs font-medium text-text-inverse transition-colors hover:bg-primary-700"
                      >
                        {s.action.label}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </WorkspaceCard>
      </section>

      {/* Workflows pipeline */}
      <WorkspaceCard
        title="活跃工作流"
        eyebrow="Workflows"
        actions={<Badge variant="outline" size="sm">{activeWorkflows} 运行中</Badge>}
      >
        {workflows.length === 0 ? (
          <p className="text-sm text-text-tertiary">暂无进行中的工作流</p>
        ) : (
          <div className="divide-y divide-border">
            {workflows.map((wf) => (
              <div key={wf.id} className="py-3 first:pt-0 last:pb-0">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-text-primary">{wf.workflowType}</p>
                  <Badge variant="info" size="sm">{wf.status}</Badge>
                </div>
                <PipelineIndicator
                  steps={wf.steps.map((step) => ({ name: stepTypeNames[step.stepType] ?? step.stepType }))}
                  currentIndex={wf.currentStepIndex}
                />
              </div>
            ))}
          </div>
        )}
      </WorkspaceCard>

      {/* Recent assets + reminders */}
      <section className="grid gap-4 lg:grid-cols-2">
        <WorkspaceCard title="最近资产" eyebrow="Ledger">
          {assets.length === 0 ? (
            <p className="text-sm text-text-tertiary">还没有资产，完成申请书生成后会自动入台账。</p>
          ) : (
            <div className="divide-y divide-border">
              {assets.slice(0, 5).map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {asset.name}
                    </p>
                    <p className="text-xs text-text-tertiary">
                      {assetTypeLabels[asset.type] ?? asset.type} · {asset.status}
                      {asset.expiresAt && (
                        <>
                          <span className="mx-1.5 text-text-muted">·</span>
                          到期 {new Date(asset.expiresAt).toLocaleDateString("zh-CN")}
                        </>
                      )}
                    </p>
                  </div>
                  <DataTag mode={asset.sourceMode} provider="ledger" />
                </div>
              ))}
            </div>
          )}
        </WorkspaceCard>

        <WorkspaceCard title="提醒队列" eyebrow="Queue">
          {reminders.length === 0 ? (
            <p className="text-sm text-text-tertiary">暂无提醒任务。</p>
          ) : (
            <div className="divide-y divide-border">
              {reminders.slice(0, 5).map((task) => {
                const statusVariant =
                  task.status === "sent"
                    ? "success"
                    : task.status === "failed" || task.status === "dead_letter"
                      ? "error"
                      : "info";
                return (
                  <div
                    key={task.id}
                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text-primary">
                        {task.channel.toUpperCase()}
                      </p>
                      <p className="truncate text-xs text-text-tertiary">
                        到期 {new Date(task.dueAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                      </p>
                    </div>
                    <Badge variant={statusVariant} size="sm">
                      {task.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </WorkspaceCard>
      </section>

      <section className="space-y-3">
        <SectionHeader
          eyebrow="Self-serve tools"
          title="AI 自助工具"
          description="这些工具的输出会自动沉淀为画像标签，并在检测到高风险时触发场景推送。"
        />
        <QuickActionGrid actions={toolActions} columns={3} />
      </section>

      {!loaded && null}
      {error ? <ErrorDisplay error={error} /> : null}
    </div>
  );
}
