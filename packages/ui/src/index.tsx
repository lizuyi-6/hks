﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿import type { PropsWithChildren, ReactNode } from "react";
import Link from "next/link";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function SectionCard({
  title,
  eyebrow,
  actions,
  children,
  className,
}: PropsWithChildren<{
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}>) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_18px_80px_rgba(15,23,42,0.08)] backdrop-blur animate-fade-up card-hover",
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SourceTag({ mode, provider }: { mode: string; provider: string }) {
  const modeLabels: Record<string, string> = {
    real: "真实",
    mock: "模拟",
  };
  const label = modeLabels[mode] ?? mode;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
      <span className="font-semibold uppercase tracking-[0.2em]">{label}</span>
      <span>{provider}</span>
    </div>
  );
}

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const toneClasses: Record<string, string> = {
    success: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    warning: "bg-amber-100 text-amber-800 border border-amber-200",
    danger: "bg-rose-100 text-rose-800 border border-rose-200",
    info: "bg-sky-100 text-sky-800 border border-sky-200",
  };
  return (
    <span
      className={cn("inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold", toneClasses[tone])}
    >
      {label}
    </span>
  );
}

export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
      {detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

export function PipelineIndicator({
  steps,
  currentIndex,
}: {
  steps: Array<{ name: string }>;
  currentIndex: number;
}) {
  return (
    <div className="flex items-start gap-0">
      {steps.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={i} className="flex flex-col items-center" style={{ flex: 1 }}>
            <div className="flex w-full items-center">
              {i > 0 && (
                <div
                  className={cn(
                    "h-0.5 flex-1",
                    i <= currentIndex ? "bg-emerald-400" : "bg-slate-200",
                  )}
                />
              )}
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  isCompleted && "bg-emerald-500 text-white",
                  isCurrent && "bg-blue-500 text-white",
                  !isCompleted && !isCurrent && "bg-slate-200 text-slate-500",
                )}
              >
                {isCompleted ? (
                  "✓"
                ) : isCurrent ? (
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  i + 1
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1",
                    i < currentIndex ? "bg-emerald-400" : "bg-slate-200",
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                "mt-2 text-xs",
                isCurrent && "font-semibold text-slate-900",
                isCompleted && "text-slate-600",
                !isCompleted && !isCurrent && "text-slate-400",
              )}
            >
              {step.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function NextStepCard({
  title,
  description,
  action,
  onClose,
}: {
  title: string;
  description: string;
  action: { label: string; href: string };
  onClose?: () => void;
}) {
  return (
    <div className="relative rounded-2xl border border-blue-200 bg-blue-50 p-5 animate-slide-in-up">
      {onClose ? (
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 transition-colors"
        >
          ×
        </button>
      ) : null}
      <h3 className="text-base font-semibold text-slate-900">
        <span className="mr-1.5">→</span>
        {title}
      </h3>
      <p className="mt-1.5 text-sm text-slate-600">{description}</p>
      <Link
        href={action.href}
        className="mt-3 inline-block rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors btn-press"
      >
        {action.label}
      </Link>
    </div>
  );
}
