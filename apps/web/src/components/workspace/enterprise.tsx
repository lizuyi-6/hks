"use client";

/**
 * EnterpriseSpace — 企业 IP 合规工作台。
 * 整合「合规评分仪表盘 / 体检详情 / 政策雷达 / 订阅管理」四个子页为 Tab。
 * 覆盖「合规 SaaS」赛道关键词。
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Badge, StreamingPanel, FormInput, SubmitButton } from "@a1plus/ui";
import {
  PageHeader,
  SectionHeader,
  IconTabBar,
  StatTile,
  SeverityPill,
  EmptyHero,
  IconGlyph,
  accentBgClass,
  severityAccent,
} from "./primitives";
import { DonutRing } from "@/components/viz";
import { ErrorDisplay, request, type Envelope } from "./shared";
import { ApplicationError } from "@/lib/errors";
import { fetchSSE } from "@/lib/sse";
import { INDUSTRY_CHIPS } from "@/components/modules";

type Tab = "overview" | "audit" | "policy" | "subscription";

type Finding = {
  id: string;
  severity: string;
  category: string;
  title: string;
  description: string;
  remediation?: string | null;
  recommendedProducts?: string[];
  status: string;
};

type ComplianceProfile = {
  id: string;
  companyName: string;
  industry: string;
  scale?: string | null;
  score: number;
  breakdown: Record<string, number>;
  heatmap: Record<string, number>;
  assetSummary: { total: number; by_type: Record<string, number> };
  subscriptionTier: string;
  lastAuditAt?: string | null;
  findings: Finding[];
  createdAt: string;
};

type PolicyItem = {
  title: string;
  summary: string;
  impact: string;
  effective_date: string;
  source: string;
};

type PolicyRadar = {
  industry: string;
  retrievedAt: string;
  policies: PolicyItem[];
  summary: string;
  disclaimer: string;
  provider?: string;
  key_changes?: string[];
  action_items?: string[];
  compliance_notes?: string;
};

type PolicyDigestPayload = {
  industry?: string;
  policies?: PolicyItem[];
  key_changes?: string[];
  action_items?: string[];
  compliance_notes?: string;
  summary?: string;
};

const HEATMAP_LABEL: Record<string, string> = {
  brand_protection: "品牌保护",
  technology_protection: "技术保护",
  software_copyright: "软件版权",
  contract_hygiene: "合同健康",
  policy_awareness: "政策敏感度",
};

const CATEGORY_LABEL: Record<string, string> = {
  trademark: "商标",
  patent: "专利",
  copyright: "版权",
  "soft-copyright": "软著",
  contract: "合同",
  policy: "政策",
};

export function EnterpriseSpace() {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Enterprise Compliance"
        title="企业 IP 合规中心"
        icon="shield"
        accent="warning"
        description="360° IP 合规体检、政策雷达、风险热力图 —— 让合规看得见、管得住。"
      />
      <IconTabBar<Tab>
        tabs={[
          { key: "overview", label: "合规概览", icon: "shield" },
          { key: "audit", label: "体检报告", icon: "diagnosis" },
          { key: "policy", label: "政策雷达", icon: "policies" },
          { key: "subscription", label: "订阅方案", icon: "sparkle" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "overview" && <Overview onGoSubscription={() => setTab("subscription")} />}
      {tab === "audit" && <AuditTab />}
      {tab === "policy" && <PolicyTab onGoSubscription={() => setTab("subscription")} />}
      {tab === "subscription" && <SubscriptionTab />}
    </div>
  );
}

function isQuotaExceededError(err: ApplicationError): boolean {
  const d = (err.details ?? {}) as Record<string, unknown>;
  if (d.code === "compliance.audit.quota_exceeded") return true;
  return /额度/.test(err.message || "");
}

function QuotaExceededAlert({
  error,
  onGoSubscription,
  onDismiss,
}: {
  error: ApplicationError;
  onGoSubscription?: () => void;
  onDismiss?: () => void;
}) {
  const d = (error.details ?? {}) as Record<string, unknown>;
  const tierLabel = typeof d.tierLabel === "string" ? d.tierLabel : "当前方案";
  const quota = typeof d.quota === "number" ? d.quota : undefined;
  const used = typeof d.used === "number" ? d.used : undefined;
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-warning-500/60 bg-warning-50/60 p-4 text-sm">
      <div className="min-w-0">
        <p className="font-medium text-warning-700">本月合规体检额度已用完</p>
        <p className="mt-1 text-xs text-text-secondary">
          「{tierLabel}」{quota !== undefined ? `每月 ${quota} 次` : ""}
          {used !== undefined ? ` · 已使用 ${used} 次` : ""}
          {" · "}升级到更高订阅可继续体检。
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {onGoSubscription ? (
          <button
            type="button"
            onClick={onGoSubscription}
            className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-700"
          >
            去「订阅方案」
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated"
          >
            知道了
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Overview({ onGoSubscription }: { onGoSubscription?: () => void }) {
  const [profile, setProfile] = useState<ComplianceProfile | null>(null);
  const [error, setError] = useState<string | ApplicationError | null>(null);
  const [running, setRunning] = useState(false);
  const [justRefreshedAt, setJustRefreshedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const p = await request<ComplianceProfile | null>("/compliance/profile");
      setProfile(p && p.id ? p : null);
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 3 秒后自动隐藏"已更新"提示，避免一直挂着让用户以为还在刷新。
  useEffect(() => {
    if (justRefreshedAt == null) return;
    const t = window.setTimeout(() => setJustRefreshedAt(null), 3000);
    return () => window.clearTimeout(t);
  }, [justRefreshedAt]);

  const runAudit = useCallback(async () => {
    if (running) return;
    // 关键：清掉旧错误，否则 if (error) return <ErrorDisplay/> 之前的早期实现
    // 会把整块 Overview 吞成一条红字，用户误以为"按钮无响应"。
    setError(null);
    setJustRefreshedAt(null);
    setRunning(true);
    // 最小 loading 可视时长（350ms），避免 React 18 自动 batching 把
    // setRunning(true) 和 setRunning(false) 合并成同一次 render，
    // "体检中…" 一帧都看不见。
    const minDelay = new Promise((r) => setTimeout(r, 350));
    try {
      const body: Record<string, string> = {};
      if (profile?.companyName) body.companyName = profile.companyName;
      if (profile?.industry) body.industry = profile.industry;
      if (profile?.scale) body.scale = profile.scale;
      await Promise.all([
        request("/compliance/audit", {
          method: "POST",
          body: JSON.stringify(body),
        }),
        minDelay,
      ]);
      await load();
      setJustRefreshedAt(Date.now());
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    } finally {
      setRunning(false);
    }
  }, [load, profile, running]);

  const quotaError =
    error instanceof ApplicationError && isQuotaExceededError(error) ? error : null;
  const genericError = error && !quotaError ? error : null;

  if (!profile && error && !quotaError) {
    // 初次 load 就失败：没有 profile 可渲染，给一个带"重试"的兜底。
    return (
      <div className="space-y-3">
        <ErrorDisplay error={error} />
        <button
          type="button"
          onClick={() => {
            setError(null);
            void load();
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated"
        >
          <IconGlyph name="refresh" size={12} />
          重试加载
        </button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-3">
        {quotaError ? (
          <QuotaExceededAlert
            error={quotaError}
            onGoSubscription={onGoSubscription}
            onDismiss={() => setError(null)}
          />
        ) : null}
        <EmptyHero
          icon="shield"
          accent="warning"
          title="还没有合规档案"
          description="点击下方按钮开始第一次 IP 合规体检，系统会自动生成评分、风险热力图与改进建议。"
          primaryAction={{
            label: running ? "体检中…" : "开始合规体检",
            onClick: running ? undefined : runAudit,
          }}
        />
      </div>
    );
  }

  const scoreAccent =
    profile.score >= 80 ? "success" : profile.score >= 60 ? "warning" : "error";
  const scoreColor =
    profile.score >= 80
      ? "rgb(var(--color-success-500))"
      : profile.score >= 60
        ? "rgb(var(--color-warning-500))"
        : "rgb(var(--color-error-500))";

  const heatmap = profile.heatmap ?? {};
  const breakdown = profile.breakdown ?? {};
  const assetSummary = profile.assetSummary ?? { total: 0, by_type: {} };
  const assetByType = assetSummary.by_type ?? {};
  const findings = profile.findings ?? [];
  const openFindings = findings.filter((f) => f.status === "open");

  return (
    <div className="space-y-6">
      {quotaError ? (
        <QuotaExceededAlert
          error={quotaError}
          onGoSubscription={onGoSubscription}
          onDismiss={() => setError(null)}
        />
      ) : null}
      {genericError ? (
        <div className="space-y-2">
          <ErrorDisplay error={genericError} />
          <button
            type="button"
            onClick={() => setError(null)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1 text-xs text-text-secondary hover:bg-surface-elevated"
          >
            关闭提示
          </button>
        </div>
      ) : null}

      {/* ===== Score dashboard ===== */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center rounded-xl border border-border bg-surface p-6">
          <DonutRing
            percent={profile.score}
            label={`${profile.score}`}
            color={scoreColor}
            size={140}
            strokeWidth={14}
          />
          <div className="mt-3 text-center">
            <p className="text-[11px] uppercase tracking-wider text-text-tertiary">
              合规评分
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              {profile.score >= 80
                ? "良好 · 继续保持"
                : profile.score >= 60
                  ? "达标 · 有改进空间"
                  : "存在风险 · 建议立即介入"}
            </p>
            <Badge variant={scoreAccent === "success" ? "success" : scoreAccent === "warning" ? "warning" : "error"} size="sm" className="mt-2">
              {profile.industry} · {profile.scale ?? "未填写"}
            </Badge>
            {justRefreshedAt ? (
              <p className="mt-2 text-[11px] text-success-600">
                已更新 · {new Date(justRefreshedAt).toLocaleTimeString()}
              </p>
            ) : profile.lastAuditAt ? (
              <p className="mt-2 text-[11px] text-text-tertiary">
                上次体检 {new Date(profile.lastAuditAt).toLocaleString()}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={runAudit}
            disabled={running}
            className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse hover:bg-primary-700 disabled:opacity-60"
          >
            {running ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border border-text-inverse border-t-transparent" />
                体检中…
              </>
            ) : (
              <>
                <IconGlyph name="refresh" size={14} />
                重新体检
              </>
            )}
          </button>
        </div>

        {/* ===== Heatmap ===== */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <SectionHeader
            eyebrow="Risk Heatmap"
            title="风险热力图"
            description="不同领域的合规健康度，分数越高越安全。"
          />
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(heatmap).map(([key, value]) => {
              const color =
                value >= 80
                  ? "success"
                  : value >= 60
                    ? "warning"
                    : "error";
              return (
                <div
                  key={key}
                  className="rounded-lg border border-border bg-surface-elevated p-3 text-center"
                >
                  <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
                    {HEATMAP_LABEL[key] ?? key}
                  </div>
                  <div
                    className={`num-display mt-2 text-2xl leading-none ${
                      color === "success"
                        ? "text-success-600"
                        : color === "warning"
                          ? "text-warning-600"
                          : "text-error-600"
                    }`}
                  >
                    {value}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div
                      className={`h-full ${
                        color === "success"
                          ? "bg-success-500"
                          : color === "warning"
                            ? "bg-warning-500"
                            : "bg-error-500"
                      }`}
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== Breakdown + Assets ===== */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-5">
          <SectionHeader eyebrow="Breakdown" title="得分构成" />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(breakdown).map(([cat, val]) => (
              <StatTile
                key={cat}
                label={CATEGORY_LABEL[cat] ?? cat}
                value={val}
                accent={val >= 15 ? "success" : val >= 5 ? "warning" : "error"}
              />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5">
          <SectionHeader
            eyebrow="IP Assets"
            title={`已登记 ${assetSummary.total ?? 0} 项`}
          />
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(assetByType).map(([cat, val]) => (
              <StatTile
                key={cat}
                label={CATEGORY_LABEL[cat] ?? cat}
                value={val}
                accent="info"
              />
            ))}
          </div>
        </div>
      </section>

      {/* ===== Open findings ===== */}
      <section>
        <SectionHeader
          eyebrow="Findings"
          title={`待处理 ${openFindings.length} 条`}
          description="每一条都附带推荐的律师服务产品，可一键委托。"
        />
        <div className="mt-3 space-y-2">
          {openFindings.map((f) => (
            <FindingRow key={f.id} finding={f} />
          ))}
        </div>
      </section>
    </div>
  );
}

function AuditTab() {
  const [profile, setProfile] = useState<ComplianceProfile | null>(null);
  const [error, setError] = useState<string | ApplicationError | null>(null);

  useEffect(() => {
    request<ComplianceProfile | null>("/compliance/profile")
      .then((p) => setProfile(p && (p as ComplianceProfile).id ? (p as ComplianceProfile) : null))
      .catch((e) => setError(e instanceof ApplicationError ? e : String(e)));
  }, []);

  if (error) return <ErrorDisplay error={error} />;
  if (!profile) {
    return (
      <EmptyHero
        icon="diagnosis"
        title="暂无体检报告"
        description="请先到「合规概览」Tab 开始第一次合规体检，完成后可在此下载详细报告。"
      />
    );
  }

  const reportBase = `/api/backend/compliance/profile/${profile.id}/report`;
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-surface p-5">
        <SectionHeader
          eyebrow="Audit Report"
          title={`${profile.companyName} · 合规体检报告`}
          description={`更新于 ${profile.lastAuditAt ? new Date(profile.lastAuditAt).toLocaleString() : "—"}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={`${reportBase}.md`}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-3 text-xs text-text-secondary hover:bg-surface-elevated"
              >
                <IconGlyph name="download" size={12} />
                下载 MD
              </a>
              <a
                href={`${reportBase}.docx`}
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-surface px-3 text-xs text-text-secondary hover:bg-surface-elevated"
              >
                <IconGlyph name="download" size={12} />
                下载 Word
              </a>
              <a
                href={`${reportBase}.pdf`}
                className="inline-flex h-8 items-center gap-1 rounded-md bg-primary-600 px-3 text-xs font-medium text-text-inverse hover:bg-primary-700"
              >
                <IconGlyph name="download" size={12} />
                下载 PDF
              </a>
            </div>
          }
        />
        <p className="mt-2 text-[11px] text-text-tertiary">
          Word / PDF 均由同一份 Markdown 源生成，内容一致。
        </p>
      </section>

      {(profile.findings ?? []).map((f) => (
        <FindingRow key={f.id} finding={f} detail />
      ))}
    </div>
  );
}

function FindingRow({ finding, detail }: { finding: Finding; detail?: boolean }) {
  const accent = severityAccent(finding.severity);
  const leftBorder =
    accent === "error"
      ? "border-l-error-500"
      : accent === "warning"
        ? "border-l-warning-500"
        : accent === "info"
          ? "border-l-info-500"
          : "border-l-border";
  return (
    <article
      className={`rounded-md border border-border border-l-4 bg-surface p-4 ${leftBorder}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <SeverityPill level={finding.severity} />
            <Badge variant="outline" size="sm">
              {CATEGORY_LABEL[finding.category] ?? finding.category}
            </Badge>
            <span className="font-medium text-text-primary">{finding.title}</span>
          </div>
          <p className="mt-1 text-xs text-text-secondary">{finding.description}</p>
        </div>
      </header>
      {detail && finding.remediation && (
        <div className="mt-3 rounded-md border border-dashed border-border bg-surface-elevated p-3 text-xs text-text-secondary">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-text-tertiary">
            RECOMMENDATION
          </div>
          <p>{finding.remediation}</p>
        </div>
      )}
      {finding.recommendedProducts && finding.recommendedProducts.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-text-tertiary">推荐服务：</span>
          {finding.recommendedProducts.map((p) => (
            <Badge key={p} variant="primary" size="sm">
              {p}
            </Badge>
          ))}
          <button className="ml-auto rounded-md border border-border bg-surface px-3 py-1 text-[11px] text-text-primary hover:bg-surface-elevated">
            一键委托律师
          </button>
        </div>
      )}
    </article>
  );
}

function PolicyTab({ onGoSubscription }: { onGoSubscription?: () => void }) {
  const [radar, setRadar] = useState<PolicyRadar | null>(null);
  const [error, setError] = useState<string | ApplicationError | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [industryInput, setIndustryInput] = useState("");

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

  const runDigest = useCallback(async (industry: string) => {
    const target = industry.trim();
    if (!target) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    setStreamingText("");
    setRadar(null);
    try {
      await fetchSSE<Envelope<PolicyDigestPayload>>(
        "/api/backend/stream/policies/digest",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ industry: target }),
          signal: controller.signal,
        },
        {
          onToken: (token) => {
            if (mountedRef.current) setStreamingText((prev) => prev + token);
          },
          onResult: (envelope) => {
            if (!mountedRef.current) return;
            const payload = envelope.normalizedPayload ?? {};
            setRadar({
              industry: payload.industry ?? target,
              retrievedAt: envelope.retrievedAt ?? new Date().toISOString(),
              policies: payload.policies ?? [],
              summary: payload.summary ?? payload.compliance_notes ?? "",
              disclaimer: envelope.disclaimer ?? "",
              provider: envelope.provider,
              key_changes: payload.key_changes ?? [],
              action_items: payload.action_items ?? [],
              compliance_notes: payload.compliance_notes ?? "",
            });
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
        setError(err instanceof Error ? err.message : "政策雷达拉取失败");
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // 首次挂载：仅用用户合规档案里的行业预填输入框/芯片选中态，
  // 不自动触发扫描；由用户确认或修改后点击「开始扫描」才真正发起请求。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await request<ComplianceProfile | null>("/compliance/profile");
        if (cancelled || !mountedRef.current) return;
        const industry = profile?.industry?.trim();
        if (industry) {
          setIndustryInput(industry);
        }
      } catch {
        // 忽略：档案拉取失败不应阻塞政策雷达；用户仍可手动输入/选择行业。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePickIndustry = (c: string) => {
    setIndustryInput(c);
  };

  const handleScanSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const target = industryInput.trim();
    if (!target || loading) return;
    void runDigest(target);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-surface p-4">
        <SectionHeader
          eyebrow="Industry"
          title="选择行业"
          description="政策雷达会针对所选行业整理近期监管动向与合规提醒。输入或选择行业后点击「开始扫描」。"
        />
        <form onSubmit={handleScanSubmit} className="mt-3 grid gap-3">
          <FormInput
            name="industry"
            label="行业"
            value={industryInput}
            onChange={(e) => setIndustryInput(e.target.value)}
            placeholder="输入行业，例如：跨境电商 / SaaS / 医疗"
            disabled={loading}
            required
          />
          <div className="flex flex-wrap gap-2">
            {INDUSTRY_CHIPS.map((c) => {
              const active = industryInput === c;
              return (
                <button
                  key={c}
                  type="button"
                  disabled={loading}
                  onClick={() => handlePickIndustry(c)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    active
                      ? `${accentBgClass("primary")} border-transparent`
                      : "border-border bg-surface text-text-secondary hover:bg-surface-elevated"
                  }`}
                >
                  <IconGlyph name="target" size={12} />
                  {c}
                </button>
              );
            })}
          </div>
          <SubmitButton
            loading={loading}
            loadingText="扫描中..."
            disabled={!industryInput.trim()}
          >
            开始扫描政策雷达
          </SubmitButton>
        </form>
      </section>

      {loading ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-primary-500" />
            政策雷达扫描中…{industryInput ? `（${industryInput}）` : ""}
          </div>
          <div className="mt-3">
            <StreamingPanel text={streamingText} label="AI 正在整理最新政策…" />
          </div>
        </section>
      ) : null}

      {error && !loading ? (
        <div className="space-y-2">
          <ErrorDisplay error={error} />
          <button
            type="button"
            onClick={() => runDigest(industryInput || "通用")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated"
          >
            <IconGlyph name="refresh" size={12} />
            重试
          </button>
        </div>
      ) : null}

      {!loading && !error && !radar ? (
        <EmptyHero
          icon="policies"
          accent="info"
          title="选择行业，开启政策雷达"
          description="在上方输入行业关键词或选择推荐行业，然后点击「开始扫描政策雷达」。也可以直接以「通用」行业快速扫描一次。"
          primaryAction={{
            label: "以「通用」行业扫描",
            onClick: () => runDigest("通用"),
          }}
        />
      ) : null}

      {!loading && radar ? (
        <>
          <section className="rounded-xl border border-border bg-surface p-5">
            <SectionHeader
              eyebrow="Policy Radar"
              title={`${radar.industry} · 最新政策`}
              description={radar.summary || radar.compliance_notes || "已整理最新合规动向与提醒。"}
            />
            <p className="mt-2 text-[11px] text-text-tertiary">
              更新于 {new Date(radar.retrievedAt).toLocaleString()}
              {radar.disclaimer ? ` · ${radar.disclaimer}` : ""}
            </p>
          </section>

          {radar.policies.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-elevated/60 p-6 text-center">
              <p className="text-sm text-text-secondary">
                当前行业未命中政策更新。你可以换个行业重新扫描，或前往「订阅方案」订阅感兴趣的主题，
                有新政策时会自动推送。
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => runDigest(industryInput || "通用")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary hover:bg-surface-elevated"
                >
                  <IconGlyph name="refresh" size={12} />
                  重新扫描
                </button>
                {onGoSubscription ? (
                  <button
                    type="button"
                    onClick={onGoSubscription}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-primary-700"
                  >
                    <IconGlyph name="sparkle" size={12} />
                    去「订阅方案」
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {radar.policies.map((p, i) => (
                <article
                  key={i}
                  className="rounded-xl border border-border bg-surface p-4"
                >
                  <header className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <SeverityPill level={p.impact} label={`影响 ${p.impact}`} />
                        <span className="font-medium text-text-primary">{p.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-text-secondary">{p.summary}</p>
                    </div>
                    <div className="text-right text-[11px] text-text-tertiary">
                      <div>{p.source}</div>
                      <div>{p.effective_date} 起施行</div>
                    </div>
                  </header>
                </article>
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

type SubscriptionTier = {
  tier: string;
  label: string;
  priceMonthly: number;
  monthlyAuditQuota: number;
  assetQuota: number;
  policySubscriptionQuota: number;
  features: string[];
};

type SubscriptionState = {
  subscription: SubscriptionTier & {
    usage: {
      auditsThisMonth: number;
      policySubscriptions: number;
      assetsCount: number;
    };
    available: {
      audits: number | null;
      assets: number | null;
      policySubscriptions: number | null;
    };
  };
  companyName?: string;
};

type PolicySub = {
  id: string;
  industry: string | null;
  topic: string;
  frequency: string;
  channels: string[];
  active: boolean;
  lastSentAt?: string | null;
  createdAt: string;
};

function SubscriptionTab() {
  const [tiers, setTiers] = useState<SubscriptionTier[] | null>(null);
  const [state, setState] = useState<SubscriptionState | null>(null);
  const [subs, setSubs] = useState<PolicySub[] | null>(null);
  const [error, setError] = useState<string | ApplicationError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newTopic, setNewTopic] = useState("");

  const load = useCallback(async () => {
    try {
      const [tiersData, stateData, subsData] = await Promise.all([
        request<SubscriptionTier[]>("/compliance/subscription/tiers"),
        request<SubscriptionState>("/compliance/subscription"),
        request<PolicySub[]>("/compliance/policy-subscriptions"),
      ]);
      setTiers(tiersData);
      setState(stateData);
      setSubs(subsData);
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const upgrade = async (tier: string) => {
    setBusy(`upgrade-${tier}`);
    try {
      await request("/compliance/subscription/upgrade", {
        method: "POST",
        body: JSON.stringify({ tier }),
      });
      await load();
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    } finally {
      setBusy(null);
    }
  };

  const subscribe = async () => {
    if (!newTopic.trim()) return;
    setBusy("subscribe");
    try {
      await request("/compliance/policy-subscriptions", {
        method: "POST",
        body: JSON.stringify({ topic: newTopic.trim(), frequency: "weekly", channels: ["inapp"] }),
      });
      setNewTopic("");
      await load();
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (id: string, next: boolean) => {
    setBusy(`toggle-${id}`);
    try {
      await request(`/compliance/policy-subscriptions/${id}/toggle`, {
        method: "POST",
        body: JSON.stringify({ active: next }),
      });
      await load();
    } catch (e) {
      setError(e instanceof ApplicationError ? e : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorDisplay error={error} />;
  if (!tiers || !state) return <div className="py-12 text-center text-sm text-text-tertiary">加载中…</div>;

  const current = state.subscription.tier;

  return (
    <div className="space-y-6">
      <QuotaSummary state={state} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {tiers.map((t) => {
          const active = t.tier === current;
          return (
            <article
              key={t.tier}
              className={`rounded-xl border bg-surface p-5 ${
                active
                  ? "border-primary-500 shadow-[0_0_0_4px_rgb(var(--color-primary-100)/0.5)]"
                  : "border-border"
              }`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-serif text-lg font-medium text-text-primary">{t.label}</h3>
                {active && <Badge variant="primary" size="sm">当前</Badge>}
              </div>
              <div className="num-display mt-3 text-2xl text-primary-600">
                {t.priceMonthly === 0 ? "¥0" : `¥${t.priceMonthly}`}
                <span className="ml-1 text-[11px] text-text-tertiary">/ 月</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-lg border border-border bg-surface-elevated p-2 text-[10px] text-text-tertiary">
                <QuotaMini
                  label="体检"
                  value={t.monthlyAuditQuota === -1 ? "∞" : `${t.monthlyAuditQuota}/月`}
                />
                <QuotaMini
                  label="资产"
                  value={t.assetQuota === -1 ? "∞" : `${t.assetQuota}`}
                />
                <QuotaMini
                  label="雷达"
                  value={t.policySubscriptionQuota === -1 ? "∞" : `${t.policySubscriptionQuota}`}
                />
              </div>
              <ul className="mt-4 space-y-2 text-xs text-text-secondary">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5">
                    <IconGlyph name="check" size={12} className="mt-0.5 text-success-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {!active && (
                <button
                  disabled={busy === `upgrade-${t.tier}`}
                  onClick={() => upgrade(t.tier)}
                  className="mt-4 w-full rounded-md bg-primary-600 px-3 py-2 text-xs font-medium text-text-inverse hover:bg-primary-700 disabled:opacity-60"
                >
                  {busy === `upgrade-${t.tier}` ? "切换中…" : `升级到 ${t.label}`}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <PolicySubscriptions
        subs={subs ?? []}
        newTopic={newTopic}
        setNewTopic={setNewTopic}
        onSubscribe={subscribe}
        onToggle={toggle}
        busy={busy}
      />
    </div>
  );
}

function QuotaSummary({ state }: { state: SubscriptionState }) {
  const s = state.subscription;
  const rows: Array<{
    label: string;
    used: number;
    quota: number;
    unit?: string;
  }> = [
    {
      label: "本月合规体检",
      used: s.usage.auditsThisMonth,
      quota: s.monthlyAuditQuota,
      unit: "次",
    },
    {
      label: "IP 资产台账",
      used: s.usage.assetsCount,
      quota: s.assetQuota,
      unit: "条",
    },
    {
      label: "政策雷达订阅",
      used: s.usage.policySubscriptions,
      quota: s.policySubscriptionQuota,
      unit: "个",
    },
  ];

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <SectionHeader
        eyebrow={`当前方案 · ${s.label}`}
        title="合规 SaaS 配额使用情况"
        description="超出配额时，系统会优先提醒而不是静默失败；可一键升级。"
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {rows.map((r) => {
          const unlimited = r.quota === -1;
          const pct = unlimited ? 0 : Math.min(100, Math.round((r.used / Math.max(1, r.quota)) * 100));
          const warn = !unlimited && pct >= 80;
          return (
            <div
              key={r.label}
              className="rounded-lg border border-border bg-surface-elevated p-3"
            >
              <div className="text-[11px] uppercase tracking-wider text-text-tertiary">
                {r.label}
              </div>
              <div className="mt-1 text-lg font-semibold text-text-primary tabular-nums">
                {r.used}
                <span className="ml-1 text-xs text-text-tertiary">
                  / {unlimited ? "∞" : r.quota} {r.unit}
                </span>
              </div>
              {!unlimited && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full ${warn ? "bg-warning-500" : "bg-primary-500"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              )}
              {warn && (
                <div className="mt-1 text-[10px] text-warning-700">
                  即将触顶，考虑升级方案
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QuotaMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-text-tertiary">{label}</div>
      <div className="mt-0.5 font-mono text-xs text-text-primary">{value}</div>
    </div>
  );
}

const FREQUENCY_LABEL: Record<string, string> = {
  daily: "每日",
  weekly: "每周",
  on_change: "有更新时",
};

function PolicySubscriptions({
  subs,
  newTopic,
  setNewTopic,
  onSubscribe,
  onToggle,
  busy,
}: {
  subs: PolicySub[];
  newTopic: string;
  setNewTopic: (v: string) => void;
  onSubscribe: () => void;
  onToggle: (id: string, next: boolean) => void;
  busy: string | null;
}) {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <SectionHeader
        eyebrow="Policy Radar Subscriptions"
        title="政策雷达订阅"
        description="订阅你关心的合规主题，有更新时会通过站内 / 邮件 / 企业微信自动推送。"
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          value={newTopic}
          onChange={(e) => setNewTopic(e.target.value)}
          placeholder="例如：跨境电商合规 / 数据出境 / 商标新规"
          className="h-9 min-w-[260px] flex-1 rounded-md border border-border bg-surface px-3 text-sm"
        />
        <button
          onClick={onSubscribe}
          disabled={busy === "subscribe" || !newTopic.trim()}
          className="h-9 rounded-md bg-primary-600 px-4 text-xs font-medium text-text-inverse hover:bg-primary-700 disabled:opacity-60"
        >
          {busy === "subscribe" ? "订阅中…" : "+ 订阅主题"}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {subs.length === 0 && (
          <p className="text-sm text-text-tertiary">还没有订阅任何主题，从推荐开始：</p>
        )}
        {subs.length === 0 && (
          <div className="flex flex-wrap gap-2">
            {["跨境电商合规", "数据出境新规", "商标异议新规", "反不正当竞争", "医药生物 IP"].map(
              (t) => (
                <button
                  key={t}
                  onClick={() => setNewTopic(t)}
                  className="rounded-full border border-dashed border-border bg-surface-elevated px-3 py-1 text-[11px] text-text-secondary hover:border-primary-400 hover:text-primary-600"
                >
                  {t}
                </button>
              ),
            )}
          </div>
        )}
        {subs.map((s) => (
          <article
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-elevated px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <IconGlyph name="bell" size={12} className="text-primary-600" />
                <span className="truncate text-sm font-medium text-text-primary">{s.topic}</span>
                <Badge variant={s.active ? "success" : "default"} size="sm" dot>
                  {s.active ? "活跃" : "已暂停"}
                </Badge>
              </div>
              <div className="mt-0.5 text-[11px] text-text-tertiary">
                {s.industry ?? "不限行业"} · 推送频率：{FREQUENCY_LABEL[s.frequency] ?? s.frequency} ·
                渠道：{(s.channels || []).join("、") || "站内"}
              </div>
            </div>
            <button
              onClick={() => onToggle(s.id, !s.active)}
              disabled={busy === `toggle-${s.id}`}
              className="rounded-md border border-border bg-surface px-3 py-1 text-[11px] text-text-primary hover:bg-surface-elevated disabled:opacity-60"
            >
              {s.active ? "暂停" : "恢复"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
