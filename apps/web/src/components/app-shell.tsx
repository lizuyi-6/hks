"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { WorkflowInstance } from "@a1plus/domain";
import { modules, stepTypeNames, modulesByPillar } from "@a1plus/domain";
import { cn } from "@a1plus/ui";
import { proxyBaseUrl } from "@/lib/env";
import { trackError } from "@/lib/analytics";
import { ThemeToggle } from "@/components/theme-toggle";
import { FloatingAgent } from "@/components/agent/floating-agent";

/* ========================================
   SVG nav icons (inline, 16×16 line icons)
   ======================================== */
const icons: Record<string, ReactNode> = {
  inbox: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 10.5h2.5l1.5 2h4l1.5-2H14V4a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v6.5z" />
    </svg>
  ),
  dashboard: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="5" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="9" width="5" height="5" rx="1" />
    </svg>
  ),
  diagnosis: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v4l2 2M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0z" />
    </svg>
  ),
  trademark: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h10v10H3zM6 6h4M8 6v4" />
    </svg>
  ),
  assets: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 13V7M8 13V3M12 13v-4" />
    </svg>
  ),
  monitoring: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 8h2l2-4 2 8 2-6 1.5 2H14" />
    </svg>
  ),
  contracts: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM6 6h4M6 9h4" />
    </svg>
  ),
  policies: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2L3 5v4c0 2.8 2.2 4.8 5 5.5 2.8-.7 5-2.7 5-5.5V5L8 2z" />
    </svg>
  ),
  "due-diligence": (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.5 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9.5 2zM9 2v4h4M6 9h4M6 11h2" />
    </svg>
  ),
  consult: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 6a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3H7l-3 2v-2H5a3 3 0 0 1-3-3V6z" />
    </svg>
  ),
  match: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <circle cx="8" cy="8" r="6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 8l2 2 4-4" />
    </svg>
  ),
  orders: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <rect x="3" y="2" width="10" height="12" rx="1" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 5h4M6 8h4M6 11h2" />
    </svg>
  ),
  provider: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <circle cx="8" cy="6" r="3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 14c1-2.5 3-4 5.5-4s4.5 1.5 5.5 4" />
    </svg>
  ),
  enterprise: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 1.5L2.5 4v4.5c0 3 2.4 5.3 5.5 6 3.1-.7 5.5-3 5.5-6V4L8 1.5z" />
    </svg>
  ),
  litigation: (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v12M3 5h10M4.5 5l-1.6 4.2c.9.6 2.2.6 3.1 0L4.5 5zM11.5 5L9.9 9.2c.9.6 2.2.6 3.1 0L11.5 5zM5 14h6" />
    </svg>
  ),
  "my-profile": (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3l1.3 2.7L12 6l-2 2 .5 2.8L8 9.5 5.5 10.8 6 8 4 6l2.7-.3L8 3z" />
      <circle cx="8" cy="8" r="6" />
    </svg>
  ),
  "push-center": (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 2a4 4 0 0 1 4 4v2l1 2H3l1-2V6a4 4 0 0 1 4-4zM6.5 12.5a1.5 1.5 0 0 0 3 0" />
    </svg>
  ),
};

const mobileTabKeys = ["dashboard", "match", "consult", "orders", "inbox"] as const;

/* ========================================
   NavLink — wraps Link and shows a pending
   spinner the instant the user clicks,
   using Next.js 15 useLinkStatus().
   ======================================== */
function NavLink({
  href,
  children,
  active,
  onClick,
  className,
}: {
  href: string;
  children: ReactNode;
  active: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <Link
      href={href}
      onClick={onClick}
      prefetch={true}
      className={cn(
        "group flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
        active
          ? "bg-surface-elevated text-text-primary font-medium"
          : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary",
        pending && "opacity-70",
        className,
      )}
    >
      {children}
      {pending && (
        <span className="ml-auto inline-block h-3 w-3 shrink-0 animate-spin rounded-full border border-primary-500 border-t-transparent" />
      )}
    </Link>
  );
}

/* ========================================
   TopProgress — thin loading bar at the
   very top of the page that advances while
   the router transition is pending.
   ======================================== */
function TopProgress({ pending }: { pending: boolean }) {
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (pending) {
      setWidth(0);
      setVisible(true);
      let w = 0;
      timerRef.current = setInterval(() => {
        // Advance quickly at first, then slow down asymptotically
        w = w < 70 ? w + 8 : w < 90 ? w + 2 : w + 0.3;
        setWidth(Math.min(w, 93));
      }, 80);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setWidth(100);
      const t = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 250);
      return () => clearTimeout(t);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pending]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[900] h-[2px] bg-primary-500"
      style={{
        width: `${width}%`,
        transition: pending ? "width 80ms linear" : "width 200ms ease-out, opacity 200ms ease-out",
        opacity: width >= 100 ? 0 : 1,
      }}
    />
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
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
        if (workflows && workflows.length > 0) setActiveWorkflow(workflows[0]);
      })
      .catch((e) => trackError({ event: "error", error_type: "network_error", message: `app-shell.workflows: ${e}` }));
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
      .catch((e) => trackError({ event: "error", error_type: "network_error", message: `app-shell.profile: ${e}` }));
  }, []);

  useEffect(() => {
    fetch(`${proxyBaseUrl}/notifications/count`, { credentials: "include" })
      .then((r) => { if (!r.ok) return null; return r.json(); })
      .then((d) => { if (d && typeof d.unread === "number") setUnreadCount(d.unread); })
      .catch((e) => trackError({ event: "error", error_type: "network_error", message: `app-shell.notifications-count: ${e}` }));
  }, []);

  const handleInboxClick = () => {
    if (unreadCount > 0) {
      fetch(`${proxyBaseUrl}/notifications/read-all`, { method: "POST", credentials: "include" })
        .then(() => setUnreadCount(0))
        .catch(() => {});
    }
  };

  const navigate = (href: string) => {
    startTransition(() => { router.push(href); });
  };

  const pageTitle = modules.find((m) => pathname === m.href || pathname.startsWith(`${m.href}/`))?.title ?? "";

  return (
    <div className="flex h-screen bg-surface-sunken text-text-primary">
      <TopProgress pending={isPending} />

      {/* ===== Sidebar (desktop) ===== */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        {/* Logo */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <span className="font-serif text-lg font-semibold tracking-tight text-primary-600">A1+</span>
          <span className="text-sm font-medium text-text-primary">IP 法律服务平台</span>
        </div>

        {/* Nav — 按 7 支柱分组 */}
        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {modulesByPillar().map(({ pillar, meta, items }) => {
            if (items.length === 0) return null;
            const pillarLabel =
              pillar === "ops" ? "工作区 · 工具"
                : `支柱 · ${meta.label}`;
            return (
              <div key={pillar} className="mb-3">
                <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {pillarLabel}
                </div>
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const isSubordinate = item.pillar === "ops" && Boolean(item.parentPillar);
                    return (
                      <NavLink
                        key={item.key}
                        href={item.href}
                        active={active}
                        onClick={item.href === "/inbox" ? handleInboxClick : undefined}
                        className={cn(isSubordinate && "ml-3 text-[13px] text-text-tertiary")}
                      >
                        {icons[item.key] ?? null}
                        <span className="flex-1 truncate">{item.title}</span>
                        {isSubordinate && (
                          <span className="ml-auto rounded-sm border border-border px-1 py-0 text-[9px] font-medium text-text-tertiary">
                            子能力
                          </span>
                        )}
                        {item.href === "/inbox" && unreadCount > 0 && (
                          <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-medium text-text-inverse">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Profile */}
        <div className="mt-auto border-t border-border p-2 space-y-0.5">
          <NavLink
            href="/profile"
            active={pathname === "/profile"}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-600 text-[10px] font-semibold text-text-inverse">
              {userName ? userName.charAt(0) : "?"}
            </span>
            <span className="flex-1 truncate">{userName || "用户"}</span>
            {!profileComplete && (
              <span className="text-[10px] text-warning-500">完善资料</span>
            )}
          </NavLink>
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-text-tertiary transition-colors hover:bg-surface-elevated hover:text-text-secondary"
            title="退出登录"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 3h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-3M7 11l3-3-3-3M10 8H2" />
            </svg>
            <span>退出登录</span>
          </button>
        </div>
      </aside>

      {/* ===== Main column (topbar + content) ===== */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Topbar */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
          {/* Breadcrumb / page title */}
          <span className="text-sm font-medium text-text-primary flex-1 truncate">{pageTitle}</span>

          {/* Active workflow chip */}
          {activeWorkflow && (
            <div className="hidden md:inline-flex h-7 items-center gap-2 rounded-md border border-border px-2 text-xs text-text-secondary">
              <span className="inline-block h-2 w-2 rounded-full bg-primary-500 animate-pulse-soft" />
              <span>{stepTypeNames[activeWorkflow.steps[activeWorkflow.currentStepIndex]?.stepType] ?? activeWorkflow.workflowType}</span>
            </div>
          )}

          {/* Theme toggle */}
          <ThemeToggle />

          {/* Notification bell */}
          <button
            onClick={() => { handleInboxClick(); navigate("/inbox"); }}
            className="relative flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-elevated hover:text-text-primary"
            aria-label="通知"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 2a4 4 0 0 1 4 4v2l1 2H3l1-2V6a4 4 0 0 1 4-4zM6.5 12.5a1.5 1.5 0 0 0 3 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary-600" />
            )}
          </button>

          {/* Profile avatar */}
          <button
            onClick={() => navigate("/profile")}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-[11px] font-semibold text-text-inverse hover:opacity-90 transition-opacity"
            title="个人资料"
          >
            {userName ? userName.charAt(0) : "?"}
          </button>
        </header>

        {/* Main content */}
        <main
          className={cn(
            "flex-1 overflow-y-auto px-8 py-6 pb-24 lg:px-10 lg:py-8 lg:pb-8 transition-opacity duration-150",
            isPending && "opacity-60 pointer-events-none",
          )}
        >
          {children}
        </main>
      </div>

      {/* ===== Mobile bottom tab bar ===== */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-border bg-surface lg:hidden">
        {mobileTabKeys.map((key) => {
          const item = modules.find((m) => m.key === key);
          if (!item) return null;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <NavLink
              key={key}
              href={item.href}
              active={false}
              onClick={key === "inbox" ? handleInboxClick : undefined}
              className={cn(
                "flex flex-col items-center gap-1 px-3 h-auto rounded-none",
                active ? "text-primary-600" : "text-text-tertiary",
              )}
            >
              {icons[key] ?? null}
              <span className="text-[10px] leading-none">{item.title}</span>
              {key === "inbox" && unreadCount > 0 && (
                <span className="absolute top-1 h-1.5 w-1.5 rounded-full bg-primary-600" />
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* ===== AI Agent floating entrypoint (主动副驾; 仍渲染在 /consult 上以支持 consult.* 主动规则) ===== */}
      <FloatingAgent />
    </div>
  );
}
