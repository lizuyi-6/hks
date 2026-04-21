"use client";

/**
 * ConsultPanel — C 端 AI 法务咨询主入口。
 * 用户把需求告诉 AI → 生成「需求指纹」→ 匹配 Top 3 律师/代理 → 发起咨询或请求报价。
 * 这是「AI 法务操作系统」的核心落地页，覆盖「智能咨询 + 需求画像 + 智能匹配」三条赛道关键词。
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@a1plus/ui";
import {
  PageHeader,
  SectionHeader,
  EmptyHero,
  StatTile,
  SeverityPill,
  IconGlyph,
  type Accent,
} from "./primitives";
import { ErrorDisplay, request } from "./shared";
import { DonutRing } from "@/components/viz";
import { ApplicationError } from "@/lib/errors";
import { fetchSSE } from "@/lib/sse";
import { proxyBaseUrl } from "@/lib/env";

type Provider = {
  id: string;
  name: string;
  providerType: string;
  shortIntro?: string | null;
  regions: string[];
  practiceAreas: string[];
  featuredTags: string[];
  ratingAvg: number;
  ordersCount: number;
  responseSlaMinutes: number;
  hourlyRateRange?: string | null;
};

type Product = {
  id: string;
  providerId: string;
  category: string;
  name: string;
  summary?: string | null;
  price?: number | null;
  priceMode: string;
  deliveryDays?: number | null;
};

type Candidate = {
  candidate_id: string;
  rank: number;
  score: number;
  reasons: string[];
  provider: Provider;
  product: Product | null;
};

type Fingerprint = {
  intentCategory: string;
  urgency: string;
  budget: string | null;
  region: string | null;
  tags: string[];
  rawQuery: string;
};

type MatchingResponse = {
  requestId: string;
  fingerprint: Fingerprint;
  candidates: Candidate[];
  disclaimer: string;
};

type ConsultationItem = {
  id: string;
  topic: string;
  status: string;
  channel: string;
  aiConfidence: number;
  handoffReason: string | null;
  aiHandoffAt: string | null;
  acceptedAt: string | null;
  closedAt: string | null;
  rating: number | null;
  transcript: Array<{ role: string; content: string; at?: string }>;
  provider: { id: string; name: string; rating_avg?: number } | null;
  createdAt: string;
};

const CONSULT_STATUS_LABEL: Record<string, string> = {
  ai_active: "AI 首诊中",
  awaiting_provider: "等待律师接单",
  provider_assigned: "律师已接入",
  closed: "已结束",
};

const SUGGESTIONS = [
  "做跨境电商，刚给产品起了名字，想尽快注册商标。",
  "合作方发来 SaaS 合同，想请律师把 IP 归属条款过一遍。",
  "公司想申请发明专利，还没写过专利文档，需要代理人。",
  "竞品在用跟我们近似的商标，想发律师函维权。",
  "B 轮融资快到了，要做一轮 IP 尽调。",
];

const URGENCY_LABEL: Record<string, string> = {
  urgent: "紧急",
  normal: "常规",
  low: "不急",
};

const INTENT_LABEL: Record<string, string> = {
  trademark: "商标",
  patent: "专利",
  copyright: "版权",
  contract: "合同",
  litigation: "诉讼/维权",
  due_diligence: "尽调",
  compliance: "合规",
  general: "综合咨询",
};

const INTENT_ACCENT: Record<string, Accent> = {
  trademark: "primary",
  patent: "info",
  copyright: "info",
  contract: "success",
  litigation: "error",
  due_diligence: "warning",
  compliance: "warning",
  general: "muted",
};

export function ConsultPanel() {
  return (
    <Suspense fallback={null}>
      <ConsultInner />
    </Suspense>
  );
}

function ConsultInner() {
  const router = useRouter();
  const params = useSearchParams();
  const prefill = params.get("prefill") ?? "";

  const [query, setQuery] = useState(prefill);
  const [region, setRegion] = useState("");
  const [urgency, setUrgency] = useState<"urgent" | "normal" | "low" | "">("");
  const [budget, setBudget] = useState("");
  const [result, setResult] = useState<MatchingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | ApplicationError | null>(null);

  useEffect(() => {
    if (prefill && !query) setQuery(prefill);
  }, [prefill, query]);

  const autoSubmitted = useMemo(() => Boolean(prefill), [prefill]);

  const run = useCallback(async () => {
    if (!query.trim()) {
      setError("请先描述一下你的需求。");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await request<MatchingResponse>("/matching/run", {
        method: "POST",
        body: JSON.stringify({
          raw_query: query,
          region: region || undefined,
          urgency: urgency || undefined,
          budget: budget || undefined,
          limit: 3,
        }),
      });
      setResult(res);
    } catch (e) {
      if (e instanceof ApplicationError) setError(e);
      else setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [query, region, urgency, budget]);

  useEffect(() => {
    if (autoSubmitted && !result && !loading && prefill) {
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubmitted, prefill]);

  const startConsultation = async (candidate: Candidate) => {
    try {
      await request("/consultations", {
        method: "POST",
        body: JSON.stringify({
          topic: result?.fingerprint.rawQuery ?? query,
          provider_id: candidate.provider.id,
        }),
      });
      router.push("/orders");
    } catch (e) {
      if (e instanceof ApplicationError) setError(e);
      else setError(String(e));
    }
  };

  const requestQuote = async (candidate: Candidate) => {
    if (!result?.requestId) return;
    try {
      await request("/orders", {
        method: "POST",
        body: JSON.stringify({
          providerId: candidate.provider.id,
          matchingRequestId: result.requestId,
        }),
      });
      router.push("/orders");
    } catch (e) {
      if (e instanceof ApplicationError) setError(e);
      else setError(String(e));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI 法务操作系统"
        title="告诉 AI 你的需求"
        icon="sparkle"
        accent="primary"
        description="AI 会先出具一张「需求指纹」，再给你匹配 Top 3 的律师或代理，全程可追溯。"
      />

      {/* ===== AI Chat (Multi-tool Agent) ===== */}
      <ConsultChat
        onPushToMatching={(text) => {
          setQuery(text);
        }}
      />

      {/* ===== Intake Card ===== */}
      <section className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <textarea
          className="w-full min-h-[140px] resize-y rounded-md border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary-500 focus:outline-none"
          placeholder="示例：做跨境电商，刚给产品起了名字，想尽快注册商标，预算 5000~20000，发货仓在上海..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LabeledSelect
            label="紧急程度"
            value={urgency}
            onChange={(v) => setUrgency(v as "urgent" | "normal" | "low" | "")}
            options={[
              { value: "", label: "AI 自动判断" },
              { value: "urgent", label: "紧急 (7 天内)" },
              { value: "normal", label: "常规 (1 个月内)" },
              { value: "low", label: "不急" },
            ]}
          />
          <LabeledInput
            label="期望预算"
            placeholder="如 5000-20000"
            value={budget}
            onChange={setBudget}
          />
          <LabeledInput
            label="所在地区"
            placeholder="如 上海 / 全国"
            value={region}
            onChange={setRegion}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setQuery(s)}
                className="rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-[11px] text-text-secondary hover:border-primary-500 hover:text-primary-600"
              >
                {s.length > 20 ? s.slice(0, 20) + "…" : s}
              </button>
            ))}
          </div>
          <button
            onClick={run}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary-600 px-5 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border border-text-inverse border-t-transparent" />
                AI 匹配中…
              </>
            ) : (
              <>
                <IconGlyph name="sparkle" size={14} />
                唤醒 AI 法务大脑
              </>
            )}
          </button>
        </div>
      </section>

      {error && <ErrorDisplay error={error} />}

      {/* ===== Fingerprint + Candidates ===== */}
      {result && (
        <>
          <FingerprintCard fp={result.fingerprint} />

          <section className="space-y-3">
            <SectionHeader
              eyebrow="TOP 3 MATCH"
              title="我为你找到的专业服务者"
              description="命中语义检索 + 律师擅长领域 + 地区 + 历史评分，点击卡片查看更多。"
              actions={
                <Link
                  href={`/match`}
                  className="text-xs text-primary-600 hover:underline"
                >
                  查看全部匹配历史 →
                </Link>
              }
            />
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {result.candidates.map((c) => (
                <CandidateCard
                  key={c.candidate_id}
                  candidate={c}
                  onConsult={() => startConsultation(c)}
                  onQuote={() => requestQuote(c)}
                />
              ))}
            </div>
            <p className="text-[11px] text-text-tertiary">{result.disclaimer}</p>
          </section>
        </>
      )}

      {!result && !loading && !error && (
        <EmptyHero
          icon="target"
          title="还没有匹配记录"
          description="把你的需求告诉 AI，它会基于你的画像 + 历史行为 + 律师擅长领域做一次智能匹配。"
          accent="primary"
        />
      )}

      <RecentConsultations />
    </div>
  );
}

type ChatTurn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions: Array<{
    action: string;
    label?: string;
    params?: Record<string, unknown>;
    result?: Record<string, unknown>;
    error?: boolean;
  }>;
  followUp?: string[];
  streaming?: boolean;
  handoff?: {
    consultation_id?: string;
    reason?: string;
    detail_url?: string;
  };
};

function ConsultChat({
  onPushToMatching,
}: {
  onPushToMatching: (text: string) => void;
}) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  // Refs so the ``send`` callback doesn't rebuild on every token: reading
  // ``turnsRef.current`` gives us the latest history without adding
  // ``turns`` to the deps array, and ``controllerRef`` lets the unmount
  // cleanup cancel an in-flight stream.
  const turnsRef = useRef<ChatTurn[]>([]);
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  const send = useCallback(async () => {
    const message = input.trim();
    if (!message || streaming) return;

    const turnId = `turn-${Date.now()}`;
    const userTurn: ChatTurn = {
      id: `${turnId}-u`,
      role: "user",
      content: message,
      actions: [],
    };
    const assistantTurn: ChatTurn = {
      id: `${turnId}-a`,
      role: "assistant",
      content: "",
      actions: [],
      streaming: true,
    };
    const history = turnsRef.current
      .flatMap((t) =>
        t.role === "user"
          ? [{ role: "user" as const, content: t.content }]
          : t.content
            ? [{ role: "assistant" as const, content: t.content }]
            : ([] as { role: "user" | "assistant"; content: string }[]),
      );

    setTurns((prev) => [...prev, userTurn, assistantTurn]);
    setInput("");
    setStreaming(true);
    setChatError(null);

    // Abort any previous in-flight stream before starting a new one.
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      await fetchSSE(`${proxyBaseUrl}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history, context: {} }),
        signal: controller.signal,
      }, {
        onToken: (token) => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === assistantTurn.id
                ? { ...t, content: t.content + token }
                : t,
            ),
          );
        },
        onActionStart: (payload) => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === assistantTurn.id
                ? {
                    ...t,
                    actions: [
                      ...t.actions,
                      {
                        action: payload.action,
                        label: payload.label,
                        params: payload.params,
                      },
                    ],
                  }
                : t,
            ),
          );
        },
        onActionResult: (payload) => {
          setTurns((prev) =>
            prev.map((t) => {
              if (t.id !== assistantTurn.id) return t;
              const actions = [...t.actions];
              const idx = actions.findIndex(
                (a) => a.action === payload.action && !a.result && !a.error,
              );
              if (idx >= 0) {
                actions[idx] = {
                  ...actions[idx],
                  result: payload,
                  error: Boolean(payload.error),
                };
              } else {
                actions.push({
                  action: String(payload.action ?? "tool"),
                  result: payload,
                  error: Boolean(payload.error),
                });
              }
              return { ...t, actions };
            }),
          );
        },
        onDone: (payload) => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === assistantTurn.id
                ? { ...t, streaming: false, followUp: payload.followUp }
                : t,
            ),
          );
        },
        onHandoff: (payload) => {
          setTurns((prev) =>
            prev.map((t) =>
              t.id === assistantTurn.id
                ? {
                    ...t,
                    handoff: {
                      consultation_id: payload.consultation_id,
                      reason: payload.reason,
                      detail_url: payload.detail_url,
                    },
                  }
                : t,
            ),
          );
        },
        onError: (err) => {
          setChatError(err);
          setTurns((prev) =>
            prev.map((t) =>
              t.id === assistantTurn.id ? { ...t, streaming: false } : t,
            ),
          );
        },
      });
    } catch (err) {
      if (!controller.signal.aborted && mountedRef.current) {
        setChatError(String(err));
      }
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      if (mountedRef.current) {
        setStreaming(false);
        setTurns((prev) =>
          prev.map((t) =>
            t.id === assistantTurn.id ? { ...t, streaming: false } : t,
          ),
        );
      }
    }
  }, [input, streaming]);

  if (turns.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <SectionHeader
              eyebrow="AI Agent"
              title="先跟 AI 聊两句"
              description="AI 会自动调用商标查重、合同审查、匹配律师、启动咨询等工具，全程可追溯。"
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-[11px] text-text-secondary hover:border-primary-500 hover:text-primary-600"
                >
                  {s.length > 22 ? s.slice(0, 22) + "…" : s}
                </button>
              ))}
            </div>
          </div>
        </div>
        <ChatComposer
          value={input}
          onChange={setInput}
          onSend={send}
          streaming={streaming}
        />
        {chatError && (
          <p className="mt-2 text-[11px] text-error-600">{chatError}</p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-5 space-y-4">
      <SectionHeader
        eyebrow="AI Agent"
        title="AI 正在调用工具回答你"
        description="左侧对话，右侧是 AI 自动调用过的工具、返回的结构化结果。"
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {turns.map((t) => (
            <ChatBubble key={t.id} turn={t} />
          ))}
        </div>
        <aside className="space-y-2">
          <div className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
            工具调用
          </div>
          {turns.flatMap((t) => t.actions).length === 0 ? (
            <p className="text-xs text-text-tertiary">还没有调用工具。</p>
          ) : (
            turns.flatMap((t) => t.actions).map((a, i) => (
              <ActionCard
                key={`${a.action}-${i}`}
                action={a}
                onPushToMatching={onPushToMatching}
              />
            ))
          )}
        </aside>
      </div>
      <ChatComposer
        value={input}
        onChange={setInput}
        onSend={send}
        streaming={streaming}
      />
      {chatError && (
        <p className="text-[11px] text-error-600">{chatError}</p>
      )}
    </section>
  );
}

function ChatComposer({
  value,
  onChange,
  onSend,
  streaming,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  streaming: boolean;
}) {
  return (
    <div className="mt-3 flex items-end gap-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder="直接提问，例如：我想给跨境电商品牌注册商标，怎么下手？"
        className="flex-1 min-h-[64px] resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary-500 focus:outline-none"
      />
      <button
        onClick={onSend}
        disabled={streaming || !value.trim()}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse hover:bg-primary-700 disabled:opacity-60"
      >
        <IconGlyph name="sparkle" size={14} />
        {streaming ? "思考中…" : "发送"}
      </button>
    </div>
  );
}

function ChatBubble({ turn }: { turn: ChatTurn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-lg bg-primary-600 px-3 py-2 text-sm text-text-inverse whitespace-pre-wrap">
          {turn.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary">
        <div className="whitespace-pre-wrap">
          {turn.content || (turn.streaming ? "…" : "")}
          {turn.streaming && (
            <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-primary-500 align-middle" />
          )}
        </div>
        {turn.handoff && (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-warning-100 bg-warning-50 px-2 py-1.5 text-[11px] text-warning-800">
            <IconGlyph name="alert" size={12} className="mt-0.5" />
            <div className="flex-1">
              <div>AI 置信度偏低，已为你开启一条律师咨询会话。</div>
              {turn.handoff.reason && (
                <div className="text-warning-700">原因：{turn.handoff.reason}</div>
              )}
            </div>
            {turn.handoff.detail_url && (
              <Link
                href={turn.handoff.detail_url}
                className="rounded-md bg-warning-600 px-2 py-0.5 font-medium text-white hover:bg-warning-700"
              >
                查看会话
              </Link>
            )}
          </div>
        )}
        {turn.followUp && turn.followUp.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {turn.followUp.map((q) => (
              <span
                key={q}
                className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-text-secondary"
              >
                {q}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const ACTION_ICON: Record<string, string> = {
  trademark_check: "digital",
  ip_diagnosis: "sparkle",
  list_assets: "assets",
  generate_application: "contracts",
  contract_review: "contracts",
  patent_assess: "sparkle",
  policy_digest: "bell",
  find_lawyer: "user",
  request_quote: "contracts",
  start_consultation: "chat",
  compliance_scan: "shield",
  predict_litigation: "alert",
};

function ActionCard({
  action,
  onPushToMatching,
}: {
  action: ChatTurn["actions"][number];
  onPushToMatching: (text: string) => void;
}) {
  const { action: actionName, label, params, result, error } = action;
  const done = Boolean(result);
  const r = result ?? {};
  const iconName = (ACTION_ICON[actionName] ?? "sparkle") as Parameters<
    typeof IconGlyph
  >[0]["name"];

  const paramsSummary = params ? formatParams(actionName, params) : null;

  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs ${
        error
          ? "border-error-100 bg-error-50 text-error-700"
          : done
            ? "border-success-100 bg-success-50 text-success-700"
            : "border-border bg-surface-elevated text-text-secondary"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <IconGlyph name={iconName} size={12} />
        <span className="font-medium">{label ?? actionName}</span>
        {!done && !error && (
          <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-primary-500" />
        )}
        {error && <span className="ml-auto">失败</span>}
        {done && !error && <span className="ml-auto">完成</span>}
      </div>
      {paramsSummary && (
        <div className="mt-1 line-clamp-2 text-[11px] text-text-tertiary">
          {paramsSummary}
        </div>
      )}
      {error && typeof r.error === "string" && r.error && (
        <div className="mt-1 text-[11px]">{r.error}</div>
      )}
      {done && !error && (
        <ActionResultPreview
          action={actionName}
          result={r}
          params={params}
          onPushToMatching={onPushToMatching}
        />
      )}
    </div>
  );
}

function formatParams(
  action: string,
  params: Record<string, unknown>,
): string | null {
  // Short, human-readable summary of the inputs so users can see what the AI
  // is actually asking the tool to do.
  const pick = (k: string) =>
    typeof params[k] === "string" ? (params[k] as string) : "";
  switch (action) {
    case "trademark_check":
      return `商标：${pick("trademark_name")}`;
    case "ip_diagnosis":
      return `诊断：${pick("business_name") || pick("business_description").slice(0, 20)}`;
    case "generate_application":
      return `生成申请书：${pick("trademark_name")}`;
    case "contract_review":
      return `合同节选：${pick("contract_text").slice(0, 40)}…`;
    case "patent_assess":
      return `技术描述：${pick("description").slice(0, 40)}…`;
    case "policy_digest":
      return `行业：${pick("industry") || "通用"}`;
    case "find_lawyer":
      return `查询：${pick("raw_query") || pick("topic")}`;
    case "request_quote":
      return pick("topic")
        ? `议题：${pick("topic")}`
        : null;
    case "start_consultation":
      return `话题：${pick("topic")}`;
    case "compliance_scan":
      return params["profile_id"] ? `档案：${String(params["profile_id"])}` : null;
    case "predict_litigation":
      return `案由：${pick("case_type") || "合同"}`;
    default: {
      const keys = Object.keys(params);
      if (keys.length === 0) return null;
      return keys.slice(0, 3).map((k) => `${k}: ${String(params[k])}`).join(" · ");
    }
  }
}

function ActionResultPreview({
  action,
  result,
  onPushToMatching,
}: {
  action: string;
  result: Record<string, unknown>;
  params?: Record<string, unknown>;
  onPushToMatching: (text: string) => void;
}) {
  if (action === "find_lawyer") {
    const matched = Number(result.matched ?? 0);
    const detailUrl = String(result.detail_url ?? "/match");
    const candidates = Array.isArray(result.candidates)
      ? (result.candidates as Array<{ name?: string; score?: number }>)
      : [];
    return (
      <div className="mt-1 space-y-0.5 text-[11px]">
        <div>命中 {matched} 位律师。</div>
        {candidates.slice(0, 3).map((c, i) => (
          <div key={i} className="truncate">
            · {c.name} ({(c.score ?? 0).toFixed?.(2) ?? c.score})
          </div>
        ))}
        <Link href={detailUrl} className="mt-1 inline-block text-primary-600 hover:underline">
          查看全部 →
        </Link>
      </div>
    );
  }
  if (action === "request_quote") {
    return (
      <div className="mt-1 text-[11px]">
        订单 {String(result.order_no ?? "")} 已创建 ·{" "}
        <Link href="/orders" className="text-primary-600 hover:underline">
          去委托列表
        </Link>
      </div>
    );
  }
  if (action === "start_consultation") {
    const handoff =
      (result.handoff as { status?: string; reason?: string } | undefined) ?? {};
    return (
      <div className="mt-1 text-[11px]">
        咨询状态：{handoff.status ?? String(result.status ?? "ai_active")}
        {handoff.reason ? ` · ${handoff.reason}` : null}
      </div>
    );
  }
  if (action === "trademark_check") {
    return (
      <div className="mt-1 text-[11px]">
        风险等级 {String(result.risk_level ?? "-")} · {String(result.summary ?? "")}
      </div>
    );
  }
  if (action === "predict_litigation") {
    const win = Number(result.win_probability ?? 0);
    return (
      <div className="mt-1 text-[11px]">
        胜诉概率 {(win * 100).toFixed(0)}% · {String(result.headline ?? "")}
      </div>
    );
  }
  if (action === "compliance_scan") {
    return (
      <div className="mt-1 text-[11px]">
        分数 {String(result.score ?? "-")} · 风险项 {String(result.findings_count ?? 0)}
      </div>
    );
  }
  if (action === "ip_diagnosis") {
    const priorities = Array.isArray(result.priority_assets)
      ? (result.priority_assets as Array<string | { name?: string }>)
      : [];
    const risks = Array.isArray(result.risks) ? result.risks : [];
    return (
      <div className="mt-1 space-y-0.5 text-[11px]">
        <div className="line-clamp-2">{String(result.summary ?? "")}</div>
        {priorities.length > 0 && (
          <div>
            优先保护：
            {priorities.slice(0, 3).map((p, i) => (
              <span key={i} className="ml-1">
                {typeof p === "string" ? p : (p.name ?? "-")}
                {i < Math.min(priorities.length, 3) - 1 ? "、" : ""}
              </span>
            ))}
          </div>
        )}
        {risks.length > 0 && <div>风险点 {risks.length} 条</div>}
        <Link href="/diagnosis" className="mt-1 inline-block text-primary-600 hover:underline">
          打开诊断工作台 →
        </Link>
      </div>
    );
  }
  if (action === "list_assets") {
    const total = Number(result.total ?? 0);
    const assets = Array.isArray(result.assets)
      ? (result.assets as Array<{ name?: string; type?: string; status?: string }>)
      : [];
    if (total === 0) {
      return (
        <div className="mt-1 text-[11px]">
          尚未录入 IP 资产。
          <Link href="/assets" className="ml-1 text-primary-600 hover:underline">
            去登记 →
          </Link>
        </div>
      );
    }
    return (
      <div className="mt-1 space-y-0.5 text-[11px]">
        <div>共 {total} 项资产：</div>
        {assets.slice(0, 3).map((a, i) => (
          <div key={i} className="truncate">
            · {a.name ?? "-"}（{a.type ?? "-"} · {a.status ?? "-"}）
          </div>
        ))}
        <Link href="/assets" className="mt-1 inline-block text-primary-600 hover:underline">
          查看台账 →
        </Link>
      </div>
    );
  }
  if (action === "generate_application") {
    const jobId = String(result.job_id ?? "");
    return (
      <div className="mt-1 text-[11px]">
        申请书生成任务 {String(result.status ?? "")}
        {jobId && (
          <Link
            href={`/trademark/check?jobId=${encodeURIComponent(jobId)}`}
            className="ml-2 text-primary-600 hover:underline"
          >
            下载稿件 →
          </Link>
        )}
      </div>
    );
  }
  if (action === "contract_review") {
    return (
      <div className="mt-1 text-[11px]">
        <div className="line-clamp-2">{String(result.summary ?? "")}</div>
        <div>风险条款 {String(result.risks_count ?? 0)} 条</div>
        <Link href="/contracts" className="mt-1 inline-block text-primary-600 hover:underline">
          打开合同中心 →
        </Link>
      </div>
    );
  }
  if (action === "patent_assess") {
    const score = Number(result.score ?? result.patentability ?? 0);
    return (
      <div className="mt-1 text-[11px]">
        专利可行性 {(score * 100).toFixed(0)}% ·{" "}
        {String(result.recommendation ?? result.summary ?? "")}
      </div>
    );
  }
  if (action === "policy_digest") {
    const items = Array.isArray(result.items)
      ? (result.items as Array<{ title?: string }>)
      : [];
    return (
      <div className="mt-1 space-y-0.5 text-[11px]">
        <div>共 {items.length} 条政策速递：</div>
        {items.slice(0, 2).map((it, i) => (
          <div key={i} className="truncate">· {it.title ?? "-"}</div>
        ))}
        <Link href="/policies" className="mt-1 inline-block text-primary-600 hover:underline">
          查看政策中心 →
        </Link>
      </div>
    );
  }
  // Generic fallback: show a short summary if any
  const keys = Object.keys(result);
  if (keys.length === 0) return null;
  return (
    <div className="mt-1 text-[11px] text-text-tertiary">
      {keys.slice(0, 3).join(" · ")}
      <button
        onClick={() =>
          onPushToMatching(String(params_note(result) ?? ""))
        }
        className="ml-2 underline hover:text-primary-600"
      >
        用作匹配查询
      </button>
    </div>
  );
}

function params_note(result: Record<string, unknown>): string | null {
  const keys = ["summary", "headline", "recommendation"];
  for (const k of keys) {
    const v = result[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function RecentConsultations() {
  const [items, setItems] = useState<ConsultationItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await request<ConsultationItem[]>("/consultations");
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handoff = async (id: string) => {
    setBusy(id);
    try {
      await request(`/consultations/${id}/handoff`, {
        method: "POST",
        body: JSON.stringify({ reason: "用户在咨询页主动请求转人工" }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!items || items.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <SectionHeader
        eyebrow="AI Confidence"
        title="最近咨询 · AI 置信度"
        description="每一次咨询都会实时记录 AI 置信度；一旦低于阈值，我们会建议转人工律师。"
      />
      <div className="mt-4 space-y-3">
        {items.slice(0, 5).map((c) => (
          <ConsultRow key={c.id} item={c} busy={busy === c.id} onHandoff={() => handoff(c.id)} />
        ))}
      </div>
    </section>
  );
}

function ConsultRow({
  item,
  busy,
  onHandoff,
}: {
  item: ConsultationItem;
  busy: boolean;
  onHandoff: () => void;
}) {
  const pct = Math.round((item.aiConfidence ?? 0) * 100);
  const tone =
    pct >= 75
      ? { bar: "bg-success-500", label: "text-success-700", badge: "success" as const }
      : pct >= 50
        ? { bar: "bg-warning-500", label: "text-warning-700", badge: "warning" as const }
        : { bar: "bg-error-500", label: "text-error-700", badge: "error" as const };
  const statusLabel = CONSULT_STATUS_LABEL[item.status] ?? item.status;
  const shouldSuggestHandoff =
    pct < 60 && item.status === "ai_active" && !item.closedAt;

  return (
    <article className="rounded-lg border border-border bg-surface-elevated p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate text-sm font-medium text-text-primary">{item.topic}</h4>
            <Badge
              variant={
                item.status === "closed"
                  ? "default"
                  : item.status === "provider_assigned"
                    ? "success"
                    : item.status === "awaiting_provider"
                      ? "warning"
                      : "primary"
              }
              size="sm"
              dot
            >
              {statusLabel}
            </Badge>
          </div>
          <div className="mt-0.5 text-[11px] text-text-tertiary">
            {item.provider ? `律师 ${item.provider.name} · ` : "AI 独立答复 · "}
            {new Date(item.createdAt).toLocaleString()}
          </div>
        </div>
        <div className={`text-right ${tone.label}`}>
          <div className="num-display text-lg leading-none">{pct}%</div>
          <div className="text-[10px] uppercase tracking-wider opacity-80">AI Conf.</div>
        </div>
      </header>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${tone.bar} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {item.handoffReason && (
        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-warning-700">
          <IconGlyph name="alert" size={12} className="mt-0.5" />
          <span>{item.handoffReason}</span>
        </div>
      )}

      {shouldSuggestHandoff && (
        <div className="mt-3 flex items-center justify-between rounded-md border border-warning-100 bg-warning-50 px-3 py-2 text-[11px] text-warning-800">
          <span>AI 对当前问题把握不足，建议切到真人律师继续。</span>
          <button
            onClick={onHandoff}
            disabled={busy}
            className="ml-2 rounded-md bg-warning-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-warning-700 disabled:opacity-60"
          >
            {busy ? "转接中…" : "转人工律师"}
          </button>
        </div>
      )}
    </article>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary-500 focus:outline-none"
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-text-primary focus:border-primary-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FingerprintCard({ fp }: { fp: Fingerprint }) {
  const intentLabel = INTENT_LABEL[fp.intentCategory] ?? fp.intentCategory;
  const intentAccent = INTENT_ACCENT[fp.intentCategory] ?? "muted";
  const urgencyLabel = URGENCY_LABEL[fp.urgency] ?? fp.urgency;

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <SectionHeader
        eyebrow="DEMAND FINGERPRINT"
        title="需求指纹"
        description="AI 从你的描述中抽取的结构化画像 —— 决定了匹配结果。"
      />
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="核心意图"
          value={intentLabel}
          icon="target"
          accent={intentAccent}
        />
        <StatTile
          label="紧急程度"
          value={urgencyLabel}
          icon="clock"
          accent={fp.urgency === "urgent" ? "error" : fp.urgency === "low" ? "muted" : "warning"}
        />
        <StatTile
          label="地区"
          value={fp.region ?? "全国"}
          icon="building"
          accent="info"
        />
        <StatTile
          label="预算区间"
          value={fp.budget ?? "未指定"}
          icon="chart"
          accent="success"
        />
      </div>
      {fp.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-text-tertiary">
            关键词
          </span>
          {fp.tags.map((t) => (
            <Badge key={t} variant="outline" size="sm">
              #{t}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

function CandidateCard({
  candidate,
  onConsult,
  onQuote,
}: {
  candidate: Candidate;
  onConsult: () => void;
  onQuote: () => void;
}) {
  const p = candidate.provider;
  const prod = candidate.product;
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-primary-500">
      <header className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-600 text-base font-semibold text-text-inverse">
          {p.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-text-primary">{p.name}</h3>
            <Badge variant="primary" size="sm">
              #{candidate.rank}
            </Badge>
          </div>
          {p.shortIntro && (
            <p className="line-clamp-2 text-xs text-text-secondary">
              {p.shortIntro}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="num-display text-lg leading-none text-primary-600">
            {candidate.score}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
            MATCH
          </div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-surface-elevated p-2 text-[11px] text-text-secondary">
        <div className="flex flex-col items-center">
          <span className="text-text-primary tabular-nums">
            {p.ratingAvg.toFixed(1)}
          </span>
          <span className="text-text-tertiary">评分</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-text-primary tabular-nums">
            {p.ordersCount}
          </span>
          <span className="text-text-tertiary">已交付</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-text-primary tabular-nums">
            {p.responseSlaMinutes}m
          </span>
          <span className="text-text-tertiary">响应</span>
        </div>
      </div>

      {candidate.reasons.length > 0 && (
        <ul className="space-y-1 text-xs text-text-secondary">
          {candidate.reasons.slice(0, 4).map((r, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <IconGlyph
                name="check"
                size={12}
                className="mt-0.5 text-success-500"
              />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {prod && (
        <div className="rounded-md border border-border bg-surface-elevated p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-primary">
              {prod.name}
            </span>
            <SeverityPill level="info" label={prod.category} size="sm" />
          </div>
          {prod.summary && (
            <p className="mt-1 line-clamp-2 text-[11px] text-text-tertiary">
              {prod.summary}
            </p>
          )}
          <div className="mt-2 flex items-baseline gap-2">
            {prod.price ? (
              <>
                <span className="num-display text-base text-primary-600">
                  ¥{prod.price.toLocaleString()}
                </span>
                <span className="text-[10px] text-text-tertiary">
                  · {prod.priceMode === "fixed" ? "固定价" : "按次报价"}
                </span>
              </>
            ) : (
              <span className="text-xs text-text-tertiary">面议</span>
            )}
            {prod.deliveryDays && (
              <span className="ml-auto text-[10px] text-text-tertiary">
                {prod.deliveryDays} 天交付
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2">
        <button
          onClick={onConsult}
          className="flex-1 rounded-md bg-primary-600 px-3 py-2 text-xs font-medium text-text-inverse hover:bg-primary-700"
        >
          发起咨询
        </button>
        <button
          onClick={onQuote}
          className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-xs font-medium text-text-primary hover:bg-surface-elevated"
        >
          请求报价
        </button>
      </div>
    </article>
  );
}
