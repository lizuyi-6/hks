"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  ModuleResultItem,
  TrademarkCheckRequest,
  TrademarkCheckResult,
} from "@a1plus/domain";
import { riskLevelMeta } from "@a1plus/domain";
import {
  WorkspaceCard,
  DataTag,
  Badge,
  DisclaimerBox,
  SubmitButton,
  FormInput,
  FormTextarea,
} from "@a1plus/ui";
import { BarRow } from "@/components/viz";
import {
  PageHeader,
  PillarBanner,
  SectionHeader,
  IconGlyph,
  StatTile,
  accentBgClass,
  type Accent,
} from "./primitives";
import { BubbleScatter } from "./viz-hero";
import { request, ErrorDisplay } from "./shared";
import type { Envelope, DiagnosisPayload } from "./shared";

const NICE_CLASS_LABELS: Record<string, string> = {
  "9": "电子 / 软件",
  "16": "出版印刷",
  "25": "服装鞋帽",
  "29": "食品",
  "30": "食品饮料",
  "35": "广告营销",
  "38": "电信",
  "41": "教育娱乐",
  "42": "科技服务",
  "43": "餐饮",
  "44": "医疗",
  "45": "法律服务",
};

function riskAccent(level: string | undefined): { accent: Accent; variant: "success" | "warning" | "error" | "default" } {
  if (level === "green") return { accent: "success", variant: "success" };
  if (level === "yellow") return { accent: "warning", variant: "warning" };
  if (level === "red") return { accent: "error", variant: "error" };
  return { accent: "muted", variant: "default" };
}

function similarityToRiskPercent(findings: Array<{ similarityScore: number }>) {
  if (findings.length === 0) return 5;
  const max = Math.max(...findings.map((f) => f.similarityScore));
  return Math.round(max);
}

function simAccent(score: number): Accent {
  if (score >= 70) return "error";
  if (score >= 40) return "warning";
  return "success";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN");
}

export function TrademarkCheckWorkspace({
  presetCategories,
}: {
  presetCategories?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<TrademarkCheckResult> | null>(null);
  const [history, setHistory] = useState<ModuleResultItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [prefillDescription, setPrefillDescription] = useState("");
  const [profileDefaults, setProfileDefaults] = useState<{
    applicantName?: string;
    applicantType?: string;
  } | null>(null);

  useEffect(() => {
    request<ModuleResultItem[]>("/module-results?module_type=trademark-check")
      .then((results) => {
        setHistory(results.slice(-10).reverse());
        if (results.length > 0) {
          const latest = results[results.length - 1];
          setResult(latest.resultData as unknown as Envelope<TrademarkCheckResult>);
        }
      })
      .catch(() => {});

    request<ModuleResultItem[]>("/module-results?module_type=diagnosis")
      .then((results) => {
        if (results.length > 0) {
          const latest = results[results.length - 1] as unknown as {
            resultData: Envelope<DiagnosisPayload>;
          };
          const desc = (latest.resultData as unknown as Envelope<DiagnosisPayload>)
            ?.normalizedPayload?.summary;
          if (desc) setPrefillDescription(desc);
        }
      })
      .catch(() => {});

    fetch(`/api/backend/profile`, { credentials: "include" })
      .then((res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{
          applicantName?: string;
          applicantType?: string;
          businessDescription?: string;
        }>;
      })
      .then((p) => {
        if (!p) {
          setProfileDefaults({});
          return;
        }
        setProfileDefaults(p);
        if (p.businessDescription) {
          setPrefillDescription((prev) => prev || p.businessDescription!);
        }
      })
      .catch(() => setProfileDefaults({}));
  }, []);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const payload: TrademarkCheckRequest = {
      trademarkName: String(formData.get("trademarkName") ?? ""),
      businessDescription: String(formData.get("businessDescription") ?? ""),
      applicantName: String(formData.get("applicantName") ?? ""),
      applicantType: String(
        formData.get("applicantType") ?? "company",
      ) as TrademarkCheckRequest["applicantType"],
      categories: String(formData.get("categories") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };

    try {
      const res = await request<Envelope<TrademarkCheckResult>>("/trademarks/check", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "查重失败");
    } finally {
      setLoading(false);
    }
  }

  const riskMeta = useMemo(
    () => (result ? riskLevelMeta[result.normalizedPayload.riskLevel ?? "yellow"] : null),
    [result],
  );

  const findings = useMemo(
    () => result?.normalizedPayload.findings ?? [],
    [result],
  );
  const conflictPercent = similarityToRiskPercent(findings);
  const highRisk = findings.filter((f) => f.similarityScore >= 70).length;
  const mediumRisk = findings.filter((f) => f.similarityScore >= 40 && f.similarityScore < 70).length;
  const lowRisk = findings.filter((f) => f.similarityScore < 40).length;
  const { accent: overallAccent, variant: overallVariant } = riskAccent(
    result?.normalizedPayload.riskLevel,
  );

  const bubblePoints = useMemo(() => {
    if (!findings.length) return [];
    return findings.map((f) => {
      const classNum = Number(f.category) || 0;
      const sim = f.similarityScore;
      const color =
        sim >= 70
          ? "rgb(var(--color-error-500))"
          : sim >= 40
            ? "rgb(var(--color-warning-500))"
            : "rgb(var(--color-success-500))";
      return {
        x: sim,
        y: classNum,
        r: 6 + sim / 10,
        color,
        label: f.name,
      };
    });
  }, [findings]);

  const yBounds = useMemo(() => {
    if (!bubblePoints.length) return { min: 0, max: 45 };
    const ys = bubblePoints.map((p) => p.y);
    return { min: Math.max(0, Math.min(...ys) - 3), max: Math.min(45, Math.max(...ys) + 3) };
  }, [bubblePoints]);

  const suggestedCategories =
    result?.normalizedPayload.suggestedCategories ??
    // @ts-expect-error legacy snake_case alias
    result?.normalizedPayload.suggested_categories ??
    [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trademark"
        title="商标查重"
        icon="search"
        accent="info"
        description="输入拟注册名称，系统即时匹配 CNIPA 近似商标库并给出调整建议。"
        actions={
          history.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-elevated"
            >
              <IconGlyph name="clock" size={14} />
              历史记录 · {history.length}
            </button>
          )
        }
      />

      <PillarBanner
        pillar="digital"
        hint="查重红灯会即时触发场景推送，申请书生成+递交引导全流程已数字化。"
      />

      {showHistory && history.length > 0 && (
        <WorkspaceCard title="历史查重" eyebrow="History">
          <ul className="divide-y divide-border">
            {history.map((h) => {
              const env = h.resultData as unknown as Envelope<TrademarkCheckResult>;
              const lvl = env?.normalizedPayload?.riskLevel ?? "yellow";
              const meta = riskLevelMeta[lvl];
              return (
                <li key={h.id} className="flex items-center gap-3 py-3">
                  <IconGlyph name="search" size={14} className="text-primary-600" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {env?.normalizedPayload?.summary ?? "商标查重结果"}
                    </p>
                    <p className="mt-0.5 text-xs text-text-tertiary">{relativeTime(h.createdAt)}</p>
                  </div>
                  <Badge variant={riskAccent(lvl).variant} size="sm" dot>
                    {meta?.label ?? lvl}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => { setResult(env); setShowHistory(false); }}
                    className="inline-flex h-7 items-center rounded-md border border-border px-2 text-xs text-text-secondary transition-colors hover:bg-surface-elevated"
                  >
                    重放
                  </button>
                </li>
              );
            })}
          </ul>
        </WorkspaceCard>
      )}

      <WorkspaceCard title="商标查重分析" eyebrow="Core flow">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleSubmit(new FormData(e.currentTarget));
          }}
          className="grid gap-4"
        >
          <FormInput name="trademarkName" label="商标名称" placeholder="商标名称" required />
          <FormTextarea
            name="businessDescription"
            label="业务描述"
            placeholder="业务描述，用于辅助判断类别和使用场景"
            rows={5}
            defaultValue={prefillDescription}
            required
          />
          <div className="grid gap-4 md:grid-cols-3">
            <FormInput
              name="applicantName"
              label="申请人"
              defaultValue={profileDefaults?.applicantName ?? ""}
              placeholder="申请人名称"
              required
            />
            <div className="w-full">
              <label htmlFor="applicantType" className="mb-1.5 block text-sm font-medium text-text-primary">
                类型
              </label>
              <select
                id="applicantType"
                name="applicantType"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
                defaultValue={profileDefaults?.applicantType ?? "company"}
              >
                <option value="company">企业</option>
                <option value="individual">个人</option>
              </select>
            </div>
            <FormInput
              name="categories"
              label="类别"
              placeholder="类别，用逗号分隔，如 35,42"
              defaultValue={presetCategories ?? ""}
            />
          </div>
          <SubmitButton loading={loading} loadingText="查询中...">
            执行商标查重
          </SubmitButton>
          {loading && <p className="text-sm text-text-tertiary">正在检索商标数据库，请稍候...</p>}
          {error ? <ErrorDisplay error={error} /> : null}
        </form>
      </WorkspaceCard>

      {result && riskMeta ? (
        <>
          {/* ===== Risk hero ===== */}
          <section className={`rounded-lg border p-5 ${
            overallAccent === "error"
              ? "border-error-100 bg-error-50/40"
              : overallAccent === "warning"
                ? "border-warning-100 bg-warning-50/40"
                : overallAccent === "success"
                  ? "border-success-100 bg-success-50/40"
                  : "border-border bg-surface"
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader eyebrow="Risk summary" title="查重结果" description={riskMeta.description} />
              <DataTag mode={result.mode} provider={result.provider} />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <div className="rounded-lg border border-info-100 bg-surface p-3">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-info-700">
                    相似度 × 尼斯分类 气泡图
                  </p>
                  <Badge variant={overallVariant} size="sm" dot>
                    {riskMeta.label}
                  </Badge>
                </div>
                {bubblePoints.length ? (
                  <BubbleScatter
                    points={bubblePoints}
                    xMin={0}
                    xMax={100}
                    yMin={yBounds.min}
                    yMax={yBounds.max}
                    xLabel="相似度 %"
                    yLabel="尼斯分类"
                    width={520}
                    height={260}
                  />
                ) : (
                  <div className="flex h-[220px] items-center justify-center text-xs text-text-tertiary">
                    暂无冲突项
                  </div>
                )}
              </div>
              <div className="grid gap-3 self-start">
                <StatTile
                  label="冲突度"
                  value={`${conflictPercent}%`}
                  icon="alert"
                  accent={overallAccent}
                  hint="最高相似度"
                />
                <StatTile label="高相似" value={highRisk} icon="alert" accent={highRisk > 0 ? "error" : "muted"} hint="≥ 70%" />
                <StatTile label="中相似" value={mediumRisk} icon="search" accent="warning" hint="40% – 70%" />
                <StatTile label="低相似" value={lowRisk} icon="check" accent="success" hint="< 40%" />
              </div>
            </div>

            <p className="mt-4 leading-7 text-text-primary">{result.normalizedPayload.summary}</p>
          </section>

          {/* ===== Findings grid ===== */}
          <WorkspaceCard
            title="近似项 / 冲突项"
            eyebrow="Findings"
            actions={<Badge variant="outline" size="sm">{findings.length} 条</Badge>}
          >
            {findings.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">未检索到近似商标</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {findings.map((finding) => {
                  const simColor = simAccent(finding.similarityScore);
                  const barColorVar =
                    simColor === "error"
                      ? "rgb(var(--color-error-500))"
                      : simColor === "warning"
                        ? "rgb(var(--color-warning-500))"
                        : "rgb(var(--color-success-500))";
                  return (
                    <div
                      key={`${finding.name}-${finding.category}`}
                      className="rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-text-primary">{finding.name}</p>
                          <p className="mt-0.5 text-xs text-text-tertiary">
                            第 {finding.category} 类
                            {NICE_CLASS_LABELS[finding.category]
                              ? ` · ${NICE_CLASS_LABELS[finding.category]}`
                              : ""}
                          </p>
                        </div>
                        <Badge
                          variant={simColor === "error" ? "error" : simColor === "warning" ? "warning" : "success"}
                          size="sm"
                          dot
                        >
                          {finding.status}
                        </Badge>
                      </div>
                      <div className="mt-3">
                        <BarRow
                          label="相似度"
                          value={finding.similarityScore}
                          max={100}
                          color={barColorVar}
                          track="rgb(var(--color-border) / 0.8)"
                          suffix="%"
                        />
                      </div>
                      {finding.note && (
                        <p className="mt-2 text-xs leading-5 text-text-secondary">{finding.note}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </WorkspaceCard>

          {/* ===== Recommendations ===== */}
          <div className="grid gap-4 lg:grid-cols-2">
            <WorkspaceCard title="建议与备选方案" eyebrow="Recommendation">
              <p className="text-sm leading-7 text-text-secondary">
                {result.normalizedPayload.recommendation}
              </p>
              {result.normalizedPayload.alternatives?.length ? (
                <div className="mt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
                    备选商标
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.normalizedPayload.alternatives.map((item) => (
                      <span
                        key={item}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${accentBgClass("primary")} border-transparent`}
                      >
                        <IconGlyph name="sparkle" size={12} />
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </WorkspaceCard>

            <WorkspaceCard title="推荐尼斯分类" eyebrow="Nice categories">
              {suggestedCategories.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-tertiary">无特别推荐</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {suggestedCategories.map((c: string) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1.5 rounded-full border border-info-100 bg-info-50 px-3 py-1 text-sm text-info-700"
                    >
                      <IconGlyph name="target" size={12} />
                      第 {c} 类{NICE_CLASS_LABELS[c] ? ` · ${NICE_CLASS_LABELS[c]}` : ""}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[11px] text-text-tertiary">
                尼斯分类最终以 CNIPA 公布的《类似商品和服务区分表》为准。
              </p>
            </WorkspaceCard>
          </div>

          <DisclaimerBox>{result.disclaimer}</DisclaimerBox>

          {/* ===== Next step CTA ===== */}
          <div
            className={`rounded-lg border p-4 ${
              overallAccent === "success"
                ? "border-success-100 bg-success-50"
                : overallAccent === "warning"
                  ? "border-warning-100 bg-warning-50"
                  : overallAccent === "error"
                    ? "border-error-100 bg-error-50"
                    : "border-border bg-surface"
            }`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  <span className="mr-1.5 text-primary-600">→</span>
                  {result.normalizedPayload.riskLevel === "green"
                    ? "商标可用，建议直接生成申请书"
                    : result.normalizedPayload.riskLevel === "yellow"
                      ? "存在近似，请谨慎评估或考虑备选方案"
                      : "存在明显冲突，建议调整名称后重新查重"}
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  {result.normalizedPayload.riskLevel === "green"
                    ? "可进入申请书生成流程，系统会自动填充已填表单字段。"
                    : result.normalizedPayload.riskLevel === "yellow"
                      ? "建议从备选商标中挑选更安全的名称，再次查重。"
                      : "建议使用备选商标或重新命名，避免正式申请时被驳回。"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/trademark/application"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
                >
                  <IconGlyph name="edit" size={14} />
                  进入申请书生成
                </Link>
                <Link
                  href="/trademark/check"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-elevated"
                >
                  <IconGlyph name="refresh" size={14} />
                  重新查重
                </Link>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
