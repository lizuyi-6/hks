"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkflowInstance } from "@a1plus/domain";
import { modules } from "@a1plus/domain";
import { PipelineIndicator, StatusBadge, cn } from "@a1plus/ui";
import { proxyBaseUrl } from "@/lib/env";

const stepTypeNames: Record<string, string> = {
  diagnosis: "IP 诊断",
  trademark_check: "商标查重",
  application_generate: "申请书生成",
  submission_guide: "提交引导",
  ledger_write: "入台账",
  reminder_create: "创建提醒",
  monitoring_scan: "侵权监控",
  competitor_track: "竞争对手追踪",
  contract_review: "合同审查",
  patent_assess: "专利评估",
  policy_digest: "政策速递",
  due_diligence: "尽调报告"
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [activeWorkflow, setActiveWorkflow] = useState<WorkflowInstance | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [profileComplete, setProfileComplete] = useState(true);

  useEffect(() => {
    fetch(`${proxyBaseUrl}/workflows?status=running`)
      .then((res) => res.json() as Promise<WorkflowInstance[]>)
      .then((workflows) => {
        if (workflows.length > 0) {
          setActiveWorkflow(workflows[0]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${proxyBaseUrl}/profile`, { credentials: "include" })
      .then((res) => res.json() as Promise<{ fullName: string; profileComplete: boolean }>)
      .then((data) => {
        setUserName(data.fullName ?? "");
        setProfileComplete(data.profileComplete ?? false);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(160,74,42,0.12),_transparent_32%),linear-gradient(180deg,#f8f3eb_0%,#fefcf8_32%,#f6efe4_100%)] text-ink">
      <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-6 lg:px-8">
        <aside className="hidden w-72 shrink-0 flex-col rounded-[32px] border border-white/70 bg-[#fffaf2]/85 p-6 shadow-soft backdrop-blur lg:flex">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-rust">
            A1+ IP Coworker
          </p>
          <h1 className="mt-4 font-serif text-3xl text-slate-950">
            全 PRD 骨架
          </h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            Web 优先，多端预留。主流程可运行，扩展模块带 feature flag 占位。
          </p>
          {activeWorkflow ? (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-700">{activeWorkflow.workflowType}</p>
                <StatusBadge label={activeWorkflow.status} tone="info" />
              </div>
              <div className="mt-3">
                <PipelineIndicator
                  steps={activeWorkflow.steps.map((step) => ({ name: stepTypeNames[step.stepType] ?? step.stepType }))}
                  currentIndex={activeWorkflow.currentStepIndex}
                />
              </div>
            </div>
          ) : null}
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
          <div className="mt-auto pt-6">
            <Link
              href="/profile"
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-4 py-3 transition",
                pathname === "/profile"
                  ? "border-rust/30 bg-rust/10 text-slate-950"
                  : "border-transparent bg-white/60 text-slate-600 hover:border-slate-200 hover:bg-white"
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rust/15 text-sm font-semibold text-rust">
                {userName ? userName.charAt(0) : "?"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{userName || "用户"}</p>
                {!profileComplete && (
                  <p className="text-xs text-amber-600">完善资料</p>
                )}
              </div>
            </Link>
          </div>
        </aside>
        <main className="flex-1 space-y-6">{children}</main>
      </div>
    </div>
  );
}
