"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { ModuleResultItem } from "@a1plus/domain";
import {
  WorkspaceCard,
  DataTag,
  Badge,
  DisclaimerBox,
  StreamingPanel,
  SubmitButton,
  FormInput,
  FormTextarea,
} from "@a1plus/ui";
import { fetchSSE } from "@/lib/sse";
import { FileUpload } from "@/components/file-upload";
import {
  PillarBanner,
  SectionHeader,
  StatTile,
  IconGlyph,
  accentBgClass,
  severityAccent,
  type Accent,
  type IconName,
} from "./primitives";
import { RadarChart, SegmentedRings } from "./viz-hero";
import { request, ErrorDisplay } from "./shared";
import type { Envelope, DiagnosisPayload } from "./shared";

type DiagnosisWithRisk = DiagnosisPayload & { riskLevel?: string; businessType?: string };

function riskScore(level?: string): number {
  const l = (level ?? "").toLowerCase();
  if (["green", "low", "safe", "良好"].includes(l)) return 25;
  if (["yellow", "medium", "moderate", "中"].includes(l)) return 55;
  if (["red", "high", "critical", "高", "严重"].includes(l)) return 85;
  return 40;
}

function riskAccent(level?: string): Accent {
  return severityAccent(level ?? "");
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

export function DiagnosisWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Envelope<DiagnosisWithRisk> | null>(null);
  const [history, setHistory] = useState<ModuleResultItem[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [prefill, setPrefill] = useState<{
    businessName?: string;
    businessDescription?: string;
    industry?: string;
    stage?: string;
  } | null>(null);
  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    request<ModuleResultItem[]>("/module-results?module_type=diagnosis")
      .then((results) => {
        setHistory(results.slice(-5).reverse());
        if (results.length > 0) {
          const latest = results[results.length - 1];
          setReport(latest.resultData as unknown as Envelope<DiagnosisWithRisk>);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`/api/backend/profile`, { credentials: "include" })
      .then(
        (res) =>
          res.json() as Promise<{
            businessName?: string;
            businessDescription?: string;
            industry?: string;
            stage?: string;
          }>,
      )
      .then((p) => setPrefill(p))
      .catch(() => setPrefill({}));
  }, []);

  async function handleSubmit(formData: FormData) {
    if (loading) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    setStreamingText("");

    const payload = {
      business_name: String(formData.get("businessName") ?? ""),
      business_description: String(formData.get("businessDescription") ?? ""),
      industry: String(formData.get("industry") ?? ""),
      stage: String(formData.get("stage") ?? ""),
    };

    try {
      await fetchSSE<Envelope<DiagnosisWithRisk>>(
        `/api/backend/stream/diagnosis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        },
        {
          onToken: (token) => {
            if (mountedRef.current) setStreamingText((prev) => prev + token);
          },
          onResult: (result) => {
            if (!mountedRef.current) return;
            setReport(result);
            setStreamingText("");
          },
          onError: (msg) => {
            if (!mountedRef.current) return;
            setError(msg);
            setStreamingText("");
          },
        },
      );
    } catch (err) {
      if (!controller.signal.aborted && mountedRef.current) {
        setError(err instanceof Error ? err.message : "诊断失败");
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (mountedRef.current) setLoading(false);
    }
  }

  const riskLevel = report?.normalizedPayload?.riskLevel;
  const score = riskScore(riskLevel);
  const accent = riskAccent(riskLevel);

  const priorityCount = report?.normalizedPayload?.priorityAssets?.length ?? 0;
  const riskCount = report?.normalizedPayload?.risks?.length ?? 0;
  const actionCount = report?.normalizedPayload?.nextActions?.length ?? 0;

  const radarValues = useMemo(() => {
    const base = score; // risk score 25-85
    const risks = report?.normalizedPayload?.risks ?? [];
    const txt = risks.join(" ").toLowerCase();
    const boost = (kw: string[]) => (kw.some((k) => txt.includes(k)) ? 15 : 0);
    return [
      Math.max(10, Math.min(100, base + boost(["商标", "trademark", "近似", "冲突"]))),
      Math.max(10, Math.min(100, base + boost(["专利", "patent", "技术", "方案"]))),
      Math.max(10, Math.min(100, base - 10 + boost(["版权", "copyright", "著作", "软著"]))),
      Math.max(10, Math.min(100, base - 5 + boost(["合规", "隐私", "许可", "备案"]))),
      Math.max(10, Math.min(100, base + 5 + boost(["续展", "到期", "维护", "年费"]))),
    ];
  }, [score, report]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-6">
        <PillarBanner
          pillar="profile"
          hint="诊断产出的意图/行业标签会回写画像，下一步可在 /match 精准匹配律师。"
        />
        <WorkspaceCard title="IP 快速诊断" eyebrow="Core flow">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await handleSubmit(new FormData(e.currentTarget));
            }}
            className="grid gap-4"
          >
            {!prefill ? (
              <div className="flex items-center justify-center py-4">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary-500" />
              </div>
            ) : (
              <>
                <FormInput
                  name="businessName"
                  label="公司/项目名"
                  defaultValue={prefill.businessName ?? ""}
                  placeholder="公司名 / 项目名"
                />
                <FormTextarea
                  name="businessDescription"
                  label="业务描述"
                  defaultValue={prefill.businessDescription ?? ""}
                  placeholder="描述你的产品、服务、目标客群和商业场景"
                  rows={6}
                  required
                />
                <div className="grid gap-4 md:grid-cols-2">
                  <FormInput
                    name="industry"
                    label="行业"
                    defaultValue={prefill.industry ?? ""}
                    placeholder="所属行业，例如：跨境电商 / SaaS"
                  />
                  <FormInput
                    name="stage"
                    label="阶段"
                    defaultValue={prefill.stage ?? ""}
                    placeholder="企业阶段，例如：初创 / 上线前"
                  />
                </div>
              </>
            )}
            <SubmitButton loading={loading} loadingText="AI 诊断中...">
              生成 IP 保护建议
            </SubmitButton>
            <StreamingPanel text={streamingText} />
            {error ? <ErrorDisplay error={error} /> : null}
          </form>
        </WorkspaceCard>

        {report && report.normalizedPayload ? (
          <>
            <section className="rounded-lg border border-border bg-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionHeader
                  eyebrow="Overall"
                  title="整体 IP 风险画像"
                  description={report.normalizedPayload.businessType ?? "综合业务 / IP 现状分析"}
                />
                <DataTag mode={report.mode ?? "mock"} provider={report.provider ?? "mock"} />
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[300px_1fr] items-center">
                <div className="flex flex-col items-center text-error-500">
                  <RadarChart
                    axes={["商标风险", "专利缺口", "版权", "合规", "续展"]}
                    values={radarValues}
                    color="currentColor"
                    size={280}
                    rings={4}
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <span className="num-display text-xl tracking-tight text-text-primary">
                      {score}
                    </span>
                    <Badge
                      variant={
                        accent === "error"
                          ? "error"
                          : accent === "warning"
                            ? "warning"
                            : accent === "info"
                              ? "info"
                              : accent === "success"
                                ? "success"
                                : "default"
                      }
                      size="md"
                      dot
                    >
                      {riskLevel ?? "—"}
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <StatTile
                    label="优先保护资产"
                    value={priorityCount}
                    icon="assets"
                    accent="primary"
                    hint="建议立即启动保护"
                  />
                  <StatTile
                    label="风险项"
                    value={riskCount}
                    icon="alert"
                    accent={riskCount > 0 ? "error" : "success"}
                    hint={riskCount > 0 ? "查看建议行动" : "暂无明显风险"}
                  />
                  <StatTile
                    label="下一步行动"
                    value={actionCount}
                    icon="bolt"
                    accent="info"
                    hint="AI 建议的执行清单"
                  />
                  <StatTile
                    label="最高风险维度"
                    value={
                      ["商标", "专利", "版权", "合规", "续展"][
                        radarValues.indexOf(Math.max(...radarValues))
                      ]
                    }
                    icon="alert"
                    accent="error"
                    hint={`${Math.max(...radarValues)} 分`}
                  />
                </div>
              </div>
              <p className="mt-4 leading-7 text-text-primary">{report.normalizedPayload.summary}</p>
            </section>

            <div className="grid gap-4 md:grid-cols-2">
              <WorkspaceCard
                title="优先保护资产"
                eyebrow="Priority assets"
                actions={<Badge variant="primary" size="sm">{priorityCount}</Badge>}
              >
                <ul className="space-y-2 text-sm">
                  {(report.normalizedPayload.priorityAssets ?? []).map((item, i) => (
                    <li
                      key={item}
                      className="flex items-start gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2"
                    >
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-600">
                        {i + 1}
                      </span>
                      <span className="text-text-primary">{item}</span>
                    </li>
                  ))}
                </ul>
              </WorkspaceCard>

              <WorkspaceCard
                title="风险提示"
                eyebrow="Risks"
                actions={<Badge variant={riskCount > 0 ? "error" : "success"} size="sm">{riskCount}</Badge>}
              >
                {riskCount === 0 ? (
                  <p className="py-4 text-center text-sm text-text-tertiary">暂未识别到风险</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {(report.normalizedPayload.risks ?? []).map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2 rounded-md border border-error-100 bg-error-50/50 px-3 py-2"
                      >
                        <IconGlyph name="alert" size={14} className="mt-0.5 text-error-500" />
                        <span className="text-text-primary">{item}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </WorkspaceCard>
            </div>

            <WorkspaceCard
              title="下一步行动建议"
              eyebrow="Next actions"
              actions={
                <div className="flex items-center gap-2">
                  <Badge variant="info" size="sm">推荐方向：{report.normalizedPayload.recommendedTrack}</Badge>
                </div>
              }
            >
              <ol className="space-y-2">
                {(report.normalizedPayload.nextActions ?? []).map((item, i) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 rounded-md border border-border bg-surface p-3"
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${accentBgClass("info")} num-display text-xs font-semibold`}>
                      {i + 1}
                    </span>
                    <span className="text-sm leading-6 text-text-primary">{item}</span>
                  </li>
                ))}
              </ol>
              <DisclaimerBox>{report.disclaimer}</DisclaimerBox>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={`/trademark/check?categories=${(report.normalizedPayload.recommendedTrademarkCategories ?? []).join(",")}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
                >
                  <IconGlyph name="trademark" size={14} />
                  进入商标流程
                </Link>
                <Link
                  href="/assets"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-elevated"
                >
                  <IconGlyph name="assets" size={14} />
                  录入 IP 资产
                </Link>
              </div>
            </WorkspaceCard>
          </>
        ) : null}
      </div>

      {/* ===== History sidebar ===== */}
      <aside>
        <div className="sticky top-4 rounded-lg border border-border bg-surface p-4">
          <SectionHeader
            eyebrow="History"
            title="最近诊断"
            actions={<Badge variant="outline" size="sm">{history.length}</Badge>}
          />
          {history.length === 0 ? (
            <p className="mt-3 text-xs text-text-tertiary">暂无历史记录</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {history.map((h) => {
                const env = h.resultData as unknown as Envelope<DiagnosisWithRisk>;
                const rl = env?.normalizedPayload?.riskLevel;
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setReport(env)}
                      className="flex w-full items-start gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2 text-left transition-colors hover:border-border-strong"
                    >
                      <IconGlyph name="diagnosis" size={14} className="mt-0.5 text-primary-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-text-primary">
                          {env?.normalizedPayload?.businessType ?? "诊断记录"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-text-tertiary">
                          {relativeTime(h.createdAt)}
                        </p>
                      </div>
                      {rl && (
                        <Badge
                          variant={severityAccent(rl) === "error" ? "error" : severityAccent(rl) === "warning" ? "warning" : "success"}
                          size="sm"
                        >
                          {rl}
                        </Badge>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

export function PatentAssessWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<PatentResult> | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [description, setDescription] = useState("");
  const mountedRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  async function handleSubmit(formData: FormData) {
    if (loading) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    setStreamingText("");
    try {
      await fetchSSE<Envelope<PatentResult>>(
        `/api/backend/stream/patents/assess`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: String(formData.get("description") ?? "") }),
          signal: controller.signal,
        },
        {
          onToken: (token) => {
            if (mountedRef.current) setStreamingText((prev) => prev + token);
          },
          onResult: (envelope) => {
            if (!mountedRef.current) return;
            setResult(envelope);
            setStreamingText("");
          },
          onError: (msg) => {
            if (!mountedRef.current) return;
            setError(msg);
            setStreamingText("");
          },
        },
      );
    } catch (err) {
      if (!controller.signal.aborted && mountedRef.current) {
        setError(err instanceof Error ? err.message : "评估失败");
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (mountedRef.current) setLoading(false);
    }
  }

  const dimensions = useMemo(() => {
    const f = result?.normalizedPayload?.feasibility ?? "";
    const base = f === "high" ? 85 : f === "medium" ? 60 : f === "low" ? 35 : 50;
    return [
      {
        label: "新颖性",
        percent: Math.min(100, base + 5),
        color: "rgb(var(--color-primary-500))",
        hint: "novelty",
      },
      {
        label: "创造性",
        percent: Math.min(100, Math.max(0, base - 5)),
        color: "rgb(var(--color-info-500))",
        hint: "inventive",
      },
      {
        label: "实用性",
        percent: Math.min(100, base + 10),
        color: "rgb(var(--color-success-500))",
        hint: "utility",
      },
      {
        label: "综合",
        percent: Math.min(100, base),
        color: "rgb(var(--color-error-500))",
        hint: "overall",
      },
    ];
  }, [result]);

  return (
    <div className="space-y-6">
      <WorkspaceCard title="专利 / 软著评估" eyebrow="Patent & copyright">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleSubmit(new FormData(e.currentTarget));
          }}
          className="grid gap-4"
        >
          <FileUpload onTextExtracted={setDescription} label="上传技术文档，自动提取描述" />
          <FormTextarea
            name="description"
            label="技术描述"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述你的技术方案、产品功能或创新点..."
            rows={6}
            required
          />
          <SubmitButton loading={loading} loadingText="AI 评估中...">
            执行评估
          </SubmitButton>
          <StreamingPanel text={streamingText} />
          {error && <ErrorDisplay error={error} />}
        </form>
      </WorkspaceCard>

      {result && (
        <>
          <section className="rounded-lg border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader
                eyebrow="Assessment"
                title="三维度评估"
                description="基于技术方案的新颖性 / 创造性 / 实用性综合评估"
              />
              <div className="flex items-center gap-2">
                <Badge variant="info" size="sm">
                  推荐类型: {patentTypeLabel[result.normalizedPayload.recommended_type] || result.normalizedPayload.recommended_type}
                </Badge>
                <Badge
                  variant={
                    result.normalizedPayload.feasibility === "high"
                      ? "success"
                      : result.normalizedPayload.feasibility === "low"
                        ? "error"
                        : "warning"
                  }
                  size="sm"
                  dot
                >
                  可行性 {result.normalizedPayload.feasibility}
                </Badge>
                <DataTag mode={result.mode} provider={result.provider} />
              </div>
            </div>
            <div className="mt-5 rounded-lg border border-error-100 bg-gradient-to-br from-error-50/50 via-surface to-surface p-5">
              <SegmentedRings items={dimensions} size={96} strokeWidth={9} />
            </div>
          </section>

          <WorkspaceCard title="评估解读" eyebrow="Analysis">
            <p className="leading-7 text-text-primary">{result.normalizedPayload.novelty_assessment}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-border p-4">
                <p className="text-sm font-semibold text-text-primary">技术要点</p>
                <ul className="mt-3 space-y-1.5 text-sm text-text-secondary">
                  {(result.normalizedPayload.key_points ?? []).map((item, index) => (
                    <li key={index} className="flex gap-2">
                      <IconGlyph name="sparkle" size={12} className="mt-1 text-primary-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md border border-border p-4">
                <p className="text-sm font-semibold text-text-primary">需要材料</p>
                <ul className="mt-3 space-y-1.5 text-sm text-text-secondary">
                  {(result.normalizedPayload.materials_needed ?? []).map((item, index) => (
                    <li key={index} className="flex gap-2">
                      <IconGlyph name="check" size={12} className="mt-1 text-success-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <StatTile
                label="预计时间"
                value={result.normalizedPayload.estimated_timeline}
                icon="clock"
                accent="info"
              />
              <StatTile
                label="费用估算"
                value={result.normalizedPayload.cost_estimate}
                icon="chart"
                accent="warning"
              />
            </div>
            <DisclaimerBox>{result.disclaimer}</DisclaimerBox>
          </WorkspaceCard>
        </>
      )}
    </div>
  );
}

type PatentResult = {
  recommended_type: string;
  novelty_assessment: string;
  feasibility: string;
  key_points: string[];
  materials_needed: string[];
  estimated_timeline: string;
  cost_estimate: string;
  risks: string[];
};

const patentTypeLabel: Record<string, string> = {
  invention: "发明专利",
  utility_model: "实用新型",
  design: "外观设计",
  software_copyright: "软件著作权",
};
