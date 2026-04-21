"use client";

/**
 * DailyBriefingCard — Dashboard 首页的「AI 每日简报」卡。
 *
 * 复用后端 `dashboard.daily_briefing` 主动规则：调一次
 * `/agent/proactive/peek`（route=/dashboard），如果命中就把 LLM 生成的
 * title / body / 主动作按钮就地渲染在卡片里，让用户不用依赖浮窗也能看到。
 *
 * 与 FloatingAgent 共享同一条规则的 24h 冷却——冷却期内 peek 返回 null，
 * 卡片就静默不渲染，避免重复打扰。
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@a1plus/ui";
import { request } from "@/components/workspace/shared";

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
};

type PeekResponse = { suggestion: ProactiveSuggestion | null };
type ExecuteResponse =
  | { ok: true; kind: "navigate"; href?: string; suggestion: ProactiveSuggestion }
  | { ok: true; kind: "tool"; tool: string; result: Record<string, unknown>; suggestion: ProactiveSuggestion }
  | { ok: false; error: string };

export function DailyBriefingCard() {
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<ProactiveSuggestion | null>(null);
  const [executing, setExecuting] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    (async () => {
      try {
        const resp = await request<PeekResponse>("/agent/proactive/peek", {
          method: "POST",
          body: JSON.stringify({ route: "/dashboard" }),
        });
        if (resp.suggestion && resp.suggestion.ruleKey === "dashboard.daily_briefing") {
          setSuggestion(resp.suggestion);
        }
      } catch {
        // best-effort — briefing is optional
      }
    })();
  }, []);

  if (!suggestion || dismissed) return null;

  const primary = suggestion.actions.find((a) => a.kind === "primary");
  const others = suggestion.actions.filter((a) => a.kind !== "primary");

  const onExecute = async (action: ProactiveAction) => {
    setExecuting(action.id);
    try {
      if (action.kind === "navigate" && action.params?.href) {
        try {
          await request<ExecuteResponse>("/agent/proactive/execute", {
            method: "POST",
            body: JSON.stringify({ suggestionId: suggestion.id, actionId: action.id }),
          });
        } catch {
          /* ignore */
        }
        router.push(String(action.params.href));
        return;
      }
      const resp = await request<ExecuteResponse>("/agent/proactive/execute", {
        method: "POST",
        body: JSON.stringify({ suggestionId: suggestion.id, actionId: action.id }),
      });
      if (resp.ok && resp.kind === "tool") {
        const detail = (resp.result as Record<string, unknown>)?.detail_url;
        if (typeof detail === "string" && detail) {
          router.push(detail);
          return;
        }
        setSuggestion(resp.suggestion);
      } else if (resp.ok) {
        setSuggestion(resp.suggestion);
      }
    } finally {
      setExecuting(null);
    }
  };

  const onDismiss = async () => {
    try {
      await request("/agent/proactive/dismiss", {
        method: "POST",
        body: JSON.stringify({ suggestionId: suggestion.id, scope: "today" }),
      });
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const onFeedback = async (feedback: "up" | "down") => {
    try {
      await request("/agent/proactive/feedback", {
        method: "POST",
        body: JSON.stringify({ suggestionId: suggestion.id, feedback }),
      });
      setSuggestion({ ...suggestion, feedback });
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="rounded-lg border border-primary-500/30 bg-primary-50/40 p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600 text-[11px] font-semibold text-text-inverse">
          AI
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-primary-600">
              每日简报
            </span>
            <span className="text-[11px] text-text-tertiary">
              {suggestion.sourceMode === "llm" ? "LLM 生成" : "规则模板"}
            </span>
          </div>
          <h3 className="mt-1 text-base font-semibold text-text-primary leading-snug">
            {suggestion.title}
          </h3>
          {suggestion.body && (
            <p className="mt-2 text-sm text-text-secondary leading-relaxed whitespace-pre-line">
              {suggestion.body}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {primary && (
              <button
                onClick={() => onExecute(primary)}
                disabled={executing != null}
                className={cn(
                  "rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-700",
                  executing === primary.id && "opacity-60",
                )}
              >
                {executing === primary.id ? "执行中…" : primary.label}
              </button>
            )}
            {others.map((a) => (
              <button
                key={a.id}
                onClick={() => onExecute(a)}
                disabled={executing != null}
                className={cn(
                  "rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:border-primary-500 hover:text-primary-600",
                  executing === a.id && "opacity-60",
                )}
              >
                {executing === a.id ? "执行中…" : a.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 text-[11px] text-text-tertiary">
              <button
                onClick={() => onFeedback("up")}
                className={cn(
                  "rounded-md px-1.5 py-0.5 hover:bg-surface",
                  suggestion.feedback === "up" && "bg-success-50 text-success-600",
                )}
                aria-label="有用"
              >
                👍
              </button>
              <button
                onClick={() => onFeedback("down")}
                className={cn(
                  "rounded-md px-1.5 py-0.5 hover:bg-surface",
                  suggestion.feedback === "down" && "bg-error-50 text-error-600",
                )}
                aria-label="没用"
              >
                👎
              </button>
              <button
                onClick={onDismiss}
                className="rounded-md px-2 py-0.5 hover:text-text-primary"
              >
                今天别提
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
