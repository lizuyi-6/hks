"use client";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import type { AutomationRule } from "@a1plus/domain";
import { proxyBaseUrl } from "@/lib/env";
import { trackError } from "@/lib/analytics";
import { Badge } from "@a1plus/ui";
import {
  PageHeader,
  SectionHeader,
  StatTile,
  EmptyHero,
  IconGlyph,
  type IconName,
  type Accent,
  accentBgClass,
} from "@/components/workspace/primitives";
import { HeatGrid } from "@/components/workspace/viz-hero";

interface Job {
  id: string;
  jobType: string;
  status: string;
  createdAt: string;
}

interface WorkflowStep {
  id: string;
  stepType: string;
  status: string;
  workflowId: string;
}

interface Workflow {
  id: string;
  workflowType: string;
  status: string;
  steps: WorkflowStep[];
}

interface RecentApproval {
  id: string;
  workflowType: string;
  stepLabel: string;
  decision: "approved" | "rejected";
  note?: string;
  approvedAt: string;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  "diagnosis.report": "IP 诊断",
  "trademark.application": "商标申请书生成",
  "trademark.check": "商标查重",
  "monitoring.scan": "侵权监控扫描",
  "competitor.track": "竞品追踪",
  "policy.digest": "政策速递",
  "contract.review": "合同审查",
  "patent.assess": "专利评估",
  "asset.expiry_check": "资产到期检查",
  "reminder.dispatch": "提醒发送",
  "due-diligence.investigate": "融资尽调",
};

const JOB_TYPE_ICONS: Record<string, IconName> = {
  "diagnosis.report": "diagnosis",
  "trademark.application": "edit",
  "trademark.check": "search",
  "monitoring.scan": "monitoring",
  "competitor.track": "target",
  "policy.digest": "policies",
  "contract.review": "contracts",
  "patent.assess": "patent",
  "asset.expiry_check": "calendar",
  "reminder.dispatch": "bell",
  "due-diligence.investigate": "due-diligence",
};

const STEP_TYPE_LABELS: Record<string, string> = {
  diagnosis: "IP 诊断",
  "trademark-check": "商标查重",
  application: "申请书生成",
  "submit-guide": "提交引导",
  ledger: "入台账",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

function InFlightCard({ job }: { job: Job }) {
  const icon = JOB_TYPE_ICONS[job.jobType] ?? "bolt";
  return (
    <div className="flex items-center gap-3 rounded-lg border-l-4 border-l-primary-500 border border-border bg-surface p-4">
      <span className={`flex h-9 w-9 items-center justify-center rounded-md ${accentBgClass("primary")}`}>
        <IconGlyph name={icon} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">
          {JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-tertiary">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-500 opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary-500" />
          </span>
          <span>{job.status === "processing" ? "执行中…" : "排队中"}</span>
          <span className="text-text-muted">·</span>
          <span>{relativeTime(job.createdAt)}</span>
        </p>
      </div>
      <Badge variant="primary" size="sm">
        {job.status}
      </Badge>
    </div>
  );
}

function AwaitingCard({
  step,
  workflow,
  onApprove,
}: {
  step: WorkflowStep;
  workflow: Workflow;
  onApprove: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [showReject, setShowReject] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    try {
      await fetch(`${proxyBaseUrl}/workflows/${workflow.id}/approve-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ step_id: step.id, approved: true }),
      });
      onApprove();
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await fetch(`${proxyBaseUrl}/workflows/${workflow.id}/approve-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ step_id: step.id, approved: false, note }),
      });
      onApprove();
    } finally {
      setLoading(false);
    }
  };

  const stepLabel = STEP_TYPE_LABELS[step.stepType] ?? step.stepType;

  return (
    <div className="rounded-lg border-l-4 border-l-warning-500 border border-border bg-warning-50/50 p-4">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${accentBgClass("warning")}`}>
          <IconGlyph name="approval" size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-text-primary">
                「{stepLabel}」完成，等待您确认
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                工作流：{workflow.workflowType} · 请审阅后决定是否继续
              </p>
            </div>
            <Badge variant="warning" size="sm" dot>
              待审批
            </Badge>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={handleApprove}
              disabled={loading}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-600 px-3 text-xs font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              <IconGlyph name="check" size={12} />
              {loading ? "处理中…" : "批准继续"}
            </button>
            <button
              onClick={() => setShowReject(!showReject)}
              disabled={loading}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-text-secondary transition-colors hover:bg-surface-elevated disabled:opacity-50"
            >
              拒绝
            </button>
            <Link
              href={`/diagnosis?workflow=${workflow.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-text-secondary transition-colors hover:bg-surface-elevated"
            >
              查看详情 <IconGlyph name="external" size={12} />
            </Link>
          </div>

          {showReject && (
            <div className="mt-2 flex gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="填写拒绝原因（可选）"
                className="h-8 flex-1 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary-500"
              />
              <button
                onClick={handleReject}
                disabled={loading}
                className="inline-flex h-8 items-center rounded-md bg-error-500 px-3 text-xs font-medium text-text-inverse transition-colors hover:bg-error-700 disabled:opacity-50"
              >
                确认拒绝
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScheduleCard({ rule }: { rule: AutomationRule }) {
  const [enabled, setEnabled] = useState(rule.enabled);
  const [toggling, setToggling] = useState(false);
  const [firing, setFiring] = useState(false);

  const toggle = async () => {
    setToggling(true);
    try {
      await fetch(`${proxyBaseUrl}/automation/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: !enabled }),
      });
      setEnabled(!enabled);
    } finally {
      setToggling(false);
    }
  };

  const fire = async () => {
    setFiring(true);
    try {
      await fetch(`${proxyBaseUrl}/automation/rules/${rule.id}/fire`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      setFiring(false);
    }
  };

  const accent: Accent = rule.triggerType === "cron" ? "info" : "primary";

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${accentBgClass(accent)}`}>
        <IconGlyph name={rule.triggerType === "cron" ? "clock" : "automation"} size={16} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-text-primary">
            {rule.description ?? rule.ruleKey}
          </p>
          <Badge variant={rule.triggerType === "cron" ? "info" : "primary"} size="sm">
            {rule.triggerType === "cron" ? "定时" : "事件"}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-text-tertiary">
          {rule.lastFiredAt ? (
            <>上次执行：{relativeTime(rule.lastFiredAt)}</>
          ) : (
            <>尚未执行</>
          )}
          <span className="mx-1.5 text-text-muted">·</span>
          <span className="font-mono text-[10px]">{rule.ruleKey}</span>
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={toggle}
            disabled={toggling}
            className={`relative h-6 w-10 rounded-full transition-colors ${
              enabled ? "bg-primary-600" : "bg-border-strong"
            } disabled:opacity-50`}
            aria-label="切换启用"
          >
            <span
              className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform ${
                enabled ? "translate-x-4" : ""
              }`}
            />
          </button>
          <span className="text-xs text-text-tertiary">{enabled ? "已启用" : "已停用"}</span>
          <button
            onClick={fire}
            disabled={firing || !enabled}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-border px-2 text-xs text-text-secondary transition-colors hover:bg-surface-elevated disabled:opacity-40"
          >
            <IconGlyph name="bolt" size={12} />
            {firing ? "触发中…" : "手动触发"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApprovalRow({ a }: { a: RecentApproval }) {
  const isApproved = a.decision === "approved";
  return (
    <div className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={`mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${accentBgClass(
          isApproved ? "success" : "error",
        )}`}
      >
        <IconGlyph name={isApproved ? "check" : "alert"} size={12} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-text-primary">
          {a.stepLabel}
          <span className="ml-1.5 text-text-tertiary">· {a.workflowType}</span>
        </p>
        {a.note && (
          <p className="mt-0.5 truncate text-[11px] text-text-tertiary">“{a.note}”</p>
        )}
        <p className="mt-0.5 text-[11px] text-text-muted">{relativeTime(a.approvedAt)}</p>
      </div>
      <Badge variant={isApproved ? "success" : "error"} size="sm">
        {isApproved ? "通过" : "驳回"}
      </Badge>
    </div>
  );
}

function buildHeatMatrix(jobs: Job[], approvals: RecentApproval[]): number[][] {
  // 7 rows (days, most recent last) × 12 cols (2h buckets).
  const matrix: number[][] = Array.from({ length: 7 }, () => Array(12).fill(0));
  const now = Date.now();
  const dayMs = 86_400_000;
  const bucket = (iso: string) => {
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return null;
    const ageDays = Math.floor((now - t) / dayMs);
    if (ageDays < 0 || ageDays > 6) return null;
    const row = 6 - ageDays;
    const hour = new Date(iso).getHours();
    const col = Math.max(0, Math.min(11, Math.floor(hour / 2)));
    return [row, col] as const;
  };
  jobs.forEach((j) => {
    const b = bucket(j.createdAt);
    if (b) matrix[b[0]][b[1]] += 1;
  });
  approvals.forEach((a) => {
    const b = bucket(a.approvedAt);
    if (b) matrix[b[0]][b[1]] += 1;
  });
  return matrix;
}

export function InboxPanel() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [approvals, setApprovals] = useState<RecentApproval[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [jobsRes, wfRes, rulesRes, apprRes] = await Promise.all([
        fetch(`${proxyBaseUrl}/jobs?status=processing,queued`, { credentials: "include" }),
        fetch(`${proxyBaseUrl}/workflows?status=running`, { credentials: "include" }),
        fetch(`${proxyBaseUrl}/automation/rules`, { credentials: "include" }),
        fetch(`${proxyBaseUrl}/notifications/recent-approvals`, { credentials: "include" }),
      ]);

      const jobsData = jobsRes.ok ? await jobsRes.json() : [];
      const wfData = wfRes.ok ? await wfRes.json() : [];
      const rulesData = rulesRes.ok ? await rulesRes.json() : [];
      const apprData = apprRes.ok ? await apprRes.json() : [];

      setJobs(Array.isArray(jobsData) ? jobsData : []);
      setWorkflows(Array.isArray(wfData) ? wfData : []);
      setRules(Array.isArray(rulesData) ? rulesData : []);
      setApprovals(Array.isArray(apprData) ? apprData : []);
    } catch (err) {
      trackError({ event: "error", error_type: "network_error", message: `inbox.loadData: ${err}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  const awaitingSteps = useMemo(
    () =>
      workflows.flatMap((wf) =>
        wf.steps
          .filter((s) => s.status === "awaiting_review")
          .map((s) => ({ step: s, workflow: wf })),
      ),
    [workflows],
  );

  const enabledRules = rules.filter((r) => r.enabled).length;

  const heatMatrix = useMemo(() => buildHeatMatrix(jobs, approvals), [jobs, approvals]);
  const dayLabels = useMemo(() => {
    const days = ["日", "一", "二", "三", "四", "五", "六"];
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (6 - i));
      return days[d.getDay()];
    });
  }, []);
  const hourLabels = useMemo(
    () => Array.from({ length: 12 }, (_, i) => `${String(i * 2).padStart(2, "0")}`),
    [],
  );

  const columns: Array<{
    key: "in_flight" | "awaiting" | "schedule";
    label: string;
    icon: IconName;
    accent: Accent;
    count: number;
    hint: string;
    empty: { icon: IconName; title: string; description: string };
    body: ReactNode;
  }> = [
    {
      key: "in_flight",
      label: "进行中",
      icon: "bolt",
      accent: "primary",
      count: jobs.length,
      hint: "后台任务 · 实时刷新",
      empty: {
        icon: "bolt",
        title: "暂无进行中",
        description: "诊断、查重提交后会出现在这里。",
      },
      body: (
        <div className="space-y-2.5">
          {jobs.map((job) => (
            <InFlightCard key={job.id} job={job} />
          ))}
        </div>
      ),
    },
    {
      key: "awaiting",
      label: "待你决定",
      icon: "approval",
      accent: "warning",
      count: awaitingSteps.length,
      hint: awaitingSteps.length > 0 ? "请尽快审阅以免阻塞" : "暂无待审事项",
      empty: {
        icon: "check",
        title: "都清空啦",
        description: "没有需要您审批的节点。",
      },
      body: (
        <div className="space-y-2.5">
          {awaitingSteps.map(({ step, workflow }) => (
            <AwaitingCard
              key={step.id}
              step={step}
              workflow={workflow}
              onApprove={loadData}
            />
          ))}
        </div>
      ),
    },
    {
      key: "schedule",
      label: "自动巡检",
      icon: "automation",
      accent: "info",
      count: enabledRules,
      hint: `${rules.length} 条规则`,
      empty: {
        icon: "automation",
        title: "暂无自动化规则",
        description: "系统级规则会在资产登记后激活。",
      },
      body: (
        <div className="space-y-2.5">
          {rules.map((rule) => (
            <ScheduleCard key={rule.id} rule={rule} />
          ))}
        </div>
      ),
    },
  ];

  const columnIsEmpty = (key: "in_flight" | "awaiting" | "schedule") =>
    (key === "in_flight" && jobs.length === 0) ||
    (key === "awaiting" && awaitingSteps.length === 0) ||
    (key === "schedule" && rules.length === 0);

  const totalHeat = heatMatrix.flat().reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Inbox"
        title="收件箱"
        icon="inbox"
        accent="warning"
        description="AI 正在自动处理您的 IP 事务。需要您拍板的关键节点会汇总在这里。"
      />

      {/* ===== KPI ===== */}
      <section className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <StatTile
          label="正在处理"
          value={jobs.length}
          icon="bolt"
          accent="primary"
          hint="后台任务 / 工作流步骤"
        />
        <StatTile
          label="待你决定"
          value={awaitingSteps.length}
          icon="approval"
          accent={awaitingSteps.length > 0 ? "warning" : "success"}
          hint={awaitingSteps.length > 0 ? "请尽快审阅以免阻塞" : "暂无待审事项"}
        />
        <StatTile
          label="自动巡检"
          value={enabledRules}
          icon="automation"
          accent="info"
          suffix={<span>/ {rules.length} 条规则</span>}
          hint="启用中的规则数量"
        />
      </section>

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-text-tertiary">
          加载中…
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* Kanban: 3 columns */}
          <section className="grid gap-4 md:grid-cols-3">
            {columns.map((col) => (
              <div
                key={col.key}
                className={`flex min-h-[260px] flex-col rounded-lg border border-border bg-surface/70 ${
                  col.accent === "warning"
                    ? "shadow-[inset_0_2px_0_0_rgb(var(--color-warning-500))]"
                    : col.accent === "primary"
                      ? "shadow-[inset_0_2px_0_0_rgb(var(--color-primary-500))]"
                      : "shadow-[inset_0_2px_0_0_rgb(var(--color-info-500))]"
                }`}
              >
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-md ${accentBgClass(
                      col.accent,
                    )}`}
                  >
                    <IconGlyph name={col.icon} size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">{col.label}</p>
                    <p className="truncate text-[11px] text-text-tertiary">{col.hint}</p>
                  </div>
                  <span
                    className={`num-display rounded-full px-2 py-0.5 text-[11px] ${accentBgClass(
                      col.accent,
                    )}`}
                  >
                    {col.count}
                  </span>
                </div>
                <div className="flex-1 p-3">
                  {columnIsEmpty(col.key) ? (
                    <EmptyHero
                      icon={col.empty.icon}
                      title={col.empty.title}
                      description={col.empty.description}
                      accent={col.accent}
                    />
                  ) : (
                    col.body
                  )}
                </div>
              </div>
            ))}
          </section>

          {/* Side rail */}
          <aside className="space-y-4">
            <div className="rounded-lg border border-border bg-surface p-4">
              <SectionHeader
                eyebrow="Heatmap"
                title="一周告警热力"
                description={`过去 7 天 × 2 小时分桶，共 ${totalHeat} 个事件`}
              />
              <div className="mt-3 text-warning-600">
                <HeatGrid
                  matrix={heatMatrix}
                  rowLabels={dayLabels}
                  colLabels={hourLabels}
                  color="currentColor"
                  cellSize={16}
                  gap={2}
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-[10px] text-text-tertiary">
                <span>低</span>
                <div className="flex h-1.5 flex-1 mx-2 overflow-hidden rounded-full bg-gradient-to-r from-warning-50 via-warning-300 to-warning-600" />
                <span>高</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <SectionHeader
                eyebrow="Activity"
                title="最近审批"
                description="最近 30 天的审批动作"
              />
              <div className="mt-3 divide-y divide-border">
                {approvals.length === 0 ? (
                  <p className="py-6 text-center text-xs text-text-tertiary">暂无记录</p>
                ) : (
                  approvals.map((a) => <ApprovalRow key={a.id} a={a} />)
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      <p className="text-[11px] text-text-tertiary">
        ※ 收件箱不替代官方系统通知。请定期前往 CNIPA 等官方渠道核验关键节点。
      </p>
    </div>
  );
}
