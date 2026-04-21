"use client";

/**
 * LitigationPanel — 诉讼风险预测与策略推演。
 * 三栏布局：案情输入 / 预测仪表盘（胜诉率 + 金额 + 周期 + 策略） / 证据清单 + 相似判例。
 * 拖动证据充分度滑杆或勾选证据项会实时调用 /litigation/.../simulate 刷新预测。
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@a1plus/ui";
import {
  PageHeader,
  SectionHeader,
  EmptyHero,
  StatTile,
  IconGlyph,
  SeverityPill,
  type Accent,
} from "./primitives";
import { ErrorDisplay, request } from "./shared";
import { DonutRing } from "@/components/viz";
import { ApplicationError } from "@/lib/errors";

type Strategy = {
  name: string;
  score: number;
  rationale: string;
  recommended?: boolean;
  timeline_days?: number;
  cost_range?: string;
};

type EvidenceItem = {
  title: string;
  category: string;
  rationale: string;
  secured: boolean;
  weight: number;
};

type ProbabilityFactor = {
  name: string;
  label: string;
  delta: number;
};

type Precedent = {
  id?: string;
  title: string;
  case_no: string | null;
  court: string | null;
  year: number | null;
  outcome: string | null;
  similarity: number;
  takeaway: string | null;
  url: string | null;
};

type Prediction = {
  id: string;
  case_id: string;
  win_probability: number;
  risk_level: "low" | "medium" | "high" | string;
  headline: string | null;
  money_low: number;
  money_high: number;
  money_currency: string;
  duration_days_low: number;
  duration_days_high: number;
  strategies: Strategy[];
  evidence_checklist: EvidenceItem[];
  probability_factors: ProbabilityFactor[];
  rationale: string | null;
  source_mode: string;
  precedents: Precedent[];
  created_at?: string | null;
};

type CaseRow = {
  id: string;
  title: string;
  case_type: string;
  role: string;
  jurisdiction: string | null;
  summary: string;
  evidence_score: number;
  claim_amount: number | null;
  party_scale: string | null;
  extras: Record<string, unknown>;
  status: string;
  created_at?: string | null;
  prediction?: Prediction | null;
};

type CasePayload = {
  title: string;
  case_type: string;
  role: "plaintiff" | "defendant";
  jurisdiction?: string;
  summary: string;
  evidence_score: number;
  claim_amount?: number;
  opponent_scale?: string;
  has_expert_witness?: boolean;
  prior_negotiation?: boolean;
};

const CASE_TYPES: Array<{ value: string; label: string }> = [
  { value: "trademark_infringement", label: "商标侵权" },
  { value: "patent_infringement", label: "专利侵权" },
  { value: "copyright_infringement", label: "著作权侵权" },
  { value: "unfair_competition", label: "不正当竞争" },
  { value: "ownership_dispute", label: "权属纠纷" },
  { value: "trademark_opposition", label: "异议/驳回复审" },
];

const JURISDICTION_OPTIONS = [
  "北京知识产权法院",
  "上海知识产权法院",
  "广州知识产权法院",
  "海南自由贸易港知识产权法院",
  "最高人民法院知识产权法庭",
  "杭州互联网法院",
  "深圳",
  "其他中级人民法院",
  "基层人民法院",
];

const OPPONENT_SCALE = [
  { value: "individual", label: "个人" },
  { value: "startup", label: "创业公司" },
  { value: "sme", label: "中小企业" },
  { value: "enterprise", label: "大型企业" },
  { value: "listed", label: "上市公司" },
];

const RISK_ACCENT: Record<string, Accent> = {
  low: "success",
  medium: "warning",
  high: "error",
};

const RISK_LABEL: Record<string, string> = {
  low: "低风险 · 建议起诉",
  medium: "中风险 · 需补强",
  high: "高风险 · 建议和解",
};

const DEMO_SCENARIOS: Array<{ key: string; label: string; payload: CasePayload }> = [
  {
    key: "A",
    label: "案情 A · 商标侵权被告",
    payload: {
      title: "被诉商标侵权 · 电商类目",
      case_type: "trademark_infringement",
      role: "defendant",
      jurisdiction: "上海知识产权法院",
      summary: "我方为天猫店铺，被品牌方指控销售近似标识商品，对方索赔 80 万，尚未应诉。",
      evidence_score: 3,
      claim_amount: 800_000,
      opponent_scale: "enterprise",
      prior_negotiation: false,
    },
  },
  {
    key: "B",
    label: "案情 B · 专利侵权原告",
    payload: {
      title: "起诉竞品专利侵权 · 消费电子",
      case_type: "patent_infringement",
      role: "plaintiff",
      jurisdiction: "最高人民法院知识产权法庭",
      summary: "我方核心结构专利被竞品仿制，产品铺货 18 个月，已做公证保全并聘请专家出具比对意见。",
      evidence_score: 9,
      claim_amount: 5_000_000,
      opponent_scale: "sme",
      has_expert_witness: true,
      prior_negotiation: true,
    },
  },
  {
    key: "C",
    label: "案情 C · 著作权纠纷原告",
    payload: {
      title: "短视频平台搬运索赔",
      case_type: "copyright_infringement",
      role: "plaintiff",
      jurisdiction: "杭州互联网法院",
      summary: "我方原创视频被某 MCN 搬运，单条播放 400 万，已固定 20 条侵权链接，未走过协商。",
      evidence_score: 6,
      claim_amount: 300_000,
      opponent_scale: "enterprise",
    },
  },
];

export function LitigationPanel() {
  return (
    <Suspense fallback={null}>
      <LitigationInner />
    </Suspense>
  );
}

function LitigationInner() {
  const params = useSearchParams();
  const initialCaseId = params.get("case_id") ?? undefined;
  const prefillSummary = params.get("summary") ?? "";

  const [form, setForm] = useState<CasePayload>({
    title: "未命名案件",
    case_type: "trademark_infringement",
    role: "plaintiff",
    jurisdiction: "北京知识产权法院",
    summary: prefillSummary,
    evidence_score: 5,
    opponent_scale: "sme",
    has_expert_witness: false,
    prior_negotiation: false,
  });
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | undefined>(initialCaseId);
  const [activePrediction, setActivePrediction] = useState<Prediction | null>(null);
  const [simulated, setSimulated] = useState<Prediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | ApplicationError | null>(null);

  // Active prediction view (either the frozen one or the simulated overlay)
  const view: Prediction | null = simulated ?? activePrediction;

  const loadCases = useCallback(async () => {
    try {
      const res = await request<{ cases: CaseRow[] }>("/litigation/cases");
      setCases(res.cases || []);
      if (!activeCaseId && res.cases?.length) {
        const first = res.cases[0];
        setActiveCaseId(first.id);
        if (first.prediction) setActivePrediction(first.prediction);
      }
    } catch (e) {
      if (e instanceof ApplicationError) setError(e);
    }
  }, [activeCaseId]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  useEffect(() => {
    if (!activeCaseId) return;
    (async () => {
      try {
        const res = await request<{ case: CaseRow }>(`/litigation/cases/${activeCaseId}`);
        if (res.case?.prediction) {
          setActivePrediction(res.case.prediction);
          setSimulated(null);
          // sync form with active case so evidence slider controls the same case
          const extras = (res.case.extras ?? {}) as Record<string, unknown>;
          setForm({
            title: res.case.title,
            case_type: res.case.case_type,
            role: (res.case.role as "plaintiff" | "defendant") || "plaintiff",
            jurisdiction: res.case.jurisdiction ?? undefined,
            summary: res.case.summary,
            evidence_score: res.case.evidence_score ?? 5,
            claim_amount: res.case.claim_amount ?? undefined,
            opponent_scale: (extras.opponent_scale as string) ?? "sme",
            has_expert_witness: Boolean(extras.has_expert_witness),
            prior_negotiation: Boolean(extras.prior_negotiation),
          });
        }
      } catch (e) {
        if (e instanceof ApplicationError) setError(e);
      }
    })();
  }, [activeCaseId]);

  const runPrediction = useCallback(async () => {
    if (!form.summary?.trim()) {
      setError("请先描述案情要点。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await request<{ case: CaseRow }>(`/litigation/quick`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      setActiveCaseId(res.case.id);
      if (res.case.prediction) setActivePrediction(res.case.prediction);
      setSimulated(null);
      await loadCases();
    } catch (e) {
      if (e instanceof ApplicationError) setError(e);
      else setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [form, loadCases]);

  const simulate = useCallback(
    async (overrides: Partial<CasePayload>) => {
      if (!activeCaseId || !activePrediction) return;
      try {
        const res = await request<Prediction & { adjusted_probability: number; base_probability: number; delta: number }>(
          `/litigation/cases/${activeCaseId}/simulate`,
          {
            method: "POST",
            body: JSON.stringify({ overrides, persist: false }),
          },
        );
        // Normalize simulate response into Prediction shape. Critically, we
        // overwrite `rationale` / `evidence_checklist` / `headline` from the
        // backend so the text and evidence ticks track the live probability
        // instead of staying frozen on the persisted prediction.
        const sim = res as Prediction & {
          adjusted_probability?: number;
          rationale?: string | null;
          evidence_checklist?: Prediction["evidence_checklist"];
        };
        setSimulated((prev) => {
          // Preserve the user's "已取证 / 待补" toggles when the server returns
          // the same checklist shape — the backend regenerates the list purely
          // from case_type + role + score, so it doesn't know which boxes the
          // user just ticked.
          const currentChecklist = (prev ?? activePrediction).evidence_checklist ?? [];
          const serverChecklist = sim.evidence_checklist ?? [];
          const mergedChecklist = serverChecklist.length === currentChecklist.length
            ? serverChecklist.map((item, i) => ({ ...item, secured: currentChecklist[i]?.secured ?? item.secured }))
            : serverChecklist.length
              ? serverChecklist
              : currentChecklist;
          return {
            ...activePrediction,
            win_probability: sim.adjusted_probability ?? sim.win_probability,
            risk_level: sim.risk_level ?? activePrediction.risk_level,
            headline: sim.headline ?? activePrediction.headline,
            rationale: sim.rationale ?? activePrediction.rationale,
            evidence_checklist: mergedChecklist,
            money_low: sim.money_low ?? activePrediction.money_low,
            money_high: sim.money_high ?? activePrediction.money_high,
            duration_days_low: sim.duration_days_low ?? activePrediction.duration_days_low,
            duration_days_high: sim.duration_days_high ?? activePrediction.duration_days_high,
            strategies: sim.strategies?.length ? sim.strategies : activePrediction.strategies,
            probability_factors: sim.probability_factors ?? activePrediction.probability_factors,
          };
        });
      } catch {
        /* silent — slider spam should not surface errors */
      }
    },
    [activeCaseId, activePrediction],
  );

  const toggleEvidence = useCallback(
    (idx: number) => {
      if (!view) return;
      const next = view.evidence_checklist.map((item, i) =>
        i === idx ? { ...item, secured: !item.secured } : item,
      );
      const securedCount = next.filter((e) => e.secured).length;
      const total = next.length || 1;
      const newScore = Math.round((securedCount / total) * 10);
      setForm((f) => ({ ...f, evidence_score: newScore }));
      // optimistic local update so the checkbox flips instantly
      setSimulated({
        ...(simulated ?? activePrediction!),
        evidence_checklist: next,
      });
      simulate({ evidence_score: newScore });
    },
    [view, simulated, activePrediction, simulate],
  );

  const onSliderChange = useCallback(
    (value: number) => {
      setForm((f) => ({ ...f, evidence_score: value }));
      if (activeCaseId) simulate({ evidence_score: value });
    },
    [activeCaseId, simulate],
  );

  const loadDemo = useCallback((payload: CasePayload) => {
    setForm(payload);
  }, []);

  const intentLabel = useMemo(() => {
    const t = CASE_TYPES.find((c) => c.value === form.case_type);
    return t?.label ?? form.case_type;
  }, [form.case_type]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="LITIGATION INTELLIGENCE"
        title="诉讼胜诉率 · AI 推演"
        icon="shield"
        accent="error"
        description="把案情告诉 AI，秒出胜诉率、赔偿金额区间、策略排序与相似判例；拖滑杆实时推演不同证据组合下的胜诉概率。"
        actions={
          <Link
            href="/match?intent=litigation"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-text-secondary hover:border-primary-500 hover:text-primary-600"
          >
            <IconGlyph name="target" size={12} />
            一键匹配诉讼律师
          </Link>
        }
      />

      {error && <ErrorDisplay error={error} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_minmax(0,1fr)_320px]">
        {/* ===== Left: Intake ===== */}
        <aside className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <SectionHeader eyebrow="CASE INPUT" title="案情要点" description="先选一个 Demo 案情，或自己填。" />

          <div className="flex flex-wrap gap-1.5">
            {DEMO_SCENARIOS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => loadDemo(s.payload)}
                className="rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-[11px] text-text-secondary hover:border-primary-500 hover:text-primary-600"
              >
                {s.label}
              </button>
            ))}
          </div>

          <LabeledSelect
            label="案件类型"
            value={form.case_type}
            onChange={(v) => setForm((f) => ({ ...f, case_type: v }))}
            options={CASE_TYPES.map((c) => ({ value: c.value, label: c.label }))}
          />

          <LabeledSelect
            label="我方角色"
            value={form.role}
            onChange={(v) => setForm((f) => ({ ...f, role: v as "plaintiff" | "defendant" }))}
            options={[
              { value: "plaintiff", label: "原告 / 主张方" },
              { value: "defendant", label: "被告 / 被诉方" },
            ]}
          />

          <LabeledSelect
            label="管辖法院"
            value={form.jurisdiction ?? ""}
            onChange={(v) => setForm((f) => ({ ...f, jurisdiction: v }))}
            options={JURISDICTION_OPTIONS.map((j) => ({ value: j, label: j }))}
          />

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
              案情摘要
            </span>
            <textarea
              value={form.summary}
              onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              rows={4}
              className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-primary-500 focus:outline-none"
              placeholder="例：竞品在抖音短视频里搬运我方原创视频，已公证 20 条……"
            />
          </label>

          <LabeledSelect
            label="对方规模"
            value={form.opponent_scale ?? "sme"}
            onChange={(v) => setForm((f) => ({ ...f, opponent_scale: v }))}
            options={OPPONENT_SCALE}
          />

          <LabeledInput
            label="索赔 / 被索赔金额（元）"
            value={form.claim_amount?.toString() ?? ""}
            onChange={(v) => setForm((f) => ({ ...f, claim_amount: v ? Number(v) : undefined }))}
            placeholder="例：800000"
          />

          <label className="block">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                证据充分度
              </span>
              <span className="num-display text-sm text-primary-600">{form.evidence_score} / 10</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={form.evidence_score}
              onChange={(e) => onSliderChange(Number(e.target.value))}
              className="mt-2 w-full accent-primary-600"
            />
            <p className="mt-1 text-[11px] text-text-tertiary">拖动滑杆，中间仪表盘会实时重算胜诉率。</p>
          </label>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <ToggleRow
              label="聘请专家证人"
              value={!!form.has_expert_witness}
              onChange={(v) => setForm((f) => ({ ...f, has_expert_witness: v }))}
            />
            <ToggleRow
              label="先行尝试和谈"
              value={!!form.prior_negotiation}
              onChange={(v) => setForm((f) => ({ ...f, prior_negotiation: v }))}
            />
          </div>

          <button
            type="button"
            onClick={runPrediction}
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary-600 text-sm font-medium text-text-inverse hover:bg-primary-700 disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border border-text-inverse border-t-transparent" />
                推演中…
              </>
            ) : (
              <>
                <IconGlyph name="sparkle" size={14} />
                开始 AI 预测
              </>
            )}
          </button>

          {cases.length > 0 && (
            <div className="pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">
                历史案件
              </p>
              <ul className="mt-2 space-y-1">
                {cases.slice(0, 6).map((c) => {
                  const isActive = c.id === activeCaseId;
                  // 激活案件展示 view（含模拟覆盖）的胜率，与 DonutRing
                  // 保持同步；其他行仍用持久化值，避免误导。
                  const displayProb = isActive && view
                    ? view.win_probability
                    : c.prediction?.win_probability;
                  const isLive = isActive && !!simulated;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setActiveCaseId(c.id)}
                        className={
                          "flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs " +
                          (isActive
                            ? "border-primary-500 bg-primary-50 text-primary-700"
                            : "border-border bg-surface-elevated text-text-secondary hover:border-primary-500")
                        }
                      >
                        <span className="truncate">{c.title}</span>
                        {displayProb != null && (
                          <span
                            className={
                              "num-display shrink-0 tabular-nums " +
                              (isLive ? "text-primary-700" : "text-primary-600")
                            }
                            title={isLive ? "跟随当前模拟实时更新" : "最近一次 AI 预测结果"}
                          >
                            {Math.round(displayProb * 100)}%
                            {isLive && <span className="ml-0.5 text-[9px] text-primary-500">·实时</span>}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </aside>

        {/* ===== Middle: Dashboard ===== */}
        <section className="space-y-4">
          {!view ? (
            <EmptyHero
              icon="target"
              title="等待第一次 AI 预测"
              description="填好左侧案情要点，点击「开始 AI 预测」，这里会出现胜诉率、赔偿区间和策略推荐。"
              accent="error"
            />
          ) : (
            <PredictionDashboard
              prediction={view}
              intentLabel={intentLabel}
              isSimulated={!!simulated}
            />
          )}
        </section>

        {/* ===== Right: Evidence + Precedents ===== */}
        <aside className="space-y-4">
          {view && (
            <section className="rounded-xl border border-border bg-surface p-4">
              <SectionHeader
                eyebrow="EVIDENCE"
                title="证据清单"
                description="勾选代表已获取的证据。每项命中，AI 都会实时更新胜诉率。"
              />
              <ul className="mt-3 space-y-2">
                {view.evidence_checklist.map((e, idx) => (
                  <li key={`${e.title}-${idx}`}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-surface-elevated/40 px-2.5 py-2 text-xs hover:border-primary-500">
                      <input
                        type="checkbox"
                        checked={e.secured}
                        onChange={() => toggleEvidence(idx)}
                        className="mt-0.5 accent-primary-600"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className={
                              "truncate font-medium " +
                              (e.secured ? "text-success-700" : "text-text-primary")
                            }
                          >
                            {e.title}
                          </span>
                          <Badge variant="outline" size="sm">
                            {e.category}
                          </Badge>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-text-tertiary">{e.rationale}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {view && view.precedents?.length > 0 && (
            <section className="rounded-xl border border-border bg-surface p-4">
              <SectionHeader
                eyebrow="PRECEDENTS"
                title="相似判例"
                description="AI 从判例库聚类的锚定案例，点击查看原文。"
              />
              <ul className="mt-3 space-y-3">
                {view.precedents.map((p, idx) => (
                  <li key={p.id ?? `${p.title}-${idx}`} className="rounded-md border border-border bg-surface-elevated/40 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-text-primary">{p.title}</span>
                      <span className="num-display tabular-nums text-primary-600">
                        {Math.round((p.similarity ?? 0) * 100)}%
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-text-tertiary">
                      {[p.case_no, p.court, p.year].filter(Boolean).join(" · ")}
                    </p>
                    {p.outcome && (
                      <p className="mt-1 text-[11px]">
                        判决结果：
                        <span className="text-text-primary">{p.outcome}</span>
                      </p>
                    )}
                    {p.takeaway && <p className="mt-1 text-[11px] text-text-secondary">{p.takeaway}</p>}
                    {p.url && (
                      <a
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary-600 hover:underline"
                      >
                        <IconGlyph name="external" size={10} />
                        查看判决书
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function PredictionDashboard({
  prediction,
  intentLabel,
  isSimulated,
}: {
  prediction: Prediction;
  intentLabel: string;
  isSimulated: boolean;
}) {
  const percent = Math.round(prediction.win_probability * 100);
  const risk = (prediction.risk_level ?? "medium").toLowerCase();
  const riskAccent: Accent = RISK_ACCENT[risk] ?? "muted";
  const ringColor =
    risk === "high" ? "#e11d48" : risk === "low" ? "#059669" : "#d97706";

  return (
    <div className="space-y-4">
      {/* Headline Card */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-5">
            <DonutRing
              percent={percent}
              color={ringColor}
              size={128}
              strokeWidth={12}
              label="胜诉率"
              valueLabel={
                <span className="num-display text-3xl font-semibold tracking-tight" style={{ color: ringColor }}>
                  {percent}%
                </span>
              }
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <SeverityPill level={risk} label={RISK_LABEL[risk] ?? risk} size="md" />
                {isSimulated && (
                  <Badge variant="primary" size="sm">
                    场景推演中
                  </Badge>
                )}
                <Badge variant="outline" size="sm">
                  {intentLabel}
                </Badge>
              </div>
              <h2 className="mt-2 font-serif text-xl font-medium text-text-primary">
                {prediction.headline ?? "AI 已完成预测"}
              </h2>
              {prediction.rationale && (
                <p className="mt-1 max-w-xl text-sm text-text-secondary">{prediction.rationale}</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
          <StatTile
            label="赔偿区间"
            value={formatMoneyRange(prediction.money_low, prediction.money_high)}
            icon="chart"
            accent={riskAccent}
            suffix={prediction.money_currency}
          />
          <StatTile
            label="诉讼周期"
            value={`${prediction.duration_days_low}–${prediction.duration_days_high}`}
            icon="clock"
            accent="info"
            suffix="天"
          />
          <StatTile
            label="策略数"
            value={prediction.strategies.length}
            icon="bolt"
            accent="primary"
            suffix="条 AI 建议"
          />
        </div>
      </section>

      {/* Probability factors */}
      {prediction.probability_factors?.length > 0 && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <SectionHeader eyebrow="WHY THIS NUMBER" title="概率构成" description="每一项因素对胜诉率的贡献。" />
          <ul className="mt-3 space-y-2">
            {prediction.probability_factors.map((f, idx) => (
              <FactorBar key={`${f.name}-${idx}`} factor={f} />
            ))}
          </ul>
        </section>
      )}

      {/* Strategies */}
      <section className="rounded-xl border border-border bg-surface p-4">
        <SectionHeader eyebrow="STRATEGIES" title="AI 策略排序" description="根据胜诉率、周期、成本综合评分。" />
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {prediction.strategies.map((s, idx) => (
            <StrategyCard key={`${s.name}-${idx}`} strategy={s} />
          ))}
        </div>
      </section>
    </div>
  );
}

function FactorBar({ factor }: { factor: ProbabilityFactor }) {
  const positive = factor.delta >= 0;
  const magnitude = Math.min(1, Math.abs(factor.delta) * 6); // visual emphasis
  return (
    <li className="grid grid-cols-[140px_minmax(0,1fr)_80px] items-center gap-3">
      <span className="truncate text-xs text-text-secondary">
        {factor.name}
        <span className="ml-1 text-text-tertiary">· {factor.label}</span>
      </span>
      <div className="relative h-2 rounded-full bg-surface-elevated">
        <span
          className={
            "absolute top-0 h-full rounded-full " +
            (positive ? "left-1/2 bg-success-500" : "right-1/2 bg-error-500")
          }
          style={{ width: `${magnitude * 50}%` }}
        />
        <span className="absolute left-1/2 top-[-2px] h-3 w-px bg-border" />
      </div>
      <span
        className={
          "num-display text-right text-xs tabular-nums " +
          (positive ? "text-success-600" : "text-error-600")
        }
      >
        {positive ? "+" : ""}
        {(factor.delta * 100).toFixed(1)}%
      </span>
    </li>
  );
}

function StrategyCard({ strategy }: { strategy: Strategy }) {
  return (
    <article
      className={
        "flex flex-col gap-2 rounded-lg border p-3 " +
        (strategy.recommended
          ? "border-primary-500 bg-primary-50/40"
          : "border-border bg-surface-elevated/40")
      }
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-text-primary">{strategy.name}</h3>
          {strategy.recommended && (
            <Badge variant="primary" size="sm">
              推荐
            </Badge>
          )}
        </div>
        <span
          className="flex items-baseline gap-1 text-primary-600"
          title="策略推荐指数（满分 100），非胜诉率百分比"
        >
          <span className="num-display text-lg tabular-nums">{strategy.score}</span>
          <span className="text-[10px] font-medium text-text-tertiary">推荐指数 /100</span>
        </span>
      </header>
      <p className="text-xs text-text-secondary">{strategy.rationale}</p>
      <div className="flex items-center gap-3 text-[11px] text-text-tertiary">
        {strategy.timeline_days != null && (
          <span>
            <IconGlyph name="clock" size={10} className="mr-1 inline" />
            约 {strategy.timeline_days} 天
          </span>
        )}
        {strategy.cost_range && (
          <span>
            <IconGlyph name="chart" size={10} className="mr-1 inline" />
            费用 {strategy.cost_range}
          </span>
        )}
      </div>
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

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={
        "flex cursor-pointer items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs " +
        (value ? "border-primary-500 bg-primary-50/40 text-primary-700" : "border-border bg-surface-elevated text-text-secondary")
      }
    >
      <span>{label}</span>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary-600"
      />
    </label>
  );
}

function formatMoneyRange(low: number, high: number) {
  const toShort = (n: number) => {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}亿`;
    if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`;
    return String(n);
  };
  return `${toShort(low)} – ${toShort(high)}`;
}
