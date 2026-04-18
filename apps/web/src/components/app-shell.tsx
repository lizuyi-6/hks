"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkflowInstance } from "@a1plus/domain";
import { modules } from "@a1plus/domain";
import { PipelineIndicator, StatusBadge, cn } from "@a1plus/ui";
import { proxyBaseUrl } from "@/lib/env";
import GooeyNav from "@/components/gooey-nav";

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
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetch(`${proxyBaseUrl}/workflows?status=running`, { credentials: "include" })
      .then((res) => {
        if (res.status === 401) { window.location.href = "/login"; return []; }
        return res.json() as Promise<WorkflowInstance[]>;
      })
      .then((workflows) => {
        if (workflows && workflows.length > 0) {
          setActiveWorkflow(workflows[0]);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${proxyBaseUrl}/profile`, { credentials: "include" })
      .then((res) => {
        if (res.status === 401) { window.location.href = "/login"; return null; }
        return res.json() as Promise<{ fullName: string; profileComplete: boolean }>;
      })
      .then((data) => {
        if (!data) return;
        setUserName(data.fullName ?? "");
        setProfileComplete(data.profileComplete ?? false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${proxyBaseUrl}/notifications/count`, { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setUnreadCount(d.unread ?? 0))
      .catch(() => {});
  }, []);

  const handleInboxClick = () => {
    if (unreadCount > 0) {
      fetch(`${proxyBaseUrl}/notifications/read-all`, {
        method: "POST",
        credentials: "include",
      })
        .then(() => setUnreadCount(0))
        .catch(() => {});
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(160,74,42,0.12),_transparent_32%),linear-gradient(180deg,#f8f3eb_0%,#fefcf8_32%,#f6efe4_100%)] text-ink">
      <div className="mx-auto flex h-full max-w-7xl gap-6 px-4 py-6 lg:px-8">
        <aside className="hidden w-72 shrink-0 flex-col rounded-[32px] border border-white/70 bg-[#fffaf2]/85 shadow-soft backdrop-blur lg:flex">
          <div className="flex-1 overflow-y-auto p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-rust animate-fade-in">
              A1+ IP Coworker
            </p>
            <h1 className="mt-4 font-serif text-3xl text-slate-950 animate-fade-up">
              知识产权助手
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-600 animate-fade-up" style={{ animationDelay: '0.1s' }}>
              商标查重、申请书生成、IP诊断与资产管理，一站式服务。
            </p>
            {activeWorkflow ? (
              <div className="mb-6 mt-6 rounded-2xl border border-slate-200 bg-white/80 p-4 animate-scale-in">
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
            <nav className="mt-8 space-y-2 stagger-list">
              {modules.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={item.href === "/inbox" ? handleInboxClick : undefined}
                    className={cn(
                      "block rounded-2xl border px-4 py-3 transition-all duration-200 card-hover",
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
                      {item.href === "/inbox" && unreadCount > 0 ? (
                        <span className="ml-auto rounded-full bg-red-500 text-white text-xs px-2 py-0.5 min-w-[20px] text-center animate-scale-in">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      ) : (
                      <StatusBadge
                        label={item.status === "core" ? "Core" : "Skeleton"}
                        tone={item.status === "core" ? "success" : "info"}
                      />
                      )}
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="shrink-0 border-t border-slate-200/50 p-6 animate-fade-in">
            <Link
              href="/profile"
              className={cn(
                "flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all duration-200 card-hover",
                pathname === "/profile"
                  ? "border-rust/30 bg-rust/10 text-slate-950"
                  : "border-transparent bg-white/60 text-slate-600 hover:border-slate-200 hover:bg-white"
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rust/15 text-sm font-semibold text-rust transition-transform duration-200 hover:scale-110">
                {userName ? userName.charAt(0) : "?"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{userName || "用户"}</p>
                {!profileComplete && (
                  <p className="text-xs text-amber-600">完善资料</p>
                )}
              </div>
            </Link>
            <button
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              }}
              className="mt-2 w-full rounded-2xl border border-transparent bg-white/60 px-4 py-2 text-left text-sm text-slate-500 transition-all duration-200 hover:border-slate-200 hover:bg-white hover:text-slate-700 btn-press"
            >
              退出登录
            </button>
          </div>
        </aside>

        {/* Mobile Navigation */}
        <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
          <div className="bg-slate-950/95 backdrop-blur-lg border-t border-white/10 px-2 py-2 safe-area-bottom">
            <GooeyNav
              items={[
                { label: "收件箱", href: "/inbox" },
                { label: "工作台", href: "/dashboard" },
                { label: "IP规划", href: "/diagnosis" },
                { label: "商标", href: "/trademark/check" },
                { label: "资产", href: "/assets" },
              ]}
              particleCount={10}
              particleDistances={[70, 8]}
              particleR={80}
              animationTime={500}
              timeVariance={200}
            />
          </div>
        </div>

        <main className="flex-1 space-y-6 overflow-y-auto animate-fade-in pb-20 lg:pb-0" key={pathname}>{children}</main>
      </div>
    </div>
  );
}
