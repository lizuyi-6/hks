"use client";

/**
 * Workspace Page Primitives
 * 跨页复用的页面级视觉原语：页头、KPI 卡、快捷入口、图标字典等。
 * 与 dashboard 一致的语言，供其他模块页共享以避免每页重造轮子。
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { cn, Badge } from "@a1plus/ui";
import { Sparkline } from "@/components/viz";

/* ============================================================
   IconGlyph — 16×16 线稿 SVG 图标字典
   所有图标走 currentColor，可随容器语义色变化
   ============================================================ */
export type IconName =
  | "inbox"
  | "dashboard"
  | "diagnosis"
  | "trademark"
  | "patent"
  | "copyright"
  | "soft-copyright"
  | "assets"
  | "monitoring"
  | "contracts"
  | "policies"
  | "due-diligence"
  | "reminder"
  | "upload"
  | "download"
  | "external"
  | "calendar"
  | "approval"
  | "automation"
  | "search"
  | "filter"
  | "plus"
  | "trash"
  | "check"
  | "alert"
  | "clock"
  | "shield"
  | "bolt"
  | "sparkle"
  | "chart"
  | "edit"
  | "refresh"
  | "lock"
  | "user"
  | "building"
  | "target"
  | "mail"
  | "bell";

const paths: Record<IconName, ReactNode> = {
  inbox: <path d="M2 10.5h2.5l1.5 2h4l1.5-2H14V4a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v6.5z" />,
  dashboard: (
    <>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </>
  ),
  diagnosis: <path d="M8 2v4l2 2M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0z" />,
  trademark: <path d="M3 3h10v10H3zM6 6h4M8 6v4" />,
  patent: <path d="M8 2l2 3.5L14 6l-3 2.5.8 4L8 10.8 4.2 12.5 5 8.5 2 6l4-.5L8 2z" />,
  copyright: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M10 6.5a2.5 2.5 0 1 0 0 3" />
    </>
  ),
  "soft-copyright": (
    <>
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
      <path d="M6 7l1.5 1.5L10 6" />
    </>
  ),
  assets: <path d="M4 13V7M8 13V3M12 13v-4" />,
  monitoring: <path d="M2 8h2l2-4 2 8 2-6 1.5 2H14" />,
  contracts: <path d="M4 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM6 6h4M6 9h4" />,
  policies: <path d="M8 2L3 5v4c0 2.8 2.2 4.8 5 5.5 2.8-.7 5-2.7 5-5.5V5L8 2z" />,
  "due-diligence": <path d="M9.5 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9.5 2zM9 2v4h4M6 9h4M6 11h2" />,
  reminder: <path d="M8 2a4 4 0 0 1 4 4v2l1 2H3l1-2V6a4 4 0 0 1 4-4zM6.5 12.5a1.5 1.5 0 0 0 3 0" />,
  upload: <path d="M8 11V3M5 6l3-3 3 3M3 13h10" />,
  download: <path d="M8 3v8M5 8l3 3 3-3M3 13h10" />,
  external: <path d="M6 3h7v7M13 3L6.5 9.5M3 5v8h8" />,
  calendar: (
    <>
      <rect x="2" y="3" width="12" height="11" rx="1" />
      <path d="M2 7h12M5 2v2M11 2v2" />
    </>
  ),
  approval: <path d="M4 8l3 3 5-6" />,
  automation: (
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L13.5 13.5" />
    </>
  ),
  filter: <path d="M2 3h12l-4.5 6v5l-3-1.5V9L2 3z" />,
  plus: <path d="M8 3v10M3 8h10" />,
  trash: <path d="M3 4h10M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4M5 4l.5 9h5L11 4" />,
  check: <path d="M3 8l3.5 3.5L13 4.5" />,
  alert: <path d="M8 2l7 12H1L8 2zM8 6v4M8 12v.5" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2 2" />
    </>
  ),
  shield: <path d="M8 1.5L2.5 4v4.5c0 3 2.4 5.3 5.5 6 3.1-.7 5.5-3 5.5-6V4L8 1.5z" />,
  bolt: <path d="M9 1L3 9h4l-1 6 6-8H8l1-6z" />,
  sparkle: <path d="M8 2l1.2 3.8L13 7l-3.8 1.2L8 12l-1.2-3.8L3 7l3.8-1.2L8 2z" />,
  chart: <path d="M2 13V3M13 13H3M5 10l2-3 2 2 3-4" />,
  edit: <path d="M11 2l3 3-8 8H3v-3l8-8z" />,
  refresh: <path d="M13 5A5 5 0 1 0 13 11M13 2v3h-3" />,
  lock: (
    <>
      <rect x="3" y="7" width="10" height="7" rx="1" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </>
  ),
  user: (
    <>
      <circle cx="8" cy="6" r="3" />
      <path d="M2.5 14c1-2.5 3-4 5.5-4s4.5 1.5 5.5 4" />
    </>
  ),
  building: (
    <>
      <rect x="3" y="2" width="10" height="12" />
      <path d="M5.5 5h1M9.5 5h1M5.5 8h1M9.5 8h1M5.5 11h1M9.5 11h1" />
    </>
  ),
  target: (
    <>
      <circle cx="8" cy="8" r="6" />
      <circle cx="8" cy="8" r="3" />
      <circle cx="8" cy="8" r="0.5" fill="currentColor" />
    </>
  ),
  mail: <path d="M2 4h12v8H2zM2 4l6 5 6-5" />,
  bell: <path d="M8 2a4 4 0 0 1 4 4v2l1 2H3l1-2V6a4 4 0 0 1 4-4zM6.5 12.5a1.5 1.5 0 0 0 3 0" />,
};

export function IconGlyph({
  name,
  className,
  size = 16,
}: {
  name: IconName;
  className?: string;
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      width={size}
      height={size}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

/* ============================================================
   PageHeader — eyebrow + 衬线大标题 + 描述 + 右侧 slot
   ============================================================ */
const pageHeaderAccent: Record<
  "primary" | "warning" | "info" | "success" | "error" | "muted",
  { eyebrow: string; iconWrap: string; bar: string; ringGlow: string }
> = {
  primary: {
    eyebrow: "text-primary-600",
    iconWrap: "border-primary-100 bg-primary-50 text-primary-600",
    bar: "from-primary-400 via-primary-500 to-primary-600",
    ringGlow: "shadow-[0_0_0_4px_rgb(var(--color-primary-100)/0.5)]",
  },
  warning: {
    eyebrow: "text-warning-600",
    iconWrap: "border-warning-100 bg-warning-50 text-warning-700",
    bar: "from-warning-300 via-warning-500 to-warning-600",
    ringGlow: "shadow-[0_0_0_4px_rgb(var(--color-warning-100)/0.5)]",
  },
  info: {
    eyebrow: "text-info-600",
    iconWrap: "border-info-100 bg-info-50 text-info-700",
    bar: "from-info-300 via-info-500 to-info-600",
    ringGlow: "shadow-[0_0_0_4px_rgb(var(--color-info-100)/0.5)]",
  },
  success: {
    eyebrow: "text-success-600",
    iconWrap: "border-success-100 bg-success-50 text-success-700",
    bar: "from-success-300 via-success-500 to-success-600",
    ringGlow: "shadow-[0_0_0_4px_rgb(var(--color-success-100)/0.5)]",
  },
  error: {
    eyebrow: "text-error-600",
    iconWrap: "border-error-100 bg-error-50 text-error-700",
    bar: "from-error-300 via-error-500 to-error-600",
    ringGlow: "shadow-[0_0_0_4px_rgb(var(--color-error-100)/0.5)]",
  },
  muted: {
    eyebrow: "text-text-tertiary",
    iconWrap: "border-border bg-surface-elevated text-primary-600",
    bar: "from-border via-border-strong to-border",
    ringGlow: "",
  },
};

export function PageHeader({
  eyebrow,
  title,
  description,
  icon,
  actions,
  className,
  accent,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  className?: string;
  accent?: "primary" | "warning" | "info" | "success" | "error" | "muted";
}) {
  const acc = accent ? pageHeaderAccent[accent] : null;
  return (
    <header
      className={cn(
        "relative flex flex-wrap items-start justify-between gap-4",
        accent ? "pl-4" : "",
        className,
      )}
    >
      {acc && (
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-1 bottom-1 w-1 rounded-full bg-gradient-to-b",
            acc.bar,
          )}
        />
      )}
      <div className="min-w-0">
        {eyebrow && (
          <p
            className={cn(
              "text-xs font-semibold uppercase tracking-[0.16em]",
              acc ? acc.eyebrow : "text-text-tertiary",
            )}
          >
            {eyebrow}
          </p>
        )}
        <div className="flex items-center gap-3">
          {icon && (
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
                acc ? acc.iconWrap : "border-border bg-surface-elevated text-primary-600",
                acc ? acc.ringGlow : "",
              )}
            >
              <IconGlyph name={icon} size={18} />
            </span>
          )}
          <h1 className="font-serif text-2xl font-medium tracking-tight text-text-primary">
            {title}
          </h1>
        </div>
        {description && (
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        )}
      </div>
      {actions ? <div className="shrink-0 flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/* ============================================================
   PillarBanner — 工具页顶部"归属支柱"徽章
   自助工具（/diagnosis、/monitoring、/trademark 等）顶部展示它在 7 支柱
   叙事里的归属，点击可直达该支柱主页。保持 tool 页独立可用的同时，让
   用户随时看到"我现在在场景化推送 / 合规 SaaS 这根主线上"。
   ============================================================ */
export type PillarKey =
  | "profile"
  | "matching"
  | "push"
  | "acquisition"
  | "consult"
  | "compliance"
  | "digital";

type PillarMeta = {
  label: string;
  href: string;
  accent: Accent;
  icon: IconName;
  /** 辅助说明：此工具作为该支柱的子能力在主线中扮演的角色。 */
  role: string;
};

const pillarBannerMeta: Record<PillarKey, PillarMeta> = {
  profile: {
    label: "需求画像",
    href: "/my-profile",
    accent: "primary",
    icon: "sparkle",
    role: "诊断结果会回写到你的画像，为后续匹配与推送提供信号。",
  },
  matching: {
    label: "智能匹配",
    href: "/match",
    accent: "info",
    icon: "target",
    role: "画像命中后在此模块里用双路召回+重排找到最合适的律师。",
  },
  push: {
    label: "场景化推送",
    href: "/push-center",
    accent: "info",
    icon: "bell",
    role: "此工具的告警/事件会自动进入场景推送时间轴。",
  },
  acquisition: {
    label: "精准获客",
    href: "/provider",
    accent: "primary",
    icon: "user",
    role: "匹配结果会以线索形式落到律所工作台的漏斗。",
  },
  consult: {
    label: "智能咨询",
    href: "/consult",
    accent: "success",
    icon: "bolt",
    role: "此工具的深度输出是咨询 Agent 可调用的能力之一。",
  },
  compliance: {
    label: "合规 SaaS",
    href: "/enterprise",
    accent: "success",
    icon: "shield",
    role: "结果会汇入企业的合规体检与订阅。",
  },
  digital: {
    label: "服务数字化",
    href: "/orders",
    accent: "warning",
    icon: "approval",
    role: "工作流与交付物会沉淀到电子签+托管支付的订单链路。",
  },
};

export function PillarBanner({
  pillar,
  hint,
  extraLinks,
}: {
  pillar: PillarKey;
  /** 若提供，会覆盖默认的 `role` 文案。 */
  hint?: ReactNode;
  /** 除了返回支柱主页，还可再提供若干入口（例如 push 相关页可再加"查看时间轴"）。 */
  extraLinks?: Array<{ label: string; href: string }>;
}) {
  const meta = pillarBannerMeta[pillar];
  const acc = pageHeaderAccent[meta.accent];
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-xs",
        acc.iconWrap,
      )}
    >
      <span className="inline-flex h-6 items-center gap-1.5 rounded-full border border-white/40 bg-white/40 px-2 font-medium dark:border-white/10 dark:bg-black/20">
        <IconGlyph name={meta.icon} size={12} />
        归属支柱 · {meta.label}
      </span>
      <span className="flex-1 min-w-[180px] text-text-secondary">
        {hint ?? meta.role}
      </span>
      <Link
        href={meta.href}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-white/40 bg-white/40 px-2 font-medium hover:bg-white/70 dark:border-white/10 dark:bg-black/20 dark:hover:bg-black/30"
      >
        返回支柱主页 →
      </Link>
      {extraLinks?.map((lnk) => (
        <Link
          key={lnk.href}
          href={lnk.href}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-white/40 bg-white/40 px-2 font-medium hover:bg-white/70 dark:border-white/10 dark:bg-black/20 dark:hover:bg-black/30"
        >
          {lnk.label} →
        </Link>
      ))}
    </div>
  );
}

/* ============================================================
   SectionHeader — 节内小标题
   ============================================================ */
export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-baseline justify-between gap-3", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
            {eyebrow}
          </p>
        )}
        <h2 className="font-serif text-lg font-medium tracking-tight text-text-primary">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-xs text-text-tertiary">{description}</p>
        )}
      </div>
      {actions ? <div className="shrink-0 flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ============================================================
   Accent 语义色映射
   ============================================================ */
export type Accent = "primary" | "warning" | "info" | "success" | "error" | "muted";

const accentText: Record<Accent, string> = {
  primary: "text-primary-600",
  warning: "text-warning-500",
  info: "text-info-500",
  success: "text-success-500",
  error: "text-error-500",
  muted: "text-text-tertiary",
};

const accentBg: Record<Accent, string> = {
  primary: "bg-primary-50 text-primary-600",
  warning: "bg-warning-50 text-warning-700",
  info: "bg-info-50 text-info-700",
  success: "bg-success-50 text-success-700",
  error: "bg-error-50 text-error-700",
  muted: "bg-surface-elevated text-text-secondary",
};

export function accentClass(a: Accent) {
  return accentText[a];
}

export function accentBgClass(a: Accent) {
  return accentBg[a];
}

/* ============================================================
   KpiCard — 大数字 + sparkline + delta + 可选 icon
   ============================================================ */
export function KpiCard({
  label,
  value,
  unit,
  delta,
  trend,
  series,
  accent = "primary",
  icon,
  hint,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  trend?: "up" | "down" | "neutral";
  series?: number[];
  accent?: Accent;
  icon?: IconName;
  hint?: ReactNode;
}) {
  const deltaColor =
    trend === "up"
      ? "text-success-500"
      : trend === "down"
        ? "text-error-500"
        : "text-text-tertiary";

  return (
    <div className="group flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon && (
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md",
                accentBgClass(accent),
              )}
            >
              <IconGlyph name={icon} size={12} />
            </span>
          )}
          <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
            {label}
          </span>
        </div>
        {delta && (
          <span className={cn("text-xs font-semibold tabular-nums", deltaColor)}>
            {trend === "up" ? "↑" : trend === "down" ? "↓" : ""} {delta}
          </span>
        )}
      </div>
      <div className="num-display text-[44px] leading-none tracking-tight text-text-primary">
        {value}
        {unit && (
          <span className="ml-1 text-base align-baseline text-text-tertiary">
            {unit}
          </span>
        )}
      </div>
      {series && series.length > 0 && (
        <div className={cn("h-8", accentClass(accent))}>
          <Sparkline
            data={series.length > 1 ? series : [0, ...series]}
            color="currentColor"
            width={240}
            height={32}
            strokeWidth={1.5}
          />
        </div>
      )}
      {hint && <p className="text-[11px] text-text-tertiary">{hint}</p>}
    </div>
  );
}

/* ============================================================
   StatTile — 紧凑 KPI，没有 sparkline
   ============================================================ */
export function StatTile({
  label,
  value,
  accent = "primary",
  icon,
  suffix,
  hint,
}: {
  label: string;
  value: string | number;
  accent?: Accent;
  icon?: IconName;
  suffix?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        {icon && (
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md",
              accentBgClass(accent),
            )}
          >
            <IconGlyph name={icon} size={12} />
          </span>
        )}
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className={cn(
            "num-display text-2xl leading-none tracking-tight",
            accentClass(accent),
          )}
        >
          {value}
        </span>
        {suffix && <span className="text-xs text-text-tertiary">{suffix}</span>}
      </div>
      {hint && <p className="mt-1 text-[11px] text-text-tertiary">{hint}</p>}
    </div>
  );
}

/* ============================================================
   QuickActionCard / QuickActionGrid
   ============================================================ */
export function QuickActionCard({
  href,
  title,
  description,
  icon,
  accent = "primary",
  onClick,
  external,
}: {
  href?: string;
  title: string;
  description?: string;
  icon: IconName;
  accent?: Accent;
  onClick?: () => void;
  external?: boolean;
}) {
  const content = (
    <>
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          accentBgClass(accent),
        )}
      >
        <IconGlyph name={icon} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{title}</p>
        {description && (
          <p className="truncate text-xs text-text-tertiary">{description}</p>
        )}
      </div>
      <span className="shrink-0 text-xs text-text-muted transition-colors group-hover:text-text-secondary">
        {external ? <IconGlyph name="external" size={12} /> : "→"}
      </span>
    </>
  );

  const className =
    "group flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-elevated";

  if (href) {
    if (external) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className={className}>
          {content}
        </a>
      );
    }
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={cn(className, "text-left")}>
      {content}
    </button>
  );
}

export function QuickActionGrid({
  actions,
  columns = 3,
}: {
  actions: Array<
    Parameters<typeof QuickActionCard>[0] & { key?: string }
  >;
  columns?: 2 | 3 | 4;
}) {
  const colClass =
    columns === 2 ? "md:grid-cols-2" : columns === 4 ? "md:grid-cols-4" : "md:grid-cols-3";
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", colClass)}>
      {actions.map((a, i) => (
        <QuickActionCard key={a.key ?? a.title ?? i} {...a} />
      ))}
    </div>
  );
}

/* ============================================================
   SeverityPill — 统一 high/medium/low → error/warning/info
   ============================================================ */
export function severityAccent(level: string): Accent {
  const normalized = level?.toLowerCase?.() ?? "";
  if (["high", "critical", "severe", "danger", "error", "高", "严重"].includes(normalized))
    return "error";
  if (["medium", "moderate", "warning", "中", "中等"].includes(normalized)) return "warning";
  if (["low", "minor", "info", "低"].includes(normalized)) return "info";
  if (["success", "ok", "safe", "通过", "良好"].includes(normalized)) return "success";
  return "muted";
}

export function SeverityPill({
  level,
  label,
  size = "sm",
}: {
  level: string;
  label?: ReactNode;
  size?: "sm" | "md";
}) {
  const a = severityAccent(level);
  const variant =
    a === "error" ? "error" : a === "warning" ? "warning" : a === "info" ? "info" : a === "success" ? "success" : "default";
  return (
    <Badge variant={variant as "error" | "warning" | "info" | "success" | "default"} size={size} dot>
      {label ?? level}
    </Badge>
  );
}

/* ============================================================
   DepthBadge — provider 深度徽章（L1/L2/L3）
   源自 /providers/depth — 反映该律师在某赛道的成交深度。
   ============================================================ */
export type DepthLevel = "L1" | "L2" | "L3";

export function DepthBadge({
  level,
  area,
  label,
  size = "sm",
}: {
  level: DepthLevel | string;
  /** 具体赛道，例如 `trademark`，用于补充显示。*/
  area?: string;
  /** 自定义文案，例如"深耕专家"。*/
  label?: string;
  size?: "sm" | "md";
}) {
  const variant =
    level === "L3" ? "success" : level === "L2" ? "info" : "default";
  const suffix = area ? ` · ${area}` : "";
  return (
    <Badge
      variant={variant as "success" | "info" | "default"}
      size={size}
      dot
    >
      {label ? `${label} ${level}` : `深度 ${level}`}
      {suffix}
    </Badge>
  );
}

/* ============================================================
   TrendBadge — ↑/↓/— + 百分比
   ============================================================ */
export function TrendBadge({
  trend,
  value,
}: {
  trend: "up" | "down" | "neutral";
  value: string;
}) {
  const cls =
    trend === "up"
      ? "text-success-500"
      : trend === "down"
        ? "text-error-500"
        : "text-text-tertiary";
  const arrow = trend === "up" ? "↑" : trend === "down" ? "↓" : "—";
  return (
    <span className={cn("text-xs font-semibold tabular-nums", cls)}>
      {arrow} {value}
    </span>
  );
}

/* ============================================================
   EmptyHero — 大气的空态
   ============================================================ */
export function EmptyHero({
  icon = "sparkle",
  title,
  description,
  primaryAction,
  secondaryAction,
  accent = "primary",
  className,
}: {
  icon?: IconName;
  title: string;
  description?: ReactNode;
  primaryAction?: { label: string; href?: string; onClick?: () => void };
  secondaryAction?: { label: string; href?: string; onClick?: () => void };
  accent?: Accent;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-elevated/50 px-6 py-12 text-center",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full",
          accentBgClass(accent),
        )}
      >
        <IconGlyph name={icon} size={24} />
      </span>
      <h3 className="mt-4 font-serif text-lg font-medium tracking-tight text-text-primary">
        {title}
      </h3>
      {description && (
        <p className="mt-1 max-w-md text-sm text-text-tertiary">{description}</p>
      )}
      {(primaryAction || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {primaryAction &&
            (primaryAction.href ? (
              <Link
                href={primaryAction.href}
                className="inline-flex h-9 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
              >
                {primaryAction.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={primaryAction.onClick}
                className="inline-flex h-9 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
              >
                {primaryAction.label}
              </button>
            ))}
          {secondaryAction &&
            (secondaryAction.href ? (
              <Link
                href={secondaryAction.href}
                className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-elevated"
              >
                {secondaryAction.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-elevated"
              >
                {secondaryAction.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Skeleton — consistent loading shimmer blocks
   ============================================================ */
export function Skeleton({
  className,
  height = 12,
  rounded = "md",
}: {
  className?: string;
  /** approximate height in px; mapped to a tailwind class below. */
  height?: 8 | 12 | 16 | 24 | 32 | 48;
  rounded?: "sm" | "md" | "lg" | "full";
}) {
  const heightClass = {
    8: "h-2",
    12: "h-3",
    16: "h-4",
    24: "h-6",
    32: "h-8",
    48: "h-12",
  }[height];
  const roundedClass = {
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-full",
  }[rounded];
  return (
    <div
      className={cn(
        "w-full animate-pulse bg-neutral-200/70 dark:bg-neutral-800/60",
        heightClass,
        roundedClass,
        className,
      )}
      aria-hidden="true"
    />
  );
}

export function SkeletonList({
  rows = 3,
  lineHeight = 16,
  gap = "gap-3",
}: {
  rows?: number;
  lineHeight?: 8 | 12 | 16 | 24;
  gap?: string;
}) {
  return (
    <div className={cn("flex flex-col", gap)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton height={lineHeight} className="w-3/4" />
          <Skeleton height={12} className="w-1/2" />
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Tabs + 计数 Badge — 比基础 TabBar 更丰富
   ============================================================ */
export function IconTabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: T; label: string; icon?: IconName; count?: number }>;
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {tabs.map((t) => {
        const on = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={cn(
              "inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              on
                ? "border-primary-500 text-primary-600"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {t.icon && <IconGlyph name={t.icon} size={14} />}
            <span>{t.label}</span>
            {typeof t.count === "number" && (
              <Badge variant={on ? "primary" : "outline"} size="sm">
                {t.count}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
