"use client";

/**
 * FloatingAgent — 悬浮 AI 法务大脑 / 主动副驾入口。
 *
 * 两种打开方式：
 * 1. 用户点击按钮 → 传统入口，输入一句话 → /consult?prefill=…
 * 2. 后端 `/agent/proactive/peek` 命中规则 → 按钮呼吸 + 气泡自动展开，
 *    显示 AI 观察卡（title + body + 2-3 个动作 + 右上角降噪菜单）。
 *
 * 每次路由变化 2s 防抖后调用一次 peek。当前页的 `usePageResource()`
 * 会把 `resourceType` / `resourceId` 一起带上，让规则能访问具体资源。
 */
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@a1plus/ui";
import { request } from "@/components/workspace/shared";
import { usePageResource } from "@/lib/use-page-context";

type ProactiveAction = {
  id: string;
  label: string;
  tool: string | null;
  params?: Record<string, unknown>;
  kind?: "primary" | "secondary" | "navigate";
};

type ProactiveSuggestion = {
  id: string;
  ruleKey: string;
  route: string;
  title: string;
  body: string | null;
  actions: ProactiveAction[];
  sourceMode: "llm" | "fallback";
  status: string;
  feedback?: "up" | "down" | null;
  createdAt: string | null;
  expiresAt: string | null;
};

type PeekResponse = { suggestion: ProactiveSuggestion | null };
type ExecuteResponse =
  | { ok: true; kind: "navigate"; href?: string; suggestion: ProactiveSuggestion }
  | { ok: true; kind: "tool"; tool: string; result: Record<string, unknown>; suggestion: ProactiveSuggestion }
  | { ok: false; error: string };

const PEEK_DEBOUNCE_MS = 2000;
const AUTO_COLLAPSE_MS = 18_000;

export function FloatingAgent({ hidden = false }: { hidden?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const pageResource = usePageResource();

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [suggestion, setSuggestion] = useState<ProactiveSuggestion | null>(null);
  // When a suggestion is present we show the AI observation card by default
  // instead of the freeform textarea. Users can still toggle via a link.
  const [mode, setMode] = useState<"suggestion" | "compose">("compose");
  const [executing, setExecuting] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsedByUser, setCollapsedByUser] = useState(false);

  const autoCollapseTimer = useRef<number | null>(null);
  const peekTimer = useRef<number | null>(null);
  // Track the last route we peeked for so we don't spam the backend when
  // React re-renders for unrelated reasons.
  const lastPeekedKey = useRef<string | null>(null);

  const clearPeekTimer = () => {
    if (peekTimer.current != null) {
      window.clearTimeout(peekTimer.current);
      peekTimer.current = null;
    }
  };
  const clearAutoCollapse = () => {
    if (autoCollapseTimer.current != null) {
      window.clearTimeout(autoCollapseTimer.current);
      autoCollapseTimer.current = null;
    }
  };

  /* ---------- Peek on route / resource change (2s debounce) ---------- */

  useEffect(() => {
    if (hidden) return;
    const route = pathname || "/";
    const key = `${route}::${pageResource?.type ?? ""}::${pageResource?.id ?? ""}`;
    if (lastPeekedKey.current === key) return;
    lastPeekedKey.current = key;

    clearPeekTimer();
    peekTimer.current = window.setTimeout(async () => {
      try {
        const body: Record<string, unknown> = { route };
        if (pageResource?.type) body.resourceType = pageResource.type;
        if (pageResource?.id) body.resourceId = pageResource.id;
        const resp = await request<PeekResponse>("/agent/proactive/peek", {
          method: "POST",
          body: JSON.stringify(body),
        });
        if (resp.suggestion) {
          setSuggestion(resp.suggestion);
          setMode("suggestion");
          setCollapsedByUser(false);
          // Auto-open the bubble once per suggestion. If the user has
          // explicitly collapsed it, we leave it as a pulsing button.
          setOpen(true);
          clearAutoCollapse();
          autoCollapseTimer.current = window.setTimeout(() => {
            // After N seconds of no interaction, collapse back into a dot.
            setOpen(false);
          }, AUTO_COLLAPSE_MS);
        } else {
          setSuggestion(null);
          setMode("compose");
        }
      } catch (err) {
        // Silent — proactive is best-effort, never block.
        if (typeof console !== "undefined") {
          console.debug("[FloatingAgent] peek failed", err);
        }
      }
    }, PEEK_DEBOUNCE_MS);

    return clearPeekTimer;
  }, [pathname, pageResource?.type, pageResource?.id, hidden]);

  // Kill timers on unmount.
  useEffect(
    () => () => {
      clearPeekTimer();
      clearAutoCollapse();
    },
    [],
  );

  if (hidden) return null;

  /* ---------- Actions ---------- */

  const submitFreeform = () => {
    const q = value.trim();
    const url = q ? `/consult?prefill=${encodeURIComponent(q)}` : "/consult";
    setOpen(false);
    setValue("");
    router.push(url);
  };

  const onExecute = useCallback(
    async (action: ProactiveAction) => {
      if (!suggestion) return;
      clearAutoCollapse();
      setExecuting(action.id);
      try {
        if (action.kind === "navigate" && action.params?.href) {
          // Record server-side (mark suggestion accepted) then navigate.
          try {
            await request<ExecuteResponse>("/agent/proactive/execute", {
              method: "POST",
              body: JSON.stringify({
                suggestionId: suggestion.id,
                actionId: action.id,
              }),
            });
          } catch {
            // Navigation should work even if the bookkeeping call failed.
          }
          setOpen(false);
          router.push(String(action.params.href));
          return;
        }

        const resp = await request<ExecuteResponse>(
          "/agent/proactive/execute",
          {
            method: "POST",
            body: JSON.stringify({
              suggestionId: suggestion.id,
              actionId: action.id,
            }),
          },
        );
        if (!resp.ok) {
          return;
        }
        // If the tool result includes a detail_url, jump there. Otherwise
        // just mark the suggestion as executed locally.
        if (resp.kind === "tool") {
          const detailUrl = (resp.result as Record<string, unknown>)
            ?.detail_url;
          if (typeof detailUrl === "string" && detailUrl) {
            setOpen(false);
            router.push(detailUrl);
            return;
          }
        }
        setSuggestion(resp.suggestion);
      } finally {
        setExecuting(null);
      }
    },
    [router, suggestion],
  );

  const onDismiss = useCallback(
    async (scope: "once" | "today" | "rule_forever") => {
      if (!suggestion) return;
      try {
        await request("/agent/proactive/dismiss", {
          method: "POST",
          body: JSON.stringify({ suggestionId: suggestion.id, scope }),
        });
      } catch {
        // best effort
      }
      setSuggestion(null);
      setMenuOpen(false);
      setOpen(false);
      setCollapsedByUser(true);
      setMode("compose");
    },
    [suggestion],
  );

  const onFeedback = useCallback(
    async (feedback: "up" | "down") => {
      if (!suggestion) return;
      try {
        await request("/agent/proactive/feedback", {
          method: "POST",
          body: JSON.stringify({ suggestionId: suggestion.id, feedback }),
        });
        setSuggestion({ ...suggestion, feedback });
      } catch {
        // best effort
      }
    },
    [suggestion],
  );

  const toggleOpen = () => {
    clearAutoCollapse();
    setOpen((v) => !v);
    // When reopening on a live suggestion, keep that view.
    if (!open && suggestion) {
      setMode("suggestion");
    }
  };

  const hasSuggestion = !!suggestion;
  const primaryAction = suggestion?.actions.find((a) => a.kind === "primary");
  const otherActions = suggestion?.actions.filter((a) => a.kind !== "primary") ?? [];

  /* ---------- Render ---------- */

  return (
    <div className="fixed bottom-6 right-6 z-[800] flex flex-col items-end gap-3">
      {open && (
        <div
          className="w-[340px] rounded-xl border border-border bg-surface shadow-xl overflow-hidden"
          onMouseEnter={clearAutoCollapse}
        >
          <div className="relative flex items-center gap-2 border-b border-border bg-surface-elevated px-4 py-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-600 text-[11px] font-semibold text-text-inverse">
              A1
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-text-primary">
                {hasSuggestion && mode === "suggestion"
                  ? "AI 观察到一条可推进的事"
                  : "A1+ 法务大脑"}
              </div>
              <div className="text-[11px] text-text-tertiary truncate">
                {hasSuggestion && mode === "suggestion"
                  ? suggestion.sourceMode === "llm"
                    ? "基于你的实时状态生成"
                    : "基于规则的静态提醒"
                  : "需求画像 · 智能匹配 · 在线咨询"}
              </div>
            </div>
            {hasSuggestion && mode === "suggestion" && (
              <div className="relative">
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="rounded-md p-1 text-text-tertiary hover:bg-surface hover:text-text-primary"
                  aria-label="降噪菜单"
                >
                  <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor">
                    <circle cx="3" cy="8" r="1.2" />
                    <circle cx="8" cy="8" r="1.2" />
                    <circle cx="13" cy="8" r="1.2" />
                  </svg>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-8 z-10 w-40 rounded-md border border-border bg-surface shadow-lg">
                    <button
                      onClick={() => onDismiss("today")}
                      className="block w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-surface-elevated"
                    >
                      今天别再提醒
                    </button>
                    <button
                      onClick={() => onDismiss("rule_forever")}
                      className="block w-full px-3 py-2 text-left text-xs text-text-secondary hover:bg-surface-elevated"
                    >
                      这个场景永远别提
                    </button>
                  </div>
                )}
              </div>
            )}
            <button
              onClick={() => {
                setOpen(false);
                setMenuOpen(false);
                setCollapsedByUser(true);
              }}
              className="text-text-tertiary hover:text-text-primary"
              aria-label="关闭"
            >
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          {hasSuggestion && mode === "suggestion" ? (
            <div className="p-4 space-y-3">
              <div className="text-sm font-semibold text-text-primary leading-relaxed">
                {suggestion.title}
              </div>
              {suggestion.body && (
                <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
                  {suggestion.body}
                </div>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {primaryAction && (
                  <button
                    key={primaryAction.id}
                    disabled={executing != null}
                    onClick={() => onExecute(primaryAction)}
                    className={cn(
                      "rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-700",
                      executing === primaryAction.id && "opacity-60",
                    )}
                  >
                    {executing === primaryAction.id ? "执行中…" : primaryAction.label}
                  </button>
                )}
                {otherActions.map((a) => (
                  <button
                    key={a.id}
                    disabled={executing != null}
                    onClick={() => onExecute(a)}
                    className={cn(
                      "rounded-md border border-border bg-surface-elevated px-3 py-1.5 text-xs text-text-secondary hover:border-primary-500 hover:text-primary-600",
                      executing === a.id && "opacity-60",
                    )}
                  >
                    {executing === a.id ? "执行中…" : a.label}
                  </button>
                ))}
                <button
                  onClick={() => onDismiss("once")}
                  className="rounded-md px-3 py-1.5 text-xs text-text-tertiary hover:text-text-primary"
                >
                  稍后
                </button>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
                  <span>这条建议有用吗？</span>
                  <button
                    onClick={() => onFeedback("up")}
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-sm hover:bg-surface-elevated",
                      suggestion.feedback === "up" && "bg-success-50 text-success-600",
                    )}
                    aria-label="有用"
                  >
                    👍
                  </button>
                  <button
                    onClick={() => onFeedback("down")}
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-sm hover:bg-surface-elevated",
                      suggestion.feedback === "down" && "bg-error-50 text-error-600",
                    )}
                    aria-label="没用"
                  >
                    👎
                  </button>
                </div>
                <button
                  onClick={() => setMode("compose")}
                  className="text-[11px] text-text-tertiary hover:text-primary-600"
                >
                  自己输入 →
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3">
              <textarea
                className="w-full min-h-[84px] resize-none rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary-500 focus:outline-none"
                placeholder="用一句话描述你的需求，例如：做跨境电商，刚起了产品名字，想尽快注册商标..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitFreeform();
                  }
                }}
              />
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-text-tertiary">Enter 发送 · Shift+Enter 换行</span>
                <button
                  onClick={submitFreeform}
                  className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-700"
                >
                  唤醒 AI
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {QUICK_STARTERS.map((q) => (
                  <button
                    key={q}
                    onClick={() => setValue(q)}
                    className="rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-[11px] text-text-secondary hover:border-primary-500 hover:text-primary-600"
                  >
                    {q}
                  </button>
                ))}
              </div>
              {hasSuggestion && (
                <button
                  onClick={() => setMode("suggestion")}
                  className="mt-3 block text-[11px] text-primary-600 hover:underline"
                >
                  ← 回到 AI 主动建议
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <button
        onClick={toggleOpen}
        className={cn(
          "relative flex h-12 w-12 items-center justify-center rounded-full bg-primary-600 text-text-inverse shadow-xl transition-transform hover:scale-105",
          hasSuggestion && !collapsedByUser && !open && "animate-pulse",
        )}
        aria-label={hasSuggestion ? "AI 有新建议" : "打开 AI 法务大脑"}
        title={hasSuggestion ? suggestion.title : "打开 AI 法务大脑"}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3a7 7 0 0 1 7 7v3l1.5 2.5a1 1 0 0 1-.9 1.5H4.4a1 1 0 0 1-.9-1.5L5 13v-3a7 7 0 0 1 7-7z" />
          <path strokeLinecap="round" d="M9 19a3 3 0 0 0 6 0" />
        </svg>
        {hasSuggestion && !open && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error-500 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-error-500" />
          </span>
        )}
      </button>
    </div>
  );
}

const QUICK_STARTERS = [
  "帮我找律师",
  "商标被驳回怎么办",
  "合同帮我把关",
  "做一次合规体检",
];
