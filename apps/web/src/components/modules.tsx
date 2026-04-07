"use client";

import { useState } from "react";
import { NextStepCard, SectionCard, SourceTag, StatusBadge } from "@a1plus/ui";
import { parseErrorResponse } from "@/lib/errors";

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
    headers: { ...jsonHeaders, ...(init?.headers ?? {}) }
  });
  if (!response.ok) throw parseErrorResponse(await response.text(), path);
  return response.json() as Promise<T>;
}

type ContractResult = {
  summary: string;
  risks: Array<{ clause: string; severity: string; suggestion: string }>;
  ip_clauses_found: string[];
  missing_clauses: string[];
  overall_risk: string;
};

export function ContractWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<ContractResult> | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const response = await request<{ job_id: string; status: string; result?: Envelope<ContractResult> }>("/contracts/review", {
        method: "POST",
        body: JSON.stringify({ contract_text: String(formData.get("contractText") ?? "") })
      });
      if (!response.result) {
        throw new Error("审查结果为空");
      }
      setResult(response.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "审查失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard title="合同审查" eyebrow="Contract Review">
        <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-4">
          <textarea
            name="contractText"
            placeholder="粘贴合同文本，系统将自动识别 IP 相关条款并给出风险提示..."
            rows={10}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                AI 审查中...
              </>
            ) : (
              "执行合同审查"
            )}
          </button>
          {loading ? (
            <div className="rounded-2xl border border-rust/20 bg-rust/5 p-4">
              <p className="text-sm text-rust">
                ⏳ AI 正在分析合同文本中的知识产权条款，通常需要 15-30 秒...
              </p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </form>
      </SectionCard>

      {result ? (
        <>
        <SectionCard
          title="审查结果"
          eyebrow="Result"
          actions={<SourceTag mode={result.mode} provider={result.provider} />}
        >
          <div className="flex items-center gap-3">
            <StatusBadge label={`整体风险: ${result.normalizedPayload.overall_risk}`} tone={result.normalizedPayload.overall_risk === "high" ? "danger" : result.normalizedPayload.overall_risk === "medium" ? "warning" : "success"} />
          </div>
          <p className="mt-4 leading-7 text-slate-700">{result.normalizedPayload.summary}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">风险条款</p>
              <div className="mt-3 space-y-3">
                {(result.normalizedPayload.risks ?? []).map((risk, index) => (
                  <div key={index} className="rounded-2xl bg-slate-50 p-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge label={risk.severity} tone={risk.severity === "high" ? "danger" : risk.severity === "medium" ? "warning" : "info"} />
                      <p className="text-sm font-medium text-slate-900">{risk.clause}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{risk.suggestion}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-700">已发现 IP 条款</p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  {(result.normalizedPayload.ip_clauses_found ?? []).map((item, index) => (
                    <li key={index}>• {item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">建议补充条款</p>
                <ul className="mt-3 space-y-1 text-sm text-amber-800">
                  {(result.normalizedPayload.missing_clauses ?? []).map((item, index) => (
                    <li key={index}>• {item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
            {result.disclaimer}
          </div>
        </SectionCard>
        <NextStepCard
          title="建议查看资产台账"
          description="合同审查完成，建议查看资产台账确认相关资产状态。"
          action={{ label: "前往资产台账", href: "/assets" }}
        />
        </>
      ) : null}
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

export function PatentWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<PatentResult> | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const response = await request<{ job_id: string; status: string; result?: Envelope<PatentResult> }>("/patents/assess", {
        method: "POST",
        body: JSON.stringify({ description: String(formData.get("description") ?? "") })
      });
      if (!response.result) {
        throw new Error("评估结果为空");
      }
      setResult(response.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "评估失败");
    } finally {
      setLoading(false);
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
      <SectionCard title="专利/软著评估" eyebrow="Patent & Copyright">
        <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-4">
          <textarea
            name="description"
            placeholder="描述你的技术方案、产品功能或创新点..."
            rows={6}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                AI 评估中...
              </>
            ) : (
              "执行评估"
            )}
          </button>
          {loading ? (
            <div className="rounded-2xl border border-rust/20 bg-rust/5 p-4">
              <p className="text-sm text-rust">
                ⏳ AI 正在分析技术方案，通常需要 15-30 秒...
              </p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </form>
      </SectionCard>

      {result ? (
        <>
        <SectionCard
          title="评估结果"
          eyebrow="Result"
          actions={<SourceTag mode={result.mode} provider={result.provider} />}
        >
          <div className="flex items-center gap-3">
            <StatusBadge label={`推荐类型: ${typeLabel[result.normalizedPayload.recommended_type] || result.normalizedPayload.recommended_type}`} tone="info" />
            <StatusBadge label={`可行性: ${result.normalizedPayload.feasibility}`} tone={result.normalizedPayload.feasibility === "high" ? "success" : "warning"} />
          </div>
          <p className="mt-4 leading-7 text-slate-700">{result.normalizedPayload.novelty_assessment}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">技术要点</p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {(result.normalizedPayload.key_points ?? []).map((item, index) => (
                  <li key={index}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">需要材料</p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {(result.normalizedPayload.materials_needed ?? []).map((item, index) => (
                  <li key={index}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">预计时间</p>
              <p className="mt-2 text-sm text-slate-600">{result.normalizedPayload.estimated_timeline}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">费用估算</p>
              <p className="mt-2 text-sm text-slate-600">{result.normalizedPayload.cost_estimate}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
            {result.disclaimer}
          </div>
        </SectionCard>
        <NextStepCard
          title="建议查看资产台账"
          description="专利评估完成，建议查看资产台账确认相关资产状态。"
          action={{ label: "前往资产台账", href: "/assets" }}
        />
        </>
      ) : null}
    </div>
  );
}


type PolicyResult = {
  industry: string;
  policies: Array<{ title: string; summary: string; impact: string; effective_date: string; source: string }>;
  key_changes: string[];
  action_items: string[];
  compliance_notes: string;
};

export function PolicyWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<PolicyResult> | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const response = await request<{ job_id: string; status: string; result?: Envelope<PolicyResult> }>("/policies/digest", {
        method: "POST",
        body: JSON.stringify({ industry: String(formData.get("industry") ?? "") })
      });
      if (!response.result) {
        throw new Error("获取结果为空");
      }
      setResult(response.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "获取失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard title="行业政策摘要" eyebrow="Policy Digest">
        <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-4">
          <input
            name="industry"
            placeholder="输入行业，例如：跨境电商 / SaaS / 医疗"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                获取中...
              </>
            ) : (
              "获取政策摘要"
            )}
          </button>
          {loading ? (
            <div className="rounded-2xl border border-rust/20 bg-rust/5 p-4">
              <p className="text-sm text-rust">
                ⏳ AI 正在分析行业政策，通常需要 15-30 秒...
              </p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </form>
      </SectionCard>

      {result ? (
        <>
        <SectionCard
          title={`${result.normalizedPayload.industry} 行业政策`}
          eyebrow="Result"
          actions={<SourceTag mode={result.mode} provider={result.provider} />}
        >
          <div className="space-y-3">
            {(result.normalizedPayload.policies ?? []).map((policy, index) => (
              <div key={index} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">{policy.title}</p>
                  <StatusBadge label={`影响: ${policy.impact}`} tone={policy.impact === "high" ? "danger" : policy.impact === "medium" ? "warning" : "info"} />
                </div>
                <p className="mt-2 text-sm leading-7 text-slate-600">{policy.summary}</p>
                <p className="mt-1 text-sm text-slate-500">来源: {policy.source} · 生效日期: {policy.effective_date}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">关键变化</p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {(result.normalizedPayload.key_changes ?? []).map((item, index) => (
                  <li key={index}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">建议行动</p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {(result.normalizedPayload.action_items ?? []).map((item, index) => (
                  <li key={index}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
            {result.disclaimer}
          </div>
        </SectionCard>
        <NextStepCard
          title="建议进行 IP 诊断"
          description="政策摘要已获取，建议进行 IP 诊断以评估政策对您业务的影响。"
          action={{ label: "前往 IP 诊断", href: "/diagnosis" }}
        />
        </>
      ) : null}
    </div>
  );
}

type DueDiligenceResult = {
  company: string;
  ip_portfolio: { trademarks: number; patents: number; copyrights: number; trade_secrets: string };
  strengths: string[];
  risks: Array<{ risk: string; severity: string; mitigation: string }>;
  valuation_factors: string[];
  recommendations: string[];
  overall_assessment: string;
};

export function DueDiligenceWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<DueDiligenceResult> | null>(null);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const response = await request<{ job_id: string; status: string; result?: Envelope<DueDiligenceResult> }>("/due-diligence/investigate", {
        method: "POST",
        body: JSON.stringify({ company_name: String(formData.get("companyName") ?? "") })
      });
      if (!response.result) {
        throw new Error("尽调结果为空");
      }
      setResult(response.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "尽调失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard title="融资尽调" eyebrow="Due Diligence">
        <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-4">
          <input
            name="companyName"
            placeholder="输入目标公司名称"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                AI 分析中...
              </>
            ) : (
              "执行 IP 尽调"
            )}
          </button>
          {loading ? (
            <div className="rounded-2xl border border-rust/20 bg-rust/5 p-4">
              <p className="text-sm text-rust">
                ⏳ AI 正在分析目标公司知识产权状况，通常需要 15-30 秒...
              </p>
            </div>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </form>
      </SectionCard>

      {result ? (
        <>
        <SectionCard
          title="尽调结果"
          eyebrow="Result"
          actions={<SourceTag mode={result.mode} provider={result.provider} />}
        >
          <div className="flex items-center gap-3">
            <StatusBadge label={`整体评估: ${result.normalizedPayload.overall_assessment}`} tone={result.normalizedPayload.overall_assessment === "high" ? "success" : result.normalizedPayload.overall_assessment === "medium" ? "warning" : "danger"} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{result.normalizedPayload.ip_portfolio.trademarks}</p>
              <p className="text-sm text-slate-500">商标</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{result.normalizedPayload.ip_portfolio.patents}</p>
              <p className="text-sm text-slate-500">专利</p>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{result.normalizedPayload.ip_portfolio.copyrights}</p>
              <p className="text-sm text-slate-500">版权</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">IP 优势</p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {(result.normalizedPayload.strengths ?? []).map((item, index) => (
                  <li key={index}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">风险项</p>
              <div className="mt-3 space-y-2">
                {(result.normalizedPayload.risks ?? []).map((risk, index) => (
                  <div key={index} className="rounded-2xl bg-slate-50 p-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge label={risk.severity} tone={risk.severity === "high" ? "danger" : "warning"} />
                      <p className="text-sm font-medium text-slate-900">{risk.risk}</p>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{risk.mitigation}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
            {result.disclaimer}
          </div>
        </SectionCard>
        <NextStepCard
          title="建议查看资产台账"
          description="尽调报告已生成，建议查看资产台账确认相关资产状态。"
          action={{ label: "前往资产台账", href: "/assets" }}
        />
        </>
      ) : null}
    </div>
  );
}
