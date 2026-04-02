import type { ReactNode } from "react";
import Link from "next/link";
import { modules } from "@a1plus/domain";
import { StatusBadge, cn } from "@a1plus/ui";

export function AppShell({
  pathname,
  children
}: {
  pathname: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(160,74,42,0.12),_transparent_32%),linear-gradient(180deg,#f8f3eb_0%,#fefcf8_32%,#f6efe4_100%)] text-ink">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 lg:px-8">
        <aside className="hidden w-72 shrink-0 rounded-[32px] border border-white/70 bg-[#fffaf2]/85 p-6 shadow-soft backdrop-blur lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-rust">
            A1+ IP Coworker
          </p>
          <h1 className="mt-4 font-serif text-3xl text-slate-950">
            全 PRD 骨架
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Web 优先，多端预留。主流程可运行，扩展模块带 feature flag 占位。
          </p>
          <nav className="mt-8 space-y-2">
            {modules.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);

              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "block rounded-2xl border px-4 py-3 transition",
                    active
                      ? "border-rust/30 bg-rust/10 text-slate-950"
                      : "border-transparent bg-white/60 text-slate-600 hover:border-slate-200 hover:bg-white"
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.description}
                      </p>
                    </div>
                    <StatusBadge
                      label={item.status === "core" ? "Core" : "Skeleton"}
                      tone={item.status === "core" ? "success" : "info"}
                    />
                  </div>
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 space-y-6">{children}</main>
      </div>
    </div>
  );
}
