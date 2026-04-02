import type { PropsWithChildren, ReactNode } from "react";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function SectionCard({
  title,
  eyebrow,
  actions,
  children,
  className
}: PropsWithChildren<{
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
}>) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-[0_18px_80px_rgba(15,23,42,0.08)] backdrop-blur",
        className
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-2xl font-semibold text-slate-950">{title}</h2>
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function StatusBadge({
  label,
  tone = "neutral"
}: {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
}) {
  const toneMap = {
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    success: "bg-emerald-100 text-emerald-800 border-emerald-200",
    warning: "bg-amber-100 text-amber-800 border-amber-200",
    danger: "bg-rose-100 text-rose-800 border-rose-200",
    info: "bg-sky-100 text-sky-800 border-sky-200"
  } as const;

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
        toneMap[tone]
      )}
    >
      {label}
    </span>
  );
}

export function SourceTag({
  mode,
  provider
}: {
  mode: "real" | "mock";
  provider: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
      <span className="font-semibold uppercase tracking-[0.2em]">{mode}</span>
      <span>{provider}</span>
    </div>
  );
}

export function Metric({
  label,
  value,
  detail
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

