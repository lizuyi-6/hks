/**
 * A1+ UI Component Library
 * 统一导出所有UI组件
 */

import type { PropsWithChildren, ReactNode } from "react";
import Link from "next/link";

// ========================================
// Utilities
// ========================================
export { cn } from "./utils";
export * from "./utils";

// ========================================
// Design System Components
// ========================================
export * from "./button";
export * from "./input";
export * from "./textarea";
export * from "./select";
export * from "./loading";
export * from "./card";
export * from "./empty";
export * from "./error";
export * from "./badge";
export * from "./stepper";
export * from "./modal";
export * from "./toast";
export * from "./alert";
export * from "./workspace";

// ========================================
// Legacy Components (re-skinned to zinc/indigo tokens)
// ========================================

function cnLegacy(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export { cnLegacy };

/**
 * @deprecated Use Card from ./card instead
 */
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
      className={cnLegacy(
        "rounded-md border border-border bg-surface p-4 animate-fade-in",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="mb-1 text-xs font-medium text-text-tertiary">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * @deprecated Use Badge with variant="outline" instead
 */
export function SourceTag({ mode, provider }: { mode: string; provider: string }) {
  const modeLabels: Record<string, string> = {
    real: "真实",
    mock: "模拟",
  };
  const label = modeLabels[mode] ?? mode;
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-neutral-50 px-2 py-0.5 text-xs text-text-tertiary">
      <span className="font-medium">{label}</span>
      <span className="text-text-muted">·</span>
      <span>{provider}</span>
    </div>
  );
}

/**
 * @deprecated Use Badge with semantic variant instead
 */
export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const toneClasses: Record<string, string> = {
    success: "bg-success-50 text-success-700 border border-success-100",
    warning: "bg-warning-50 text-warning-700 border border-warning-100",
    danger: "bg-error-50 text-error-700 border border-error-100",
    info: "bg-info-50 text-info-700 border border-info-100",
  };
  return (
    <span
      className={cnLegacy("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", toneClasses[tone])}
    >
      {label}
    </span>
  );
}

/**
 * @deprecated Use StatCard instead
 */
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
    <div className="rounded-md border border-border bg-surface p-4">
      <p className="text-xs text-text-tertiary">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-text-primary">{value}</p>
      {detail ? <p className="mt-1 text-xs text-text-muted">{detail}</p> : null}
    </div>
  );
}

/**
 * @deprecated Use Stepper instead
 */
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
                  className={cnLegacy(
                    "h-0.5 flex-1",
                    i <= currentIndex ? "bg-primary-600" : "bg-neutral-200",
                  )}
                />
              )}
              <div
                className={cnLegacy(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  isCompleted && "bg-primary-600 text-white",
                  isCurrent && "bg-primary-600 text-white ring-2 ring-primary-200",
                  !isCompleted && !isCurrent && "bg-neutral-100 text-text-tertiary",
                )}
              >
                {isCompleted ? (
                  "✓"
                ) : isCurrent ? (
                  <span className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  i + 1
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={cnLegacy(
                    "h-0.5 flex-1",
                    i < currentIndex ? "bg-primary-600" : "bg-neutral-200",
                  )}
                />
              )}
            </div>
            <span
              className={cnLegacy(
                "mt-1.5 text-[10px] leading-tight text-center",
                isCurrent && "font-semibold text-text-primary",
                isCompleted && "text-text-secondary",
                !isCompleted && !isCurrent && "text-text-muted",
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

/**
 * @deprecated Use Alert with action instead
 */
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
    <div className="relative rounded-md border border-border bg-neutral-50 p-4 animate-fade-up">
      {onClose ? (
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded text-text-muted hover:text-text-secondary transition-colors"
        >
          ×
        </button>
      ) : null}
      <h3 className="text-sm font-semibold text-text-primary">
        <span className="mr-1.5 text-primary-600">→</span>
        {title}
      </h3>
      <p className="mt-1 text-xs text-text-secondary">{description}</p>
      <Link
        href={action.href}
        className="mt-3 inline-flex h-7 items-center rounded-md bg-primary-600 px-3 text-xs font-medium text-white hover:bg-primary-700 transition-colors btn-press"
      >
        {action.label}
      </Link>
    </div>
  );
}
