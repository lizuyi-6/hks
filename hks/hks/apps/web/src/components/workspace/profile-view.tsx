"use client";

/**
 * ProfileView — 需求画像可视化（赛道支柱 1）
 *
 * 将后端 `/profile/tags` + `/profile/fingerprint` 的数据呈现为：
 *  - 顶部指纹卡（意图 / 紧急度 / 预算 / 地域 / 行业）
 *  - 标签云（按 tagType 分组、按 confidence 渐变色）
 *  - 置信度条形图
 *  - 画像时间线（最近更新）
 *  - "重新生成画像"入口（拉 /matching/run）
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, WorkspaceCard } from "@a1plus/ui";
import { PageHeader, SectionHeader, KpiCard, StatTile, EmptyHero } from "./primitives";
import { ErrorDisplay, request } from "./shared";
import { ApplicationError } from "@/lib/errors";

// ---------------- Types ----------------

type ProfileTag = {
  id: string;
  tagType: string;
  tagValue: string;
  confidence: number;
  source: string;
  evidence?: Record<string, unknown>;
  createdAt: string;
};

type TagsResponse = {
  total: number;
  byType: Record<string, ProfileTag[]>;
  tags: ProfileTag[];
};

type Fingerprint = {
  source: "matching" | "synthesized";
  requestId: string | null;
  intentCategory: string;
  urgency: string;
  budget?: string | null;
  region: string;
  rawQuery: string;
  tags: string[];
  snapshot: Record<string, unknown>;
  createdAt: string | null;
};

type MatchingRun = {
  requestId: string;
  fingerprint: {
    intentCategory: string;
    urgency: string;
    budget?: string | null;
    region: string;
    tags: string[];
    rawQuery: string;
  };
  candidates: unknown[];
};

// ---------------- Labels ----------------

const TAG_TYPE_LABEL: Record<string, string> = {
  intent: "意图",
  urgency: "紧急度",
  budget: "预算",
  region: "地域",
  industry: "行业",
  stage: "阶段",
  applicantType: "主体类型",
  asset: "已有资产",
  focus: "关注领域",
  behavior: "行为信号",
};

const SOURCE_LABEL: Record<string, string> = {
  query: "来自需求描述",
  profile: "来自个人资料",
  behavior: "来自行为信号",
  system: "来自系统推断",
};

const INTENT_LABEL: Record<string, string> = {
  trademark: "商标",
  patent: "专利",
  copyright: "软著/版权",
  contract: "合同",
  litigation: "诉讼维权",
  compliance: "合规",
  dueDiligence: "融资尽调",
  general: "综合",
};

const URGENCY_LABEL: Record<string, string> = {
  urgent: "紧急",
  normal: "常规",
  low: "可慢慢来",
};

// ---------------- Utilities ----------------

function confidencePct(c: number): number {
  return Math.max(0, Math.min(100, Math.round(c * 100)));
}

function confidenceColor(c: number): string {
  if (c >= 0.9) return "bg-emerald-500";
  if (c >= 0.7) return "bg-blue-500";
  if (c >= 0.5) return "bg-amber-500";
  return "bg-slate-400";
}

function tagChipClass(source: string): string {
  if (source === "query")
    return "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-200 dark:border-indigo-800";
  if (source === "profile")
    return "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-800";
  if (source === "behavior")
    return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800";
  return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(iso).toLocaleDateString();
}

// ---------------- Component ----------------

export function ProfileView() {
  const [tagsData, setTagsData] = useState<TagsResponse | null>(null);
  const [fingerprint, setFingerprint] = useState<Fingerprint | null>(null);
  const [error, setError] = useState<ApplicationError | string | null>(null);
  const [loading, setLoading] = useState(true);

  const [queryInput, setQueryInput] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tagsRes, fpRes] = await Promise.all([
        request<TagsResponse>("/profile/tags"),
        request<Fingerprint>("/profile/fingerprint"),
      ]);
      setTagsData(tagsRes);
      setFingerprint(fpRes);
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const regenerate = useCallback(async () => {
    if (!queryInput.trim()) return;
    setRegenerating(true);
    setError(null);
    try {
      await request<MatchingRun>("/matching/run", {
        method: "POST",
        body: JSON.stringify({ raw_query: queryInput, top_k: 3 }),
      });
      setQueryInput("");
      await load();
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    } finally {
      setRegenerating(false);
    }
  }, [queryInput, load]);

  const typeCounts = useMemo(() => {
    if (!tagsData) return { intent: 0, behavior: 0, profile: 0 };
    return {
      intent: tagsData.byType["intent"]?.length || 0,
      behavior: tagsData.tags.filter((t) => t.source === "behavior").length,
      profile: tagsData.tags.filter((t) => t.source === "profile").length,
    };
  }, [tagsData]);

  const recent = useMemo(() => {
    if (!tagsData) return [];
    return [...tagsData.tags]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);
  }, [tagsData]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="支柱 1 · 需求画像"
        title="我的画像"
        description="AI 基于你的需求描述 + 个人资料 + 使用行为，自动为你构建可解释的标签画像。匹配引擎与场景推送都基于此画像。"
      />

      {error && <ErrorDisplay error={error} />}

      {/* 顶部指纹卡 + KPI */}
      {fingerprint && (
        <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
          <WorkspaceCard title="画像指纹">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-xs text-text-tertiary mb-1">最近一次画像指纹</div>
                <div className="text-sm text-text-secondary">
                  来源：{fingerprint.source === "matching" ? "匹配引擎" : "当前资料合成"}
                  {fingerprint.createdAt && (
                    <span className="ml-2">· {relativeTime(fingerprint.createdAt)}</span>
                  )}
                </div>
              </div>
              {fingerprint.requestId && (
                <Link
                  href={`/match/${fingerprint.requestId}`}
                  className="text-xs text-primary hover:underline"
                >
                  查看匹配结果 →
                </Link>
              )}
            </div>

            {fingerprint.rawQuery && (
              <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-sm italic text-text-secondary">
                &ldquo;{fingerprint.rawQuery}&rdquo;
              </blockquote>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <StatTile label="意图" value={INTENT_LABEL[fingerprint.intentCategory] ?? fingerprint.intentCategory} accent="primary" />
              <StatTile
                label="紧急度"
                value={URGENCY_LABEL[fingerprint.urgency] ?? fingerprint.urgency}
                accent={fingerprint.urgency === "urgent" ? "error" : "info"}
              />
              <StatTile label="预算" value={fingerprint.budget || "未限定"} accent="warning" />
              <StatTile label="地域" value={fingerprint.region || "全国"} accent="success" />
            </div>

            {fingerprint.tags.length > 0 && (
              <div className="mt-4">
                <div className="text-xs text-text-tertiary mb-2">向量化标签（供匹配 rerank）</div>
                <div className="flex flex-wrap gap-1.5">
                  {fingerprint.tags.map((t) => (
                    <Badge key={t} variant="default">
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </WorkspaceCard>

          <div className="grid gap-3 sm:grid-cols-3">
            <KpiCard
              label="画像标签总数"
              value={tagsData?.total ?? 0}
              unit="个"
              accent="primary"
              icon="sparkle"
            />
            <KpiCard
              label="画像维度"
              value={tagsData ? Object.keys(tagsData.byType).length : 0}
              unit="类"
              accent="info"
              icon="chart"
            />
            <KpiCard
              label="行为信号数"
              value={typeCounts.behavior}
              unit="条"
              accent="warning"
              icon="bolt"
            />
            <div className="sm:col-span-3">
              <WorkspaceCard title="重新生成画像">
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
                    placeholder="例：我在上海做跨境电商，想尽快注册英文商标，预算 1.5 万以内"
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    disabled={regenerating}
                  />
                  <button
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                    onClick={regenerate}
                    disabled={regenerating || !queryInput.trim()}
                  >
                    {regenerating ? "生成中…" : "生成并匹配"}
                  </button>
                </div>
              </WorkspaceCard>
            </div>
          </div>
        </div>
      )}

      {/* 标签分组 */}
      {tagsData && tagsData.tags.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Object.entries(tagsData.byType).map(([tagType, items]) => (
            <WorkspaceCard key={tagType} title={tagType}>
              <SectionHeader
                title={TAG_TYPE_LABEL[tagType] ?? tagType}
                description={`${items.length} 个标签`}
              />
              <div className="mt-3 space-y-2">
                {items.map((t) => (
                  <div key={t.id} className="group">
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${tagChipClass(t.source)}`}
                      >
                        {t.tagValue}
                      </span>
                      <span className="text-xs text-text-tertiary">
                        {SOURCE_LABEL[t.source] ?? t.source}
                      </span>
                      <span className="ml-auto font-mono text-xs text-text-tertiary">
                        {confidencePct(t.confidence)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${confidenceColor(t.confidence)}`}
                        style={{ width: `${confidencePct(t.confidence)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </WorkspaceCard>
          ))}
        </div>
      ) : !loading && (
        <EmptyHero
          title="暂无画像"
          description="试着在上方输入一句话描述你的需求，AI 会立刻为你构建画像并匹配律师。"
          icon="sparkle"
        />
      )}

      {/* 画像时间线 */}
      {recent.length > 0 && (
        <WorkspaceCard title="画像更新时间线">
          <p className="text-xs text-text-secondary mb-4">最近 8 条标签更新，体现 AI 对你的持续理解</p>
          <ol className="mt-3 space-y-3">
            {recent.map((t, i) => (
              <li key={t.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`h-2 w-2 rounded-full ${confidenceColor(t.confidence)}`} />
                  {i < recent.length - 1 && <div className="mt-1 h-full w-px bg-border" />}
                </div>
                <div className="pb-3">
                  <div className="text-sm text-text-primary">
                    <span className="font-medium">
                      {TAG_TYPE_LABEL[t.tagType] ?? t.tagType}
                    </span>
                    <span className="mx-1 text-text-tertiary">·</span>
                    <span>{t.tagValue}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-text-tertiary">
                    {SOURCE_LABEL[t.source] ?? t.source} · {relativeTime(t.createdAt)} · 置信度{" "}
                    {confidencePct(t.confidence)}%
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </WorkspaceCard>
      )}

      {loading && !tagsData && (
        <div className="py-12 text-center text-sm text-text-tertiary">加载画像中…</div>
      )}
    </div>
  );
}
