"use client";

/**
 * MatchPanel — C 端匹配中心。
 * 左侧列出历史匹配请求，右侧展示被选中匹配的详情 —— 画像 + 候选律师卡片。
 * 与 ConsultPanel 共享候选卡片样式，形成「咨询 → 匹配 → 订单」的闭环。
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Badge } from "@a1plus/ui";
import {
  PageHeader,
  SectionHeader,
  EmptyHero,
  SeverityPill,
  StatTile,
  IconGlyph,
  DepthBadge,
  type DepthLevel,
} from "./primitives";
import { ErrorDisplay, request } from "./shared";
import { ApplicationError } from "@/lib/errors";

type MatchRequest = {
  id: string;
  intentCategory: string;
  rawQuery: string;
  urgency: string;
  region?: string | null;
  status: string;
  createdAt: string;
};

type Candidate = {
  candidate_id: string;
  rank: number;
  score: number;
  reasons: string[];
  provider: {
    id: string;
    name: string;
    shortIntro?: string | null;
    ratingAvg: number;
    ordersCount: number;
    responseSlaMinutes: number;
    regions: string[];
    practiceAreas: string[];
    featuredTags: string[];
  };
  product: {
    id: string;
    name: string;
    price?: number | null;
    priceMode: string;
    deliveryDays?: number | null;
    category: string;
    summary?: string | null;
  } | null;
};

type MatchDetail = {
  request: {
    id: string;
    intent_category: string;
    raw_query: string;
    urgency: string;
    region?: string | null;
    status: string;
    profile_vector?: { tags?: string[] } | null;
    profile_snapshot?: Record<string, unknown> | null;
    created_at: string;
  };
  candidates: Candidate[];
};

type ProviderDepth = {
  providerId: string;
  overall: { score: number; level: DepthLevel; label: string };
  byArea: Array<{
    area: string;
    ordersClosed: number;
    avgRating: number | null;
    score: number;
    level: DepthLevel;
    label: string;
  }>;
  primary: {
    area: string;
    ordersClosed: number;
    avgRating: number | null;
    score: number;
    level: DepthLevel;
    label: string;
  } | null;
};

const INTENT_LABEL: Record<string, string> = {
  trademark: "商标",
  patent: "专利",
  copyright: "版权",
  contract: "合同",
  litigation: "诉讼",
  due_diligence: "尽调",
  compliance: "合规",
  general: "综合",
};

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  if (days < 30) return `${Math.floor(days / 7)} 周前`;
  return `${Math.floor(days / 30)} 个月前`;
}

export function MatchPanel({ initialRequestId }: { initialRequestId?: string } = {}) {
  const [requests, setRequests] = useState<MatchRequest[]>([]);
  const [selected, setSelected] = useState<string | null>(initialRequestId ?? null);
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [depthMap, setDepthMap] = useState<Record<string, ProviderDepth>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | ApplicationError | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const list = await request<MatchRequest[]>("/matching");
      setRequests(list);
      if (list.length && !selected) setSelected(list[0].id);
    } catch (e) {
      if (e instanceof ApplicationError) setError(e);
      else setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const d = await request<MatchDetail>(`/matching/${id}`);
      setDetail(d);
    } catch (e) {
      if (e instanceof ApplicationError) setError(e);
      else setError(String(e));
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (selected) loadDetail(selected);
  }, [selected, loadDetail]);

  // Fetch depth badges whenever the candidate list changes.
  useEffect(() => {
    const ids = detail?.candidates.map((c) => c.provider.id).filter(Boolean) ?? [];
    if (ids.length === 0) {
      setDepthMap({});
      return;
    }
    const qs = `?providerIds=${encodeURIComponent(ids.join(","))}`;
    request<ProviderDepth[]>(`/providers/depth${qs}`)
      .then((rows) => {
        const next: Record<string, ProviderDepth> = {};
        for (const row of rows) next[row.providerId] = row;
        setDepthMap(next);
      })
      .catch(() => setDepthMap({}));
  }, [detail]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intelligent Matching"
        title="智能匹配中心"
        icon="target"
        accent="primary"
        description="沉淀你每一次匹配的需求指纹 + 候选律师，方便你对比、回溯、再委托。"
        actions={
          <Link
            href="/consult"
            className="inline-flex h-9 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse hover:bg-primary-700"
          >
            发起新匹配 →
          </Link>
        }
      />

      {error && <ErrorDisplay error={error} />}

      {!loading && requests.length === 0 ? (
        <EmptyHero
          icon="target"
          title="还没有匹配记录"
          description="去 AI 咨询里告诉它你的需求，我们会自动生成匹配结果。"
          accent="primary"
          primaryAction={{ label: "开始匹配", href: "/consult" }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* ===== Left: request list ===== */}
          <aside className="rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-4 py-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-tertiary">
                匹配历史 · {requests.length}
              </span>
            </div>
            <ul className="max-h-[640px] overflow-y-auto divide-y divide-border">
              {requests.map((r) => {
                const active = r.id === selected;
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => setSelected(r.id)}
                      className={`block w-full px-4 py-3 text-left transition-colors ${
                        active
                          ? "bg-primary-50 text-text-primary"
                          : "hover:bg-surface-elevated text-text-secondary"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant={active ? "primary" : "outline"}
                          size="sm"
                        >
                          {INTENT_LABEL[r.intentCategory] ?? r.intentCategory}
                        </Badge>
                        <span className="text-[10px] text-text-tertiary">
                          {formatRelative(r.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm">
                        {r.rawQuery || "(未填写描述)"}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-text-tertiary">
                        <span>
                          {r.urgency === "urgent"
                            ? "紧急"
                            : r.urgency === "low"
                              ? "不急"
                              : "常规"}
                        </span>
                        <span>·</span>
                        <span>{r.region ?? "全国"}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          {/* ===== Right: detail ===== */}
          <section className="space-y-4">
            {detail && (
              <>
                <div className="rounded-xl border border-border bg-surface p-5">
                  <SectionHeader
                    eyebrow="本次需求画像"
                    title={detail.request.raw_query || "(未填写描述)"}
                  />
                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatTile
                      label="意图"
                      value={
                        INTENT_LABEL[detail.request.intent_category] ??
                        detail.request.intent_category
                      }
                      icon="target"
                      accent="primary"
                    />
                    <StatTile
                      label="紧急"
                      value={
                        detail.request.urgency === "urgent"
                          ? "紧急"
                          : detail.request.urgency === "low"
                            ? "不急"
                            : "常规"
                      }
                      icon="clock"
                      accent={
                        detail.request.urgency === "urgent"
                          ? "error"
                          : "warning"
                      }
                    />
                    <StatTile
                      label="地区"
                      value={detail.request.region ?? "全国"}
                      icon="building"
                      accent="info"
                    />
                    <StatTile
                      label="状态"
                      value={
                        detail.request.status === "matched"
                          ? "已匹配"
                          : detail.request.status
                      }
                      icon="check"
                      accent="success"
                    />
                  </div>
                  {detail.request.profile_vector?.tags &&
                    detail.request.profile_vector.tags.length > 0 && (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wider text-text-tertiary">
                          关键词
                        </span>
                        {detail.request.profile_vector.tags.map((t) => (
                          <Badge key={t} variant="outline" size="sm">
                            #{t}
                          </Badge>
                        ))}
                      </div>
                    )}
                </div>

                <SectionHeader
                  eyebrow="候选律师 / 代理"
                  title={`Top ${detail.candidates.length}`}
                  description="得分结合了「意图命中 + 画像命中 + 地区覆盖 + 律师画像」。"
                />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {detail.candidates.map((c) => (
                    <MatchCandidateCard
                      key={c.candidate_id}
                      candidate={c}
                      depth={depthMap[c.provider.id]}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function MatchCandidateCard({
  candidate,
  depth,
}: {
  candidate: Candidate;
  depth?: ProviderDepth;
}) {
  const p = candidate.provider;
  const prod = candidate.product;
  const primaryDepth = depth?.primary;
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-text-inverse">
          {p.name.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-text-primary">{p.name}</h3>
            {primaryDepth && (
              <DepthBadge
                level={primaryDepth.level}
                area={primaryDepth.area}
                label={primaryDepth.label}
              />
            )}
          </div>
          {p.shortIntro && (
            <p className="line-clamp-2 text-[11px] text-text-secondary">
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
      <ul className="space-y-1 text-[11px] text-text-secondary">
        {candidate.reasons.slice(0, 3).map((r, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <IconGlyph
              name="check"
              size={10}
              className="mt-0.5 text-success-500"
            />
            <span>{r}</span>
          </li>
        ))}
      </ul>
      {prod && (
        <div className="rounded-md border border-border bg-surface-elevated p-2">
          <div className="flex items-center justify-between">
            <span className="truncate text-xs text-text-primary">
              {prod.name}
            </span>
            <SeverityPill level="info" label={prod.category} size="sm" />
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Link
          href={`/consult?prefill=${encodeURIComponent(p.name)}`}
          className="flex-1 rounded-md bg-primary-600 px-3 py-1.5 text-center text-xs font-medium text-text-inverse hover:bg-primary-700"
        >
          咨询 TA
        </Link>
        <Link
          href={`/orders`}
          className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-center text-xs font-medium text-text-primary hover:bg-surface-elevated"
        >
          查看订单
        </Link>
      </div>
    </article>
  );
}
