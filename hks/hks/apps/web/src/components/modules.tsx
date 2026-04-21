"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  WorkspaceCard,
  DataTag,
  Badge,
  DisclaimerBox,
  StreamingPanel,
  SubmitButton,
  FormInput,
  FormTextarea,
  Alert,
} from "@a1plus/ui";
import { parseErrorResponse } from "@/lib/errors";
import { fetchSSE } from "@/lib/sse";
import { FileUpload } from "@/components/file-upload";
import { Sparkline } from "@/components/viz";
import {
  PageHeader,
  PillarBanner,
  SectionHeader,
  StatTile,
  KpiCard,
  IconGlyph,
  IconTabBar,
  accentBgClass,
  severityAccent,
  type Accent,
  type IconName,
} from "@/components/workspace/primitives";
import {
  RibbonBar,
  BubbleScatter,
  GaugeArc,
  BalanceScale,
  ColumnChart,
} from "@/components/workspace/viz-hero";

type Envelope<T> = {
  mode: string;
  provider: string;
  traceId: string;
  sourceRefs: Array<{ title: string; url?: string; note?: string }>;
  disclaimer: string;
  normalizedPayload: T;
};

const jsonHeaders = { "Content-Type": "application/json" };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/backend${path}`, {
    ...init,
    headers: { ...jsonHeaders, ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw parseErrorResponse(await response.text(), path);
  return response.json() as Promise<T>;
}

/**
 * Shared lifecycle helpers for all streaming workshop handlers:
 *   - ``mountedRef`` lets callbacks no-op after unmount (no state updates
 *     against an unmounted component).
 *   - ``controllerRef`` holds the in-flight AbortController so a second
 *     submission (double-click / fast retry) can cancel the first, and
 *     component unmount cancels any active stream.
 *
 * Usage:
 *   const { mountedRef, controllerRef } = useStreamingRefs();
 *   if (loading) return;
 *   controllerRef.current?.abort();
 *   const controller = new AbortController();
 *   controllerRef.current = controller;
 *   await fetchSSE(url, { ..., signal: controller.signal }, { ... });
 */
function useStreamingRefs() {
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
  return { mountedRef, controllerRef };
}

// ========================================
// Contract Review
// ========================================

type ContractRisk = { clause: string; severity: string; suggestion: string };
type ContractResult = {
  summary: string;
  risks: ContractRisk[];
  ip_clauses_found: string[];
  missing_clauses: string[];
  overall_risk: string;
};

type ClauseSuggestion = { clause: string; rationale: string; draft: string };

export function ContractWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<ContractResult> | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [contractText, setContractText] = useState("");
  const [severityTab, setSeverityTab] = useState<"all" | "high" | "medium" | "low">("all");
  const [suggestions, setSuggestions] = useState<ClauseSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const { mountedRef, controllerRef } = useStreamingRefs();

  async function handleSubmit(formData: FormData) {
    if (loading) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    setStreamingText("");
    try {
      await fetchSSE<Envelope<ContractResult>>(
        "/api/backend/stream/contracts/review",
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ contract_text: String(formData.get("contractText") ?? "") }),
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
        setError(err instanceof Error ? err.message : "审查失败");
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (mountedRef.current) setLoading(false);
    }
  }

  async function generateSuggestions() {
    if (!result) return;
    setSuggesting(true);
    try {
      const res = await request<{ suggestions: ClauseSuggestion[] }>(
        "/contracts/suggest-clauses",
        {
          method: "POST",
          body: JSON.stringify({
            missing_clauses: result.normalizedPayload?.missing_clauses ?? [],
          }),
        },
      );
      setSuggestions(res.suggestions);
    } catch {
      /* ignore */
    } finally {
      setSuggesting(false);
    }
  }

  const payload = result?.normalizedPayload;
  const risks = useMemo(
    () => payload?.risks ?? [],
    [payload],
  );
  const ipClausesFound = payload?.ip_clauses_found ?? [];
  const missingClauses = payload?.missing_clauses ?? [];
  const highCount = risks.filter((r) => r.severity === "high").length;
  const mediumCount = risks.filter((r) => r.severity === "medium").length;
  const lowCount = risks.filter((r) => r.severity === "low").length;
  const filteredRisks = useMemo(
    () => (severityTab === "all" ? risks : risks.filter((r) => r.severity === severityTab)),
    [risks, severityTab],
  );

  const overall = payload?.overall_risk;
  const overallScore = overall === "high" ? 85 : overall === "medium" ? 55 : overall === "low" ? 25 : 40;
  const overallAccent = severityAccent(overall ?? "");

  const ribbonSegments = useMemo(() => {
    if (!payload) return [];
    const ipOk = ipClausesFound.length;
    const missing = missingClauses.length;
    return [
      ...risks.map((r, i) => {
        const acc = severityAccent(r.severity);
        return {
          label: r.severity === "high" ? "高" : r.severity === "medium" ? "中" : "低",
          color:
            acc === "error"
              ? "rgb(var(--color-error-500))"
              : acc === "warning"
                ? "rgb(var(--color-warning-500))"
                : "rgb(var(--color-info-500))",
          weight: r.severity === "high" ? 3 : r.severity === "medium" ? 2 : 1,
          sublabel: `风险${i + 1}`,
        };
      }),
      ...(ipOk > 0
        ? [
            {
              label: "已有",
              color: "rgb(var(--color-success-500))",
              weight: Math.max(1, ipOk),
              sublabel: "已发现 IP 条款",
            },
          ]
        : []),
      ...(missing > 0
        ? [
            {
              label: "缺失",
              color: "rgb(var(--color-warning-300))",
              weight: Math.max(1, missing),
              sublabel: "缺失条款",
            },
          ]
        : []),
    ];
  }, [payload, risks, ipClausesFound.length, missingClauses.length]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Contract review"
        title="合同 IP 审查"
        icon="contracts"
        accent="warning"
        description="上传或粘贴合同文本，AI 自动识别 IP 条款、风险项与缺失条款。"
      />

      <PillarBanner pillar="compliance" />

      <WorkspaceCard title="合同内容" eyebrow="Input">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleSubmit(new FormData(e.currentTarget));
          }}
          className="grid gap-4"
        >
          <FileUpload onTextExtracted={setContractText} label="上传合同文件，自动提取文本" />
          <FormTextarea
            name="contractText"
            label="合同文本"
            value={contractText}
            onChange={(e) => setContractText(e.target.value)}
            placeholder="粘贴合同文本，系统将自动识别 IP 相关条款并给出风险提示..."
            rows={10}
            required
          />
          <SubmitButton loading={loading} loadingText="AI 审查中...">
            执行合同审查
          </SubmitButton>
          <StreamingPanel text={streamingText} />
          {error ? <Alert variant="error">{error}</Alert> : null}
        </form>
      </WorkspaceCard>

      {result && !payload ? (
        <Alert variant="error">
          结果解析失败：AI 返回的内容不符合预期结构，请重试或联系管理员。
        </Alert>
      ) : null}
      {result && payload ? (
        <>
          <section className="rounded-lg border border-warning-100 bg-gradient-to-br from-warning-50/50 via-surface to-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader eyebrow="Overview" title="合同条款风险带" description="按条款顺序着色 · 宽度 = 严重度权重" />
              <div className="flex items-center gap-2">
                <Badge
                  variant={overallAccent === "error" ? "error" : overallAccent === "warning" ? "warning" : overallAccent === "success" ? "success" : "default"}
                  size="md"
                  dot
                >
                  整体 · {overall ?? "—"} · {overallScore}
                </Badge>
                <DataTag mode={result.mode} provider={result.provider} />
              </div>
            </div>
            <div className="mt-5">
              {ribbonSegments.length > 0 ? (
                <RibbonBar segments={ribbonSegments} height={28} />
              ) : (
                <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-border text-xs text-text-tertiary">
                  暂无风险项
                </div>
              )}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <StatTile label="已发现 IP 条款" value={ipClausesFound.length} icon="contracts" accent="info" />
              <StatTile
                label="风险项"
                value={risks.length}
                icon="alert"
                accent={risks.length > 0 ? "error" : "success"}
                hint={`高 ${highCount} / 中 ${mediumCount} / 低 ${lowCount}`}
              />
              <StatTile
                label="缺失条款"
                value={missingClauses.length}
                icon="plus"
                accent={missingClauses.length > 0 ? "warning" : "success"}
                hint="建议补充"
              />
            </div>
            <p className="mt-4 leading-7 text-text-primary">{payload.summary}</p>
          </section>

          <WorkspaceCard
            title="风险条款"
            eyebrow="Risk clauses"
            actions={<Badge variant="outline" size="sm">{risks.length}</Badge>}
          >
            <div className="mb-3">
              <IconTabBar<"all" | "high" | "medium" | "low">
                active={severityTab}
                onChange={setSeverityTab}
                tabs={[
                  { key: "all", label: "全部", icon: "filter", count: risks.length },
                  { key: "high", label: "严重", icon: "alert", count: highCount },
                  { key: "medium", label: "中等", icon: "clock", count: mediumCount },
                  { key: "low", label: "低", icon: "check", count: lowCount },
                ]}
              />
            </div>
            {filteredRisks.length === 0 ? (
              <p className="py-4 text-center text-sm text-text-tertiary">暂无该等级风险</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredRisks.map((risk, index) => {
                  const accent = severityAccent(risk.severity);
                  return (
                    <div
                      key={index}
                      className={`rounded-lg border p-4 ${
                        accent === "error"
                          ? "border-error-100 bg-error-50/40"
                          : accent === "warning"
                            ? "border-warning-100 bg-warning-50/40"
                            : accent === "info"
                              ? "border-info-100 bg-info-50/40"
                              : "border-border bg-surface"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            accent === "error"
                              ? "error"
                              : accent === "warning"
                                ? "warning"
                                : accent === "info"
                                  ? "info"
                                  : "default"
                          }
                          size="sm"
                          dot
                        >
                          {risk.severity}
                        </Badge>
                        <p className="text-sm font-medium text-text-primary">{risk.clause}</p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-text-secondary">{risk.suggestion}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </WorkspaceCard>

          <div className="grid gap-4 md:grid-cols-2">
            <WorkspaceCard
              title="已发现 IP 条款"
              eyebrow="Found"
              actions={<Badge variant="info" size="sm">{ipClausesFound.length}</Badge>}
            >
              <ul className="space-y-2">
                {ipClausesFound.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 rounded-md border border-border bg-surface-elevated px-3 py-2 text-sm">
                    <IconGlyph name="check" size={12} className="mt-1 text-success-500" />
                    <span className="text-text-primary">{item}</span>
                  </li>
                ))}
              </ul>
            </WorkspaceCard>

            <WorkspaceCard
              title="建议补充条款"
              eyebrow="Missing"
              actions={
                missingClauses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void generateSuggestions()}
                    disabled={suggesting}
                    className="inline-flex h-7 items-center gap-1 rounded-md bg-primary-600 px-2 text-xs font-medium text-text-inverse transition-colors hover:bg-primary-700 disabled:opacity-50"
                  >
                    <IconGlyph name="sparkle" size={12} />
                    {suggesting ? "生成中…" : "一键生成补充建议"}
                  </button>
                )
              }
            >
              {missingClauses.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-tertiary">未发现明显缺失</p>
              ) : (
                <div className="rounded-md border border-dashed border-warning-200 bg-warning-50/40 p-3">
                  <div className="flex flex-wrap gap-2">
                    {missingClauses.map((item, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1.5 rounded-full border border-warning-200 bg-surface px-3 py-1 text-xs font-medium text-warning-700 shadow-sm transition-colors hover:bg-warning-100/50"
                      >
                        <IconGlyph name="plus" size={11} />
                        {item}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-warning-700">
                    建议将以上条款补充至合同正文或附录中，点击&ldquo;一键生成补充建议&rdquo;获取 AI 草拟文本。
                  </p>
                </div>
              )}
            </WorkspaceCard>
          </div>

          {suggestions.length > 0 && (
            <WorkspaceCard title="AI 补充条款建议" eyebrow="Draft" actions={<Badge variant="primary" size="sm">{suggestions.length}</Badge>}>
              <div className="space-y-3">
                {suggestions.map((s, i) => (
                  <div key={i} className="rounded-lg border border-border bg-surface p-4">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-md ${accentBgClass("primary")} num-display text-xs font-semibold`}>
                        {i + 1}
                      </span>
                      <p className="text-sm font-semibold text-text-primary">{s.clause}</p>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-text-tertiary">
                      <span className="font-medium text-text-secondary">理由：</span>
                      {s.rationale}
                    </p>
                    <pre className="mt-3 whitespace-pre-wrap rounded-md border border-dashed border-border bg-surface-elevated/60 p-3 text-xs leading-6 text-text-primary">
                      {s.draft}
                    </pre>
                  </div>
                ))}
              </div>
            </WorkspaceCard>
          )}

          <DisclaimerBox>{result.disclaimer}</DisclaimerBox>
        </>
      ) : null}
    </div>
  );
}

// ========================================
// Patent Assessment (kept simple - enhanced in diagnosis.tsx)
// ========================================

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

export function PatentWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<PatentResult> | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [description, setDescription] = useState("");
  const { mountedRef, controllerRef } = useStreamingRefs();

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
        "/api/backend/stream/patents/assess",
        {
          method: "POST",
          headers: jsonHeaders,
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

  const typeLabel: Record<string, string> = {
    invention: "发明专利",
    utility_model: "实用新型",
    design: "外观设计",
    software_copyright: "软件著作权",
  };

  return (
    <div className="space-y-6">
      <WorkspaceCard title="专利/软著评估" eyebrow="Patent & Copyright">
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
          {error ? <p className="text-sm text-error-500">{error}</p> : null}
        </form>
      </WorkspaceCard>

      {result ? (
        <>
          <WorkspaceCard
            title="评估结果"
            eyebrow="Result"
            actions={<DataTag mode={result.mode} provider={result.provider} />}
          >
            <div className="flex items-center gap-3">
              <Badge variant="info" size="sm">
                推荐类型: {typeLabel[result.normalizedPayload.recommended_type] || result.normalizedPayload.recommended_type}
              </Badge>
              <Badge
                variant={result.normalizedPayload.feasibility === "high" ? "success" : "warning"}
                size="sm"
              >
                可行性: {result.normalizedPayload.feasibility}
              </Badge>
            </div>
            <p className="mt-4 leading-7 text-text-primary">{result.normalizedPayload.novelty_assessment}</p>
            <DisclaimerBox>{result.disclaimer}</DisclaimerBox>
          </WorkspaceCard>
          <div className="rounded-md border border-border bg-surface-elevated p-4">
            <h3 className="text-base font-semibold text-text-primary">建议查看资产台账</h3>
            <p className="mt-1.5 text-sm text-text-secondary">专利评估完成，建议查看资产台账确认相关资产状态。</p>
            <Link
              href="/assets"
              className="mt-3 inline-block rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-600 transition-colors"
            >
              前往资产台账
            </Link>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ========================================
// Policy Digest
// ========================================

type Policy = {
  title: string;
  summary: string;
  impact: string;
  effective_date: string;
  source: string;
};

type PolicyResult = {
  industry: string;
  policies: Policy[];
  key_changes: string[];
  action_items: string[];
  compliance_notes: string;
};

export const INDUSTRY_CHIPS = [
  "跨境电商",
  "SaaS",
  "医疗器械",
  "新能源",
  "消费电子",
  "教育科技",
  "AI",
];

export function PolicyWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<PolicyResult> | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [industry, setIndustry] = useState("");
  const { mountedRef, controllerRef } = useStreamingRefs();

  async function handleSubmit(value?: string) {
    const target = (value ?? industry).trim();
    if (!target) return;
    if (loading) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    setStreamingText("");
    try {
      await fetchSSE<Envelope<PolicyResult>>(
        "/api/backend/stream/policies/digest",
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ industry: target }),
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
        setError(err instanceof Error ? err.message : "获取失败");
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (mountedRef.current) setLoading(false);
    }
  }

  const policyPayload = result?.normalizedPayload;
  const policies = useMemo(() => policyPayload?.policies ?? [], [policyPayload]);
  const highImpact = policies.filter((p) => p.impact === "high").length;
  const mediumImpact = policies.filter((p) => p.impact === "medium").length;
  const actionItems = policyPayload?.action_items ?? [];
  const keyChanges = policyPayload?.key_changes ?? [];
  const complianceNotes = policyPayload?.compliance_notes ?? "";
  const policyIndustry = policyPayload?.industry ?? industry;

  // Build quadrant bubble scatter: X = 影响度, Y = 紧急度 (derived from effective date proximity)
  const quadrantPoints = useMemo(() => {
    const now = Date.now();
    const raw = policies.map((p, i) => {
      const impactX =
        p.impact === "high" ? 78 : p.impact === "medium" ? 55 : p.impact === "low" ? 28 : 40;
      const date = new Date(p.effective_date).getTime();
      let urgencyY = 50;
      if (!Number.isNaN(date)) {
        const days = (date - now) / 86_400_000;
        // Higher Y when date is sooner (or already passed recently) → urgent
        if (days < 0 && days > -90) urgencyY = 85;
        else if (days >= 0 && days < 30) urgencyY = 80;
        else if (days < 90) urgencyY = 60;
        else if (days < 180) urgencyY = 40;
        else urgencyY = 25;
      }
      const acc = severityAccent(p.impact);
      const color =
        acc === "error"
          ? "rgb(var(--color-error-500))"
          : acc === "warning"
            ? "rgb(var(--color-warning-500))"
            : "rgb(var(--color-info-500))";
      return {
        x: impactX,
        y: urgencyY,
        r: 11,
        color,
        index: i + 1,
      };
    });

    // Group by bucket so coincident policies spread evenly around their cell
    // instead of stacking on top of each other (prevents label/bubble overlap).
    const buckets = new Map<string, number[]>();
    raw.forEach((pt, idx) => {
      const key = `${pt.x}|${pt.y}`;
      const arr = buckets.get(key);
      if (arr) arr.push(idx);
      else buckets.set(key, [idx]);
    });

    const jittered = raw.map((pt) => ({ ...pt }));
    buckets.forEach((idxs) => {
      if (idxs.length <= 1) return;
      const radius = 6; // in chart units (0..100)
      idxs.forEach((idx, k) => {
        const angle = (k / idxs.length) * Math.PI * 2;
        jittered[idx].x = Math.max(2, Math.min(98, raw[idx].x + Math.cos(angle) * radius));
        jittered[idx].y = Math.max(2, Math.min(98, raw[idx].y + Math.sin(angle) * radius));
      });
    });
    return jittered;
  }, [policies]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Policy digest"
        title="行业政策速递"
        icon="policies"
        accent="info"
        description="输入行业关键字，AI 汇总最新监管动向与合规要点。"
      />

      <PillarBanner
        pillar="compliance"
        hint="政策命中的高影响项会触发场景推送，并作为合规订阅的内容源。"
      />

      <WorkspaceCard title="选择行业" eyebrow="Industry">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleSubmit();
          }}
          className="grid gap-4"
        >
          <FormInput
            name="industry"
            label="行业"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="输入行业，例如：跨境电商 / SaaS / 医疗"
            required
          />
          <div className="flex flex-wrap gap-2">
            {INDUSTRY_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { setIndustry(c); void handleSubmit(c); }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
                  industry === c
                    ? `${accentBgClass("primary")} border-transparent`
                    : "border-border bg-surface text-text-secondary hover:bg-surface-elevated"
                }`}
              >
                <IconGlyph name="target" size={12} />
                {c}
              </button>
            ))}
          </div>
          <SubmitButton loading={loading} loadingText="获取中...">
            获取政策摘要
          </SubmitButton>
          <StreamingPanel text={streamingText} />
          {error ? <p className="text-sm text-error-500">{error}</p> : null}
        </form>
      </WorkspaceCard>

      {result && !policyPayload ? (
        <Alert variant="error">
          结果解析失败：AI 返回的内容不符合预期结构，请重试或联系管理员。
        </Alert>
      ) : null}
      {result && policyPayload ? (
        <>
          <section className="rounded-lg border border-info-100 bg-gradient-to-br from-info-50/40 via-surface to-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SectionHeader
                eyebrow="Impact matrix"
                title={`${policyIndustry} · 政策影响矩阵`}
                description="横轴 = 影响度 · 纵轴 = 紧急度 · 气泡面积 = 信息量"
              />
              <DataTag mode={result.mode} provider={result.provider} />
            </div>
            <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
              <div className="relative rounded-md border border-border bg-surface p-3">
                {quadrantPoints.length > 0 ? (
                  <BubbleScatter
                    points={quadrantPoints}
                    width={420}
                    height={260}
                    xLabel="影响度 →"
                    yLabel="紧急度 →"
                    quadrants
                    quadrantLabels={["关注", "优先处理", "次要", "跟进"]}
                  />
                ) : (
                  <div className="flex h-[260px] items-center justify-center text-xs text-text-tertiary">
                    暂无政策数据
                  </div>
                )}
                <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-1 text-[10px] text-text-tertiary">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-error-500" />高影响
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-warning-500" />中影响
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-info-500" />低影响
                  </span>
                </div>
              </div>
              <div className="grid content-start gap-3 sm:grid-cols-2">
                <StatTile label="政策数量" value={policies.length} icon="policies" accent="info" />
                <StatTile label="高影响" value={highImpact} icon="alert" accent="error" />
                <StatTile label="中影响" value={mediumImpact} icon="clock" accent="warning" />
                <StatTile label="待行动项" value={actionItems.length} icon="bolt" accent="primary" />
              </div>
            </div>
            {policies.length > 0 && (
              <ol className="mt-4 grid gap-1.5 text-[11px] leading-5 text-text-secondary sm:grid-cols-2 lg:grid-cols-3">
                {policies.map((p, i) => {
                  const acc = severityAccent(p.impact);
                  const dotClass =
                    acc === "error"
                      ? "bg-error-500"
                      : acc === "warning"
                        ? "bg-warning-500"
                        : "bg-info-500";
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-text-inverse ${dotClass}`}
                      >
                        {i + 1}
                      </span>
                      <span className="truncate text-text-primary" title={p.title}>
                        {p.title}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <WorkspaceCard
            title="政策列表"
            eyebrow="Policies"
            actions={<Badge variant="outline" size="sm">{policies.length}</Badge>}
          >
            {policies.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-tertiary">暂无政策</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {policies.map((policy, index) => {
                  const accent = severityAccent(policy.impact);
                  const borderColor =
                    accent === "error"
                      ? "border-l-error-500"
                      : accent === "warning"
                        ? "border-l-warning-500"
                        : "border-l-info-500";
                  return (
                    <div
                      key={index}
                      className={`rounded-lg border border-l-4 border-border bg-surface p-4 transition-colors hover:border-border-strong ${borderColor}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-text-primary">{policy.title}</p>
                          <p className="mt-0.5 text-[11px] text-text-tertiary">
                            {policy.source} · 生效 {policy.effective_date}
                          </p>
                        </div>
                        <Badge
                          variant={accent === "error" ? "error" : accent === "warning" ? "warning" : "info"}
                          size="sm"
                          dot
                        >
                          影响 · {policy.impact}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs leading-6 text-text-secondary">{policy.summary}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </WorkspaceCard>

          {actionItems.length > 0 && (
            <div className="rounded-lg border border-info-100 bg-info-50/50 p-5">
              <SectionHeader
                eyebrow="Action required"
                title="待行动事项"
                actions={<Badge variant="info" size="sm">{actionItems.length}</Badge>}
              />
              <ul className="mt-3 grid gap-2 md:grid-cols-2">
                {actionItems.map((item, index) => (
                  <li key={index} className="flex items-start gap-2 rounded-md bg-surface px-3 py-2 text-sm">
                    <IconGlyph name="bolt" size={14} className="mt-0.5 text-info-500" />
                    <span className="text-text-primary">{item}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/diagnosis"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary-600 px-3 text-xs font-medium text-text-inverse transition-colors hover:bg-primary-700"
                >
                  <IconGlyph name="diagnosis" size={12} />
                  运行 IP 诊断
                </Link>
                <Link
                  href="/contracts"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-primary transition-colors hover:bg-surface-elevated"
                >
                  <IconGlyph name="contracts" size={12} />
                  审查合同
                </Link>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <WorkspaceCard title="关键变化" eyebrow="Key changes">
              <ul className="space-y-2">
                {keyChanges.map((item, index) => (
                  <li key={index} className="flex gap-2 text-sm text-text-secondary">
                    <IconGlyph name="sparkle" size={12} className="mt-1 text-warning-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </WorkspaceCard>
            <WorkspaceCard title="合规说明" eyebrow="Compliance">
              <p className="text-sm leading-7 text-text-secondary">
                {complianceNotes}
              </p>
            </WorkspaceCard>
          </div>

          <DisclaimerBox>{result.disclaimer}</DisclaimerBox>
        </>
      ) : null}
    </div>
  );
}

// ========================================
// Due Diligence
// ========================================

type DueDiligenceResult = {
  company: string;
  ip_portfolio: { trademarks: number; patents: number; copyrights: number; trade_secrets: string };
  strengths: string[];
  risks: Array<{ risk: string; severity: string; mitigation: string }>;
  valuation_factors: string[];
  recommendations: string[];
  overall_assessment: string;
};

const CHECKLIST = [
  "商标证书与转让协议",
  "专利证书与授权文件",
  "著作权与软件登记证书",
  "核心员工竞业限制",
  "合作方 IP 归属约定",
  "IP 评估与财务报告",
];

function pseudoSeries(seed: number, len = 12, baseMin = 2, baseMax = 8): number[] {
  const arr: number[] = [];
  for (let i = 0; i < len; i++) {
    const v = baseMin + ((Math.sin(i * 1.3 + seed) + 1) / 2) * (baseMax - baseMin) + i * 0.2;
    arr.push(Math.max(0, Math.round(v * 10) / 10));
  }
  return arr;
}

export function DueDiligenceWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<DueDiligenceResult> | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const { mountedRef, controllerRef } = useStreamingRefs();

  async function handleSubmit(formData: FormData) {
    if (loading) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    setStreamingText("");
    try {
      await fetchSSE<Envelope<DueDiligenceResult>>(
        "/api/backend/stream/due-diligence/investigate",
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ company_name: String(formData.get("companyName") ?? "") }),
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
        setError(err instanceof Error ? err.message : "尽调失败");
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (mountedRef.current) setLoading(false);
    }
  }

  const payload = result?.normalizedPayload;
  const portfolio = payload?.ip_portfolio;
  const totalIp = portfolio ? portfolio.trademarks + portfolio.patents + portfolio.copyrights : 0;

  const assessment = payload?.overall_assessment;
  const healthScore =
    assessment === "high"
      ? 85
      : assessment === "medium"
        ? 60
        : assessment === "low"
          ? 30
          : 50;
  const healthAccent: Accent =
    assessment === "high" ? "success" : assessment === "medium" ? "warning" : assessment === "low" ? "error" : "info";
  const healthColorCls =
    healthAccent === "success"
      ? "text-success-500"
      : healthAccent === "warning"
        ? "text-warning-500"
        : healthAccent === "error"
          ? "text-error-500"
          : "text-info-500";

  const dimensions = useMemo(() => {
    if (!portfolio) return [];
    return [
      { label: "商标厚度", value: Math.min(100, portfolio.trademarks * 10), color: "rgb(var(--color-primary-600))" },
      { label: "专利布局", value: Math.min(100, portfolio.patents * 15), color: "rgb(var(--color-info-500))" },
      { label: "版权 / 软著", value: Math.min(100, portfolio.copyrights * 20), color: "rgb(var(--color-warning-500))" },
      { label: "商业秘密", value: portfolio.trade_secrets.length > 20 ? 80 : 50, color: "rgb(var(--color-success-500))" },
      { label: "合规健康", value: healthScore, color: "rgb(var(--color-error-500))" },
    ];
  }, [portfolio, healthScore]);

  const checklistDone = CHECKLIST.filter((c) => checklist[c]).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Due diligence"
        title="融资 IP 尽调"
        icon="due-diligence"
        accent="success"
        description="一次性梳理目标公司的 IP 布局、优势与风险，生成可交付的尽调要点。"
        actions={
          payload && (
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-elevated"
            >
              <IconGlyph name="download" size={14} />
              导出 / 打印
            </button>
          )
        }
      />

      <PillarBanner pillar="consult" />

      <WorkspaceCard title="目标公司" eyebrow="Target">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await handleSubmit(new FormData(e.currentTarget));
          }}
          className="grid gap-4"
        >
          <FormInput name="companyName" label="目标公司" placeholder="输入目标公司名称" required />
          <SubmitButton loading={loading} loadingText="AI 分析中...">
            执行 IP 尽调
          </SubmitButton>
          <StreamingPanel text={streamingText} />
          {error ? <p className="text-sm text-error-500">{error}</p> : null}
        </form>
      </WorkspaceCard>

      {result && !payload ? (
        <Alert variant="error">
          结果解析失败：AI 返回的内容不符合预期结构，请重试或联系管理员。
        </Alert>
      ) : null}
      {payload && portfolio ? (
        <>
          <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="综合分"
              value={healthScore}
              accent={healthAccent}
              icon="chart"
              series={pseudoSeries(0, 12, 50, 90)}
              hint={`${payload.company} · ${assessment ?? ""}`}
            />
            <KpiCard
              label="商标"
              value={portfolio.trademarks}
              accent="primary"
              icon="trademark"
              series={pseudoSeries(1, 12, 1, portfolio.trademarks + 2)}
            />
            <KpiCard
              label="专利"
              value={portfolio.patents}
              accent="info"
              icon="patent"
              series={pseudoSeries(2, 12, 0, portfolio.patents + 2)}
            />
            <KpiCard
              label="版权 / 软著"
              value={portfolio.copyrights}
              accent="warning"
              icon="copyright"
              series={pseudoSeries(3, 12, 0, portfolio.copyrights + 2)}
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-lg border border-success-100 bg-gradient-to-br from-success-50/40 via-surface to-surface p-5">
              <SectionHeader eyebrow="Health gauge" title="整体 IP 健康度" description={payload.company} />
              <div className="mt-4 flex flex-wrap items-center gap-5">
                <div className={healthColorCls}>
                  <GaugeArc
                    value={healthScore}
                    size={200}
                    strokeWidth={14}
                    color="currentColor"
                    track="rgb(var(--color-border) / 0.8)"
                    thresholds={[
                      { at: 40, color: "rgb(var(--color-error-500))" },
                      { at: 70, color: "rgb(var(--color-warning-500))" },
                      { at: 100, color: "rgb(var(--color-success-500))" },
                    ]}
                    valueLabel={
                      <span className="num-display text-3xl tracking-tight text-text-primary">
                        {healthScore}
                      </span>
                    }
                    caption={<span className="text-xs text-text-tertiary">Health · {assessment ?? "—"}</span>}
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm leading-6 text-text-secondary">
                    IP 资产共 <span className="font-semibold text-text-primary">{totalIp}</span> 项；风险{" "}
                    <span className="font-semibold text-error-600">{payload.risks.length}</span> 条，优势{" "}
                    <span className="font-semibold text-success-600">{payload.strengths.length}</span> 条。
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-surface p-5">
              <SectionHeader eyebrow="Dimensions" title="5 维能力评估" description="柱状呈现各维度得分" />
              <div className="mt-4 text-success-600">
                <ColumnChart
                  data={dimensions.map((d) => d.value)}
                  labels={dimensions.map((d) => d.label)}
                  color="currentColor"
                  trackColor="rgb(var(--color-border) / 0.4)"
                  width={520}
                  height={200}
                  highlight={dimensions.reduce(
                    (iMax, d, i, arr) => (d.value > (arr[iMax]?.value ?? 0) ? i : iMax),
                    0,
                  )}
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-text-tertiary">
                  {dimensions.map((d) => (
                    <span key={d.label} className="inline-flex items-center gap-1">
                      <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                      {d.label}
                    </span>
                  ))}
                </div>
                <BalanceScale
                  left={payload.strengths.length}
                  right={payload.risks.length}
                  leftLabel="优势"
                  rightLabel="风险"
                  width={140}
                  height={80}
                />
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-success-100 bg-success-50/40 p-5">
              <SectionHeader eyebrow="Strengths" title="IP 优势" actions={<Badge variant="success" size="sm">{payload.strengths.length}</Badge>} />
              <ul className="mt-3 space-y-2">
                {payload.strengths.map((item, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 rounded-md border border-success-100 bg-surface px-3 py-2 text-sm text-text-primary"
                  >
                    <IconGlyph name="check" size={12} className="mt-1 text-success-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-error-100 bg-error-50/40 p-5">
              <SectionHeader
                eyebrow="Risks"
                title="风险项"
                actions={<Badge variant="error" size="sm">{payload.risks.length}</Badge>}
              />
              <ul className="mt-3 space-y-2">
                {payload.risks.map((risk, index) => {
                  const accent = severityAccent(risk.severity);
                  return (
                    <li
                      key={index}
                      className="rounded-md border border-error-100 bg-surface p-3 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={accent === "error" ? "error" : accent === "warning" ? "warning" : "info"}
                          size="sm"
                          dot
                        >
                          {risk.severity}
                        </Badge>
                        <p className="font-medium text-text-primary">{risk.risk}</p>
                      </div>
                      <p className="mt-1 text-xs leading-6 text-text-secondary">{risk.mitigation}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>

          <WorkspaceCard
            title="投资准备清单"
            eyebrow="Checklist"
            actions={
              <Badge variant={checklistDone === CHECKLIST.length ? "success" : "warning"} size="sm">
                {checklistDone}/{CHECKLIST.length}
              </Badge>
            }
          >
            <div className="grid gap-2 md:grid-cols-2">
              {CHECKLIST.map((item) => {
                const checked = !!checklist[item];
                return (
                  <label
                    key={item}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                      checked
                        ? "border-success-100 bg-success-50/60 text-success-700"
                        : "border-border bg-surface text-text-primary hover:bg-surface-elevated"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setChecklist((prev) => ({ ...prev, [item]: !prev[item] }))}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary-500 focus:ring-primary-500/20"
                    />
                    <span className={checked ? "line-through decoration-success-500/40" : ""}>
                      {item}
                    </span>
                  </label>
                );
              })}
            </div>
          </WorkspaceCard>

          <WorkspaceCard title="建议行动" eyebrow="Recommendations">
            <ol className="space-y-2">
              {(payload.recommendations ?? []).map((item, index) => {
                const icons: IconName[] = ["target", "bolt", "sparkle", "shield", "edit"];
                const icon = icons[index % icons.length];
                return (
                  <li
                    key={index}
                    className="flex items-start gap-3 rounded-md border border-border bg-surface p-3"
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${accentBgClass("primary")}`}>
                      <IconGlyph name={icon} size={12} />
                    </span>
                    <span className="text-sm leading-6 text-text-primary">{item}</span>
                  </li>
                );
              })}
            </ol>
          </WorkspaceCard>

          <DisclaimerBox>{result!.disclaimer}</DisclaimerBox>

          <div className="rounded-lg border border-primary-100 bg-primary-50/60 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  <span className="mr-1.5 text-primary-600">→</span>
                  下一步：查看资产台账
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  尽调报告已生成，建议结合资产台账确认最新状态并补齐缺失文件。
                </p>
              </div>
              <Link
                href="/assets"
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
              >
                <IconGlyph name="assets" size={14} />
                前往资产台账
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
