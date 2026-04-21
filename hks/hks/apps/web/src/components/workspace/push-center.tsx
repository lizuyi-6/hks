"use client";

/**
 * PushCenter — 场景化推送中心（赛道支柱 3）
 *
 * 展示：
 *  - 规则列表（12+ 场景）：启停、手动触发
 *  - 命中时间线：最近触发过的站内推送
 *  - KPI：规则总数 / 启用数 / 最近 7 天触发次数
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, WorkspaceCard } from "@a1plus/ui";
import { PageHeader, SectionHeader, KpiCard, IconGlyph } from "./primitives";
import { ErrorDisplay, request } from "./shared";
import { ApplicationError } from "@/lib/errors";

type AutomationRule = {
  id: string;
  ruleKey: string;
  enabled: boolean;
  triggerType: "cron" | "event" | string;
  triggerConfig: Record<string, unknown>;
  actionType: string;
  actionConfig: Record<string, unknown>;
  description?: string | null;
  lastFiredAt?: string | null;
  createdAt: string;
};

type RuleTemplate = {
  ruleKey: string;
  triggerType: "cron" | "event" | string;
  triggerConfig: Record<string, unknown>;
  conditionExpr?: string | null;
  actionConfig: Record<string, unknown>;
  description?: string | null;
};

type EventTypeOption = {
  eventType: string;
  label: string;
  category: string;
};

type NewRuleDraft = {
  ruleKey: string;
  triggerType: "event" | "cron";
  eventType: string;
  cron: string;
  category: string;
  priority: "high" | "medium" | "low";
  title: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  conditionExpr: string;
  description: string;
};

const BLANK_DRAFT: NewRuleDraft = {
  ruleKey: "",
  triggerType: "event",
  eventType: "diagnosis.completed",
  cron: "0 9 * * 1",
  category: "workflow",
  priority: "medium",
  title: "",
  body: "",
  actionLabel: "前往",
  actionUrl: "/dashboard",
  conditionExpr: "",
  description: "",
};

type PushTimelineItem = {
  id: string;
  category: string;
  priority: "high" | "medium" | "low" | string;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  actionLabel?: string | null;
  createdAt: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  workflow: "流程",
  monitoring: "监控",
  policy: "政策",
  reminder: "提醒",
  system: "系统",
  competitor: "竞品",
};

const PRIORITY_STYLE: Record<string, string> = {
  high: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  low: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString();
}

function triggerDescription(rule: AutomationRule): string {
  if (rule.triggerType === "cron") {
    return `定时：${(rule.triggerConfig as { cron?: string }).cron ?? "未配置"}`;
  }
  const ev = (rule.triggerConfig as { event_type?: string }).event_type;
  return `事件：${ev ?? "未配置"}`;
}

export function PushCenter() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [timeline, setTimeline] = useState<PushTimelineItem[]>([]);
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeOption[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [error, setError] = useState<ApplicationError | string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [firing, setFiring] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rs, tl, tpl, evs] = await Promise.all([
        request<AutomationRule[]>("/automation/rules"),
        request<PushTimelineItem[]>("/automation/timeline?limit=30"),
        request<RuleTemplate[]>("/automation/templates").catch(() => []),
        request<EventTypeOption[]>("/automation/event-types").catch(() => []),
      ]);
      setRules(rs);
      setTimeline(tl);
      setTemplates(tpl);
      setEventTypes(evs);
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(
    async (rule: AutomationRule) => {
      setToggling(rule.id);
      try {
        await request<AutomationRule>(`/automation/rules/${rule.id}`, {
          method: "PUT",
          body: JSON.stringify({ enabled: !rule.enabled }),
        });
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)),
        );
      } catch (e) {
        setError(e instanceof ApplicationError ? e : String(e));
      } finally {
        setToggling(null);
      }
    },
    [],
  );

  const fire = useCallback(
    async (rule: AutomationRule) => {
      setFiring(rule.id);
      try {
        await request(`/automation/rules/${rule.id}/fire`, { method: "POST" });
        await load();
      } catch (e) {
        setError(e instanceof ApplicationError ? e : String(e));
      } finally {
        setFiring(null);
      }
    },
    [load],
  );

  const scenarioRules = useMemo(
    () => rules.filter((r) => r.ruleKey.startsWith("scenario.") || r.actionType === "create_scenario_push"),
    [rules],
  );
  const otherRules = useMemo(
    () => rules.filter((r) => !(r.ruleKey.startsWith("scenario.") || r.actionType === "create_scenario_push")),
    [rules],
  );

  const kpi = useMemo(() => {
    const total = rules.length;
    const enabled = rules.filter((r) => r.enabled).length;
    const week = Date.now() - 7 * 86_400_000;
    const recent7d = timeline.filter((t) => new Date(t.createdAt).getTime() >= week).length;
    return { total, enabled, recent7d };
  }, [rules, timeline]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="支柱 3 · 场景化推送"
        title="场景推送中心"
        description="基于事件与画像的规则引擎，覆盖诊断→匹配、红灯商标、到期续展、侵权命中、政策冲击、诉讼高低胜率等 12+ 关键场景。"
      />

      {error && <ErrorDisplay error={error} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="场景规则总数" value={kpi.total} unit="条" accent="primary" icon="automation" />
        <KpiCard label="启用中" value={kpi.enabled} unit="条" accent="success" icon="bolt" />
        <KpiCard label="近 7 天触发" value={kpi.recent7d} unit="次" accent="info" icon="bell" />
      </div>

      {/* 规则列表 */}
      <WorkspaceCard padding="lg">
        <div className="flex items-start justify-between gap-3">
          <SectionHeader
            title="场景规则库"
            description="规则命中即触发站内推送或工作流推进。点击「模拟触发」可在沙盒环境下立即生成一条通知用于演示。"
          />
          <button
            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            onClick={() => setWizardOpen(true)}
          >
            + 新建规则
          </button>
        </div>
        <div className="mt-3 divide-y divide-border">
          {scenarioRules.map((r) => (
            <div key={r.id} className="grid grid-cols-1 gap-3 py-3 sm:grid-cols-[1fr_auto]">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-text-tertiary">{r.ruleKey}</span>
                  <Badge variant={r.enabled ? "success" : "default"}>
                    {r.enabled ? "启用" : "停用"}
                  </Badge>
                  {r.triggerType === "cron" ? (
                    <Badge variant="default">定时</Badge>
                  ) : (
                    <Badge variant="info">事件驱动</Badge>
                  )}
                </div>
                <div className="mt-1 text-sm font-medium text-text-primary">
                  {(r.actionConfig as { title?: string })?.title || r.description || r.ruleKey}
                </div>
                {r.description && (
                  <div className="mt-0.5 text-xs text-text-tertiary">{r.description}</div>
                )}
                <div className="mt-1 text-xs text-text-tertiary">
                  {triggerDescription(r)}
                  {r.lastFiredAt && <span className="ml-3">· 最近触发：{relativeTime(r.lastFiredAt)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <button
                  className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
                  onClick={() => toggle(r)}
                  disabled={toggling === r.id}
                >
                  {toggling === r.id ? "…" : r.enabled ? "停用" : "启用"}
                </button>
                <button
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
                  onClick={() => fire(r)}
                  disabled={firing === r.id || !r.enabled}
                  title={!r.enabled ? "请先启用" : "模拟触发此规则以产生一条推送"}
                >
                  {firing === r.id ? "触发中…" : "模拟触发"}
                </button>
              </div>
            </div>
          ))}
          {scenarioRules.length === 0 && !loading && (
            <div className="py-6 text-center text-sm text-text-tertiary">暂无场景规则</div>
          )}
        </div>
      </WorkspaceCard>

      {/* 其他自动化规则（非场景推送） */}
      {otherRules.length > 0 && (
        <WorkspaceCard padding="lg">
          <SectionHeader
            title="其他自动化规则"
            description="周期扫描、工作流自动推进等系统内建规则。"
          />
          <ul className="mt-3 space-y-2 text-sm">
            {otherRules.map((r) => (
              <li key={r.id} className="flex items-center gap-3">
                <Badge variant={r.enabled ? "success" : "default"}>
                  {r.enabled ? "启用" : "停用"}
                </Badge>
                <span className="font-mono text-xs text-text-tertiary">{r.ruleKey}</span>
                <span className="text-text-secondary">{r.description}</span>
              </li>
            ))}
          </ul>
        </WorkspaceCard>
      )}

      {/* 时间线 */}
      <WorkspaceCard padding="lg">
        <SectionHeader
          title="推送时间线"
          description="最近被触达的场景推送。可从任一卡片直达对应的工作流或匹配结果。"
        />
        {timeline.length === 0 ? (
          <div className="py-6 text-center text-sm text-text-tertiary">暂无推送记录</div>
        ) : (
          <ol className="mt-3 space-y-3">
            {timeline.map((n, i) => (
              <li key={n.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <IconGlyph name="bell" size={14} />
                  </div>
                  {i < timeline.length - 1 && <div className="mt-1 h-full w-px bg-border" />}
                </div>
                <div className="flex-1 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{n.title}</span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${PRIORITY_STYLE[n.priority] ?? PRIORITY_STYLE.low}`}
                    >
                      {n.priority}
                    </span>
                    <Badge variant="default">{CATEGORY_LABEL[n.category] ?? n.category}</Badge>
                    <span className="ml-auto text-xs text-text-tertiary">{relativeTime(n.createdAt)}</span>
                  </div>
                  {n.body && <p className="mt-0.5 text-xs text-text-secondary">{n.body}</p>}
                  {n.actionUrl && (
                    <a
                      href={n.actionUrl}
                      className="mt-1 inline-flex items-center text-xs text-primary hover:underline"
                    >
                      {n.actionLabel ?? "前往"} →
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </WorkspaceCard>

      {loading && rules.length === 0 && (
        <div className="py-12 text-center text-sm text-text-tertiary">加载中…</div>
      )}

      {wizardOpen && (
        <NewRuleWizard
          templates={templates}
          eventTypes={eventTypes}
          onClose={() => setWizardOpen(false)}
          onCreated={async () => {
            setWizardOpen(false);
            await load();
          }}
        />
      )}
    </div>
  );
}


function NewRuleWizard({
  templates,
  eventTypes,
  onClose,
  onCreated,
}: {
  templates: RuleTemplate[];
  eventTypes: EventTypeOption[];
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [draft, setDraft] = useState<NewRuleDraft>(BLANK_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const update = (patch: Partial<NewRuleDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const applyTemplate = useCallback((tpl: RuleTemplate | null) => {
    if (!tpl) {
      setDraft(BLANK_DRAFT);
      return;
    }
    const cfg = (tpl.actionConfig || {}) as Record<string, unknown>;
    setDraft({
      ruleKey: tpl.ruleKey.startsWith("scenario.")
        ? `scenario.custom_${Math.random().toString(36).slice(2, 8)}`
        : tpl.ruleKey,
      triggerType: tpl.triggerType === "cron" ? "cron" : "event",
      eventType:
        (tpl.triggerConfig as { event_type?: string })?.event_type ||
        "diagnosis.completed",
      cron: (tpl.triggerConfig as { cron?: string })?.cron || "0 9 * * 1",
      category: String(cfg.category ?? "workflow"),
      priority:
        (["high", "medium", "low"] as const).find((p) => p === cfg.priority) ??
        "medium",
      title: String(cfg.title ?? ""),
      body: String(cfg.body ?? ""),
      actionLabel: String(cfg.action_label ?? "前往"),
      actionUrl: String(cfg.action_url ?? "/dashboard"),
      conditionExpr: tpl.conditionExpr ?? "",
      description: tpl.description ?? "",
    });
  }, []);

  const submit = async () => {
    setLocalError(null);
    if (!draft.ruleKey.trim()) {
      setLocalError("请填写规则 Key（建议以 scenario. 开头）");
      return;
    }
    if (!draft.title.trim()) {
      setLocalError("请填写推送标题");
      return;
    }
    if (draft.triggerType === "event" && !draft.eventType.trim()) {
      setLocalError("请选择或填写事件类型");
      return;
    }
    if (draft.triggerType === "cron" && !draft.cron.trim()) {
      setLocalError("请填写 cron 表达式");
      return;
    }

    setSubmitting(true);
    try {
      const triggerConfig =
        draft.triggerType === "event"
          ? { event_type: draft.eventType }
          : { cron: draft.cron };
      await request<AutomationRule>("/automation/rules", {
        method: "POST",
        body: JSON.stringify({
          ruleKey: draft.ruleKey.trim(),
          triggerType: draft.triggerType,
          triggerConfig,
          actionType: "create_scenario_push",
          actionConfig: {
            scenario: draft.ruleKey.replace(/^scenario\./, "") || "custom",
            category: draft.category,
            priority: draft.priority,
            title: draft.title,
            body: draft.body,
            action_label: draft.actionLabel,
            action_url: draft.actionUrl,
          },
          conditionExpr: draft.conditionExpr.trim() || null,
          description: draft.description || null,
          enabled: true,
        }),
      });
      await onCreated();
    } catch (e) {
      setLocalError(e instanceof ApplicationError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-2xl rounded-t-lg border border-border bg-background shadow-xl sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <div className="text-sm font-semibold text-text-primary">
              新建场景推送规则
            </div>
            <div className="text-xs text-text-tertiary">
              步骤 {step} / 4 ·
              {step === 1 && " 选择起点模板"}
              {step === 2 && " 配置触发"}
              {step === 3 && " 编辑推送文案"}
              {step === 4 && " 预览并提交"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-tertiary hover:bg-muted"
            aria-label="close"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 text-sm">
          {step === 1 && (
            <div className="space-y-3">
              <button
                className="w-full rounded-md border border-dashed border-border px-3 py-3 text-left hover:border-primary hover:bg-muted"
                onClick={() => {
                  applyTemplate(null);
                  setStep(2);
                }}
              >
                <div className="font-medium">从空白开始</div>
                <div className="text-xs text-text-tertiary">
                  我自己配置全部字段
                </div>
              </button>
              <div className="text-xs text-text-tertiary">或从已有场景模板复制：</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {templates.map((t) => (
                  <button
                    key={t.ruleKey}
                    className="rounded-md border border-border px-3 py-2 text-left hover:border-primary hover:bg-muted"
                    onClick={() => {
                      applyTemplate(t);
                      setStep(2);
                    }}
                  >
                    <div className="font-mono text-[11px] text-text-tertiary">
                      {t.ruleKey}
                    </div>
                    <div className="mt-0.5 font-medium">
                      {(t.actionConfig as { title?: string })?.title ||
                        t.description}
                    </div>
                    {t.description && (
                      <div className="mt-0.5 text-xs text-text-tertiary">
                        {t.description}
                      </div>
                    )}
                  </button>
                ))}
                {templates.length === 0 && (
                  <div className="col-span-2 rounded-md border border-dashed border-border py-6 text-center text-xs text-text-tertiary">
                    暂无模板可复制
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <Field label="规则 Key">
                <input
                  value={draft.ruleKey}
                  onChange={(e) => update({ ruleKey: e.target.value })}
                  placeholder="scenario.my_custom_rule"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
              </Field>
              <Field label="触发方式">
                <div className="flex gap-3 text-sm">
                  {(["event", "cron"] as const).map((t) => (
                    <label key={t} className="inline-flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={draft.triggerType === t}
                        onChange={() => update({ triggerType: t })}
                      />
                      {t === "event" ? "事件驱动" : "定时 (Cron)"}
                    </label>
                  ))}
                </div>
              </Field>
              {draft.triggerType === "event" ? (
                <Field label="事件类型">
                  <select
                    value={draft.eventType}
                    onChange={(e) => update({ eventType: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  >
                    {eventTypes.map((ev) => (
                      <option key={ev.eventType} value={ev.eventType}>
                        {ev.label} · {ev.eventType}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Cron 表达式">
                  <input
                    value={draft.cron}
                    onChange={(e) => update({ cron: e.target.value })}
                    placeholder="0 9 * * 1"
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs"
                  />
                </Field>
              )}
              <Field label="条件表达式（可选）">
                <input
                  value={draft.conditionExpr}
                  onChange={(e) => update({ conditionExpr: e.target.value })}
                  placeholder="e.g. int(event.payload.get('score', 0)) < 60"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs"
                />
                <p className="mt-1 text-[11px] text-text-tertiary">
                  基于事件 payload 的 Python 表达式。留空表示始终成立。
                </p>
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <Field label="推送标题">
                <input
                  value={draft.title}
                  onChange={(e) => update({ title: e.target.value })}
                  placeholder="例如：新商标驳回风险"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
              </Field>
              <Field label="推送正文">
                <textarea
                  value={draft.body}
                  onChange={(e) => update({ body: e.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="分类">
                  <select
                    value={draft.category}
                    onChange={(e) => update({ category: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  >
                    {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v} ({k})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="优先级">
                  <select
                    value={draft.priority}
                    onChange={(e) =>
                      update({
                        priority: e.target.value as NewRuleDraft["priority"],
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="按钮文案">
                  <input
                    value={draft.actionLabel}
                    onChange={(e) => update({ actionLabel: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  />
                </Field>
                <Field label="跳转链接">
                  <input
                    value={draft.actionUrl}
                    onChange={(e) => update({ actionUrl: e.target.value })}
                    className="w-full rounded-md border border-border bg-background px-3 py-1.5 font-mono text-xs"
                  />
                </Field>
              </div>
              <Field label="内部描述">
                <input
                  value={draft.description}
                  onChange={(e) => update({ description: e.target.value })}
                  placeholder="仅内部使用，用于识别规则"
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs uppercase text-text-tertiary">
                  推送预览
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">
                    {draft.title || "（未填写标题）"}
                  </span>
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                      PRIORITY_STYLE[draft.priority]
                    }`}
                  >
                    {draft.priority}
                  </span>
                  <Badge variant="default">
                    {CATEGORY_LABEL[draft.category] ?? draft.category}
                  </Badge>
                </div>
                {draft.body && (
                  <p className="mt-1 text-xs text-text-secondary">{draft.body}</p>
                )}
                <a
                  href={draft.actionUrl || "#"}
                  className="mt-1 inline-block text-xs text-primary hover:underline"
                >
                  {draft.actionLabel || "前往"} →
                </a>
              </div>
              <dl className="grid gap-1 text-xs text-text-secondary">
                <Row k="Rule Key" v={draft.ruleKey} />
                <Row
                  k="触发"
                  v={
                    draft.triggerType === "event"
                      ? `事件：${draft.eventType}`
                      : `Cron：${draft.cron}`
                  }
                />
                {draft.conditionExpr && (
                  <Row k="条件" v={draft.conditionExpr} />
                )}
              </dl>
            </div>
          )}

          {localError && (
            <div className="mt-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              {localError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <button
            className="rounded-md px-3 py-1.5 text-xs text-text-secondary hover:bg-muted disabled:opacity-40"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
            disabled={step === 1}
          >
            上一步
          </button>
          <div className="flex gap-2">
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
              onClick={onClose}
            >
              取消
            </button>
            {step < 4 ? (
              <button
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90"
                onClick={() =>
                  setStep((s) => (s < 4 ? ((s + 1) as 2 | 3 | 4) : s))
                }
              >
                下一步
              </button>
            ) : (
              <button
                className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-60"
                onClick={submit}
                disabled={submitting}
              >
                {submitting ? "提交中…" : "创建规则"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-secondary">
        {label}
      </span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-text-tertiary">{k}</dt>
      <dd className="break-all font-mono text-[11px]">{v}</dd>
    </div>
  );
}
