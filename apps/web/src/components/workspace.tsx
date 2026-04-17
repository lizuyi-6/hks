"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  ApplicationDraft,
  DataMode,
  IpAsset,
  ModuleResultItem,
  ReminderTask,
  Suggestion,
  TrademarkCheckRequest,
  TrademarkCheckResult,
  WorkflowInstance
} from "@a1plus/domain";
import { coreWorkflow, modules, riskLevelMeta } from "@a1plus/domain";
import { legalBoundaryNotice } from "@a1plus/config";
import { Metric, NextStepCard, PipelineIndicator, SectionCard, SourceTag, StatusBadge } from "@a1plus/ui";
import { proxyBaseUrl } from "@/lib/env";
import { parseErrorResponse, ApplicationError, getErrorDisplayInfo } from "@/lib/errors";
import { fetchSSE } from "@/lib/sse";
import { FileUpload } from "@/components/file-upload";

type ProviderHealth = {
  providers: Array<{
    port: string;
    mode: DataMode;
    provider: string;
    available: boolean;
    reason?: string;
  }>;
};

type Envelope<T> = {
  mode: DataMode;
  provider: string;
  traceId: string;
  retrievedAt: string;
  sourceRefs: Array<{ title: string; url?: string; note?: string }>;
  disclaimer: string;
  normalizedPayload: T;
};

type DiagnosisPayload = {
  summary: string;
  priorityAssets: string[];
  risks: string[];
  nextActions: string[];
  recommendedTrack: "trademark" | "patent" | "copyright";
  recommendedTrademarkCategories: string[];
};

function ErrorDisplay({ error }: { error: string | ApplicationError }) {
  const [showDetails, setShowDetails] = useState(false);
  const isAppError = error instanceof ApplicationError;
  const info = isAppError ? getErrorDisplayInfo(error.errorType) : { color: "gray", label: "未知错误" };
  const bgColor = info.color === "red" ? "bg-rose-100 border-rose-300" :
                  info.color === "yellow" ? "bg-amber-100 border-amber-300" :
                  info.color === "blue" ? "bg-blue-100 border-blue-300" :
                  info.color === "purple" ? "bg-purple-100 border-purple-300" :
                  info.color === "orange" ? "bg-orange-100 border-orange-300" :
                  "bg-slate-100 border-slate-300";

  return (
    <div className={`rounded-lg border p-3 mb-3 ${bgColor}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded ${
              info.color === "red" ? "bg-rose-200 text-rose-800" :
              info.color === "yellow" ? "bg-amber-200 text-amber-800" :
              info.color === "blue" ? "bg-blue-200 text-blue-800" :
              info.color === "purple" ? "bg-purple-200 text-purple-800" :
              info.color === "orange" ? "bg-orange-200 text-orange-800" :
              "bg-slate-200 text-slate-800"
            }`}>
              {info.label}
            </span>
            {isAppError && error.errorLocation && (
              <span className="text-xs text-slate-500">{error.errorLocation}</span>
            )}
          </div>
          <p className="text-sm text-slate-700">
            {isAppError ? error.message : error}
          </p>
          {isAppError && error.requestId && (
            <p className="text-xs text-slate-400 mt-1">请求ID: {error.requestId}</p>
          )}
        </div>
        {isAppError && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-slate-500 hover:text-slate-700 underline"
          >
            {showDetails ? "收起" : "详情"}
          </button>
        )}
      </div>
      {showDetails && isAppError && (
        <div className="mt-2 pt-2 border-t border-slate-200">
          <p className="text-xs text-slate-500 mb-1">错误位置: {error.errorLocation}</p>
          <p className="text-xs text-slate-500 mb-1">错误类型: {error.errorType}</p>
          <p className="text-xs text-slate-500 mb-1">时间: {error.timestamp}</p>
          {error.details && Object.keys(error.details).length > 0 && (
            <p className="text-xs text-slate-500">详情: {JSON.stringify(error.details)}</p>
          )}
          {process.env.NODE_ENV === "development" && error.stack && (
            <pre className="mt-2 text-xs text-slate-400 overflow-auto max-h-32">{error.stack}</pre>
          )}
        </div>
      )}
    </div>
  );
}

const jsonHeaders = {
  "Content-Type": "application/json"
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${proxyBaseUrl}${path}`, {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw parseErrorResponse(detail, path);
  }

  return response.json() as Promise<T>;
}

export function DashboardPanel() {
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [assets, setAssets] = useState<IpAsset[]>([]);
  const [reminders, setReminders] = useState<ReminderTask[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowInstance[]>([]);
  const [moduleResults, setModuleResults] = useState<ModuleResultItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      request<ProviderHealth>("/system/health"),
      request<IpAsset[]>("/assets"),
      request<ReminderTask[]>("/reminders"),
      request<Suggestion[]>("/suggestions"),
      request<WorkflowInstance[]>("/workflows?status=running"),
      request<ModuleResultItem[]>("/module-results")
    ])
      .then(([healthPayload, assetsPayload, remindersPayload, suggestionsPayload, workflowsPayload, moduleResultsPayload]) => {
        setHealth(healthPayload);
        setAssets(assetsPayload);
        setReminders(remindersPayload);
        setSuggestions(suggestionsPayload);
        setWorkflows(workflowsPayload);
        setModuleResults(moduleResultsPayload);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <SectionCard
        title="A1+ IP 主流程"
        eyebrow="Overview"
        actions={<StatusBadge label="已上线" tone="success" />}
      >
        <div className="grid gap-4 md:grid-cols-3">
          <Metric label="模块数量" value={`${modules.length}`} detail="覆盖商标、专利、合同等核心业务" />
          <Metric label="核心流程" value={`${coreWorkflow.length} 步`} detail="诊断到台账自动写入完整打通" />
          <Metric label="法律边界" value="辅助准备" detail="不代替官方申报，提交由用户完成" />
        </div>
        <div className="rounded-3xl bg-slate-950 p-5 text-slate-100">
          <p className="text-sm uppercase tracking-[0.24em] text-sand/80">Boundary</p>
          <p className="mt-3 max-w-3xl leading-7 text-slate-200">{legalBoundaryNotice}</p>
        </div>
      </SectionCard>

      <SectionCard title="待办建议" eyebrow="Suggestions">
        {suggestions.length === 0 ? (
          <p className="text-sm text-slate-500">暂无待办建议</p>
        ) : (
          <div className="space-y-3">
            {suggestions.map((suggestion) => {
              const priorityTone: Record<string, { bg: string; text: string }> = {
                high: { bg: "bg-red-100", text: "text-red-700" },
                medium: { bg: "bg-amber-100", text: "text-amber-700" },
                low: { bg: "bg-blue-100", text: "text-blue-700" }
              };
              const tone = priorityTone[suggestion.priority] ?? priorityTone.low;
              return (
                <div key={suggestion.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{suggestion.title}</p>
                      <p className="mt-1 text-sm text-slate-500">{suggestion.description}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${tone.bg} ${tone.text}`}>
                      {suggestion.priority === "high" ? "高" : suggestion.priority === "medium" ? "中" : "低"}
                    </span>
                  </div>
                  <div className="mt-3">
                    <Link
                      href={suggestion.action.href}
                      className="inline-flex rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white"
                    >
                      {suggestion.action.label}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="活跃工作流" eyebrow="Workflows">
        {workflows.length === 0 ? (
          <p className="text-sm text-slate-500">暂无进行中的工作流</p>
        ) : (
          <div className="space-y-4">
            {workflows.map((workflow) => {
              const stepTypeNames: Record<string, string> = {
                diagnosis: "IP 诊断",
                trademark_check: "商标查重",
                application_generate: "申请书生成",
                submission_guide: "提交引导",
                ledger_write: "入台账",
                reminder_create: "创建提醒",
                monitoring_scan: "侵权监控",
                competitor_track: "竞争对手追踪",
                contract_review: "合同审查",
                patent_assess: "专利评估",
                policy_digest: "政策速递",
                due_diligence: "尽调报告"
              };
              return (
                <div key={workflow.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-slate-900">{workflow.workflowType}</p>
                    <StatusBadge label={workflow.status} tone="info" />
                  </div>
                  <div className="mt-4">
                    <PipelineIndicator
                      steps={workflow.steps.map((step) => ({ name: stepTypeNames[step.stepType] ?? step.stepType }))}
                      currentIndex={workflow.currentStepIndex}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Provider 健康状态" eyebrow="基础设施">
        {error ? <ErrorDisplay error={error} /> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {health?.providers.map((providerItem) => {
            const portNames: Record<string, string> = {
              trademarkSearch: "商标查重",
              enterpriseLookup: "企业查询",
              publicWebSearch: "公开搜索",
              knowledgeBase: "知识库",
              llm: "大语言模型",
              documentRender: "文档生成",
              notification: "邮件通知",
              monitoring: "侵权监控",
              submissionGuide: "申报指南",
              competitor: "竞争对手",
              contractReview: "合同审查",
              patentAssist: "专利辅助",
              policyDigest: "政策速递",
              dueDiligence: "尽调报告",
            };
            const providerNames: Record<string, string> = {
              "cnipa-snapshot": "CNIPA 商标快照",
              "tianyancha": "天眼查",
              "bing": "必应搜索",
              "official-kb-snapshot": "官方知识库快照",
              "tencent": "腾讯云 LLM",
              "docx-reportlab": "DOCX/PDF 生成",
              "smtp": "SMTP 邮件",
              "bing-search-monitoring": "必应搜索监控",
              "cnipa-guide": "CNIPA 申报指南",
              "tianyancha-competitor": "天眼查竞争对手",
              "llm-contract-review": "LLM 合同审查",
              "llm-patent-assist": "LLM 专利辅助",
              "llm-policy-digest": "LLM 政策速递",
              "llm-due-diligence": "LLM 尽调报告",
              "rules-engine": "规则引擎",
              "basic-competitor": "基础竞争对手",
              "placeholder": "占位数据",
              "local-scan": "本地扫描",
            };
            const reasonNames: Record<string, string> = {
              "fallback: no TIANAYANCHA_API_KEY, returning basic info": "未配置天眼查 Key，仅返回基础信息",
              "fallback: no BING_SEARCH_API_KEY, returning placeholder results": "未配置必应 Key，返回占位数据",
              "fallback: no BING_SEARCH_API_KEY, using local scan": "未配置必应 Key，使用本地扫描",
              "SMTP not configured, emails will be logged only": "未配置 SMTP，邮件仅记录日志",
            };
            const portName = portNames[providerItem.port] ?? providerItem.port;
            const providerName = providerNames[providerItem.provider] ?? providerItem.provider;
            const reasonText = providerItem.reason ? (reasonNames[providerItem.reason] ?? providerItem.reason) : null;
            return (
              <div key={`${providerItem.port}-${providerItem.provider}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-950">{portName}</p>
                  <StatusBadge
                    label={providerItem.available ? "可用" : "不可用"}
                    tone={providerItem.available ? "success" : "danger"}
                  />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <SourceTag mode={providerItem.mode} provider={providerName} />
                </div>
                {reasonText ? (
                  <p className="mt-3 text-sm text-slate-500">{reasonText}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>

      <div className="grid gap-6 xl:grid-cols-3">
        <SectionCard title="最近资产" eyebrow="Ledger">
          <div className="space-y-3">
            {assets.length === 0 ? (
              <p className="text-sm text-slate-500">还没有资产，完成申请书生成后会自动入台账。</p>
            ) : (
              assets.slice(0, 4).map((asset) => (
                <div key={asset.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-900">{asset.name}</p>
                    <p className="text-sm text-slate-500">{asset.type} · {asset.status}</p>
                  </div>
                  <SourceTag mode={asset.sourceMode} provider="ledger" />
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="提醒队列" eyebrow="Queue">
          <div className="space-y-3">
            {reminders.length === 0 ? (
              <p className="text-sm text-slate-500">暂无提醒任务。</p>
            ) : (
              reminders.slice(0, 4).map((task) => (
                <div key={task.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-900">{task.channel.toUpperCase()}</p>
                    <p className="text-sm text-slate-500">到期时间 {new Date(task.dueAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>
                  </div>
                  <StatusBadge
                    label={task.status}
                    tone={task.status === "sent" ? "success" : task.status === "failed" || task.status === "dead_letter" ? "danger" : "info"}
                  />
                </div>
              ))
            )}
          </div>
        </SectionCard>

        <SectionCard title="最近模块结果" eyebrow="Module Results">
          <div className="space-y-3">
            {moduleResults.length === 0 ? (
              <p className="text-sm text-slate-500">暂无模块执行记录</p>
            ) : (
              moduleResults.slice(0, 5).map((result) => {
                const moduleTypeNames: Record<string, string> = {
                  diagnosis: "IP 诊断",
                  trademark_check: "商标查重",
                  application_generate: "申请书生成",
                  monitoring: "侵权监控",
                  competitor: "竞争对手追踪",
                  contract_review: "合同审查",
                  patent_assess: "专利评估",
                  policy_digest: "政策速递",
                  due_diligence: "尽调报告"
                };
                const preview = JSON.stringify(result.resultData ?? {});
                const truncated = preview.length > 80 ? `${preview.slice(0, 80)}…` : preview;
                return (
                  <div key={result.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                    <p className="font-medium text-slate-900">{moduleTypeNames[result.moduleType] ?? result.moduleType}</p>
                    <p className="text-sm text-slate-500">{new Date(result.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>
                    <p className="mt-1 truncate text-sm text-slate-400">{truncated}</p>
                  </div>
                );
              })
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export function DiagnosisWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Envelope<DiagnosisPayload> | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [prefill, setPrefill] = useState<{
    businessName?: string;
    businessDescription?: string;
    industry?: string;
    stage?: string;
  } | null>(null);

  useEffect(() => {
    request<ModuleResultItem[]>("/module-results?module_type=diagnosis")
      .then((results) => {
        if (results.length > 0) {
          const latest = results[results.length - 1];
          setReport(latest.resultData as unknown as Envelope<DiagnosisPayload>);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${proxyBaseUrl}/profile`, { credentials: "include" })
      .then((res) => res.json() as Promise<{ businessName?: string; businessDescription?: string; industry?: string; stage?: string }>)
      .then((p) => setPrefill(p))
      .catch(() => setPrefill({}));
  }, []);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setStreamingText("");

    const payload = {
      business_name: String(formData.get("businessName") ?? ""),
      business_description: String(formData.get("businessDescription") ?? ""),
      industry: String(formData.get("industry") ?? ""),
      stage: String(formData.get("stage") ?? "")
    };

    try {
      await fetchSSE<Envelope<DiagnosisPayload>>(
        `${proxyBaseUrl}/stream/diagnosis`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        },
        {
          onToken: (token) => {
            setStreamingText(prev => prev + token);
          },
          onResult: (result) => {
            setReport(result);
            setStreamingText("");
          },
          onError: (msg) => {
            setError(msg);
            setStreamingText("");
          }
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "诊断失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard title="IP 快速诊断" eyebrow="Core Flow">
        <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-4">
          {!prefill ? (
            <div className="flex items-center justify-center py-4">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
            </div>
          ) : (
          <>
          <input
            name="businessName"
            defaultValue={prefill.businessName ?? ""}
            placeholder="公司名 / 项目名"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
          />
          <textarea
            name="businessDescription"
            defaultValue={prefill.businessDescription ?? ""}
            placeholder="描述你的产品、服务、目标客群和商业场景"
            rows={6}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            required
          />
          <div className="grid gap-4 md:grid-cols-2">
            <input
              name="industry"
              defaultValue={prefill.industry ?? ""}
              placeholder="所属行业，例如：跨境电商 / SaaS"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            />
            <input
              name="stage"
              defaultValue={prefill.stage ?? ""}
              placeholder="企业阶段，例如：初创 / 上线前"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            />
          </div>
          </>)}
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                AI 诊断中...
              </>
            ) : (
              "生成 IP 保护建议"
            )}
          </button>
          {streamingText ? (
            <div className="rounded-2xl border border-rust/20 bg-rust/5 p-4">
              <p className="leading-7 text-slate-700 whitespace-pre-wrap">{streamingText}</p>
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-rust" />
                正在生成...
              </div>
            </div>
          ) : null}
          {error ? <ErrorDisplay error={error} /> : null}
        </form>
      </SectionCard>

      {report && report.normalizedPayload ? (
        <>
        <SectionCard
          title="诊断结果"
          eyebrow="Result"
          actions={<SourceTag mode={report.mode ?? "mock"} provider={report.provider ?? "mock"} />}
        >
          <p className="leading-7 text-slate-700">{report.normalizedPayload.summary}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">优先保护资产</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {(report.normalizedPayload.priorityAssets ?? []).map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">下一步行动</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {(report.normalizedPayload.nextActions ?? []).map((item) => (
                  <li key={item}>• {item}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
            {report.disclaimer}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/trademark/check?categories=${report.normalizedPayload.recommendedTrademarkCategories.join(",")}`}
              className="inline-flex rounded-full bg-rust px-5 py-3 text-sm font-semibold text-white"
            >
              进入商标流程
            </Link>
            <StatusBadge label={`推荐方向：${report.normalizedPayload.recommendedTrack}`} tone="info" />
          </div>
        </SectionCard>
        {report.normalizedPayload.recommendedTrack === "trademark" ? (
          <NextStepCard
            title="建议下一步：商标查重"
            description="根据诊断结果，建议您进行商标查重以确认名称可用性。"
            action={{ label: "前往商标查重", href: "/trademark/check" }}
          />
        ) : null}
        </>
      ) : null}
    </div>
  );
}

export function TrademarkCheckWorkspace({
  presetCategories
}: {
  presetCategories?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<TrademarkCheckResult> | null>(null);
  const [prefillDescription, setPrefillDescription] = useState("");
  const [profileDefaults, setProfileDefaults] = useState<{
    applicantName?: string;
    applicantType?: string;
  } | null>(null);

  useEffect(() => {
    request<ModuleResultItem[]>("/module-results?module_type=trademark-check")
      .then((results) => {
        if (results.length > 0) {
          const latest = results[results.length - 1];
          setResult(latest.resultData as unknown as Envelope<TrademarkCheckResult>);
        }
      })
      .catch(() => {});

    request<ModuleResultItem[]>("/module-results?module_type=diagnosis")
      .then((results) => {
        if (results.length > 0) {
          const latest = results[results.length - 1] as unknown as { resultData: Envelope<DiagnosisPayload> };
          const desc = (latest.resultData as unknown as Envelope<DiagnosisPayload>)?.normalizedPayload?.summary;
          if (desc) setPrefillDescription(desc);
        }
      })
      .catch(() => {});

    fetch(`${proxyBaseUrl}/profile`, { credentials: "include" })
      .then((res) => res.json() as Promise<{ applicantName?: string; applicantType?: string; businessDescription?: string }>)
      .then((p) => {
        setProfileDefaults(p);
        if (!prefillDescription && p.businessDescription) {
          setPrefillDescription(p.businessDescription);
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
      applicantType: String(formData.get("applicantType") ?? "company") as TrademarkCheckRequest["applicantType"],
      categories: String(formData.get("categories") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    };

    try {
      const result = await request<Envelope<TrademarkCheckResult>>("/trademarks/check", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      setResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "查重失败");
    } finally {
      setLoading(false);
    }
  }

  const riskMeta = useMemo(
    () => (result ? riskLevelMeta[result.normalizedPayload.riskLevel ?? "yellow"] : null),
    [result]
  );

  return (
    <div className="space-y-6">
      <SectionCard title="商标查重分析" eyebrow="Core Flow">
        <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-4">
          <input
            name="trademarkName"
            placeholder="商标名称"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            required
          />
          <textarea
            name="businessDescription"
            placeholder="业务描述，用于辅助判断类别和使用场景"
            rows={5}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            defaultValue={prefillDescription}
            required
          />
          <div className="grid gap-4 md:grid-cols-3">
            <input
              name="applicantName"
              defaultValue={profileDefaults?.applicantName ?? ""}
              placeholder="申请人名称"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
              required
            />
            <select
              name="applicantType"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
              defaultValue={profileDefaults?.applicantType ?? "company"}
            >
              <option value="company">企业</option>
              <option value="individual">个人</option>
            </select>
            <input
              name="categories"
              placeholder="类别，用逗号分隔，如 35,42"
              defaultValue={presetCategories ?? ""}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                查询中...
              </>
            ) : (
              "执行商标查重"
            )}
          </button>
          {loading ? (
            <div className="rounded-2xl border border-rust/20 bg-rust/5 p-4">
              <p className="text-sm text-rust">
                ⏳ 正在检索商标数据库，请稍候...
              </p>
            </div>
          ) : null}
          {error ? <ErrorDisplay error={error} /> : null}
        </form>
      </SectionCard>

      {result && riskMeta ? (
        <>
        <SectionCard
          title="查重结果"
          eyebrow="Result"
          actions={<SourceTag mode={result.mode} provider={result.provider} />}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex rounded-full border px-4 py-2 text-sm font-semibold ${riskMeta.className}`}>
              {riskMeta.label}
            </span>
            <p className="text-sm text-slate-500">{riskMeta.description}</p>
          </div>
          <p className="leading-7 text-slate-700">{result.normalizedPayload.summary}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">近似项 / 冲突项</p>
              <div className="mt-3 space-y-3">
                {(result.normalizedPayload.findings ?? []).map((finding) => (
                  <div key={`${finding.name}-${finding.category}`} className="rounded-2xl bg-slate-50 p-3">
                    <p className="font-medium text-slate-900">
                      {finding.name} · 第{finding.category}类
                    </p>
                    <p className="text-sm text-slate-500">
                      相似度 {finding.similarityScore}% · {finding.status}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">{finding.note}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">建议与备选方案</p>
              <p className="mt-3 text-sm leading-7 text-slate-600">
                {result.normalizedPayload.recommendation}
              </p>
              {result.normalizedPayload.alternatives?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.normalizedPayload.alternatives.map((item) => (
                    <StatusBadge key={item} label={item} tone="info" />
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
            {result.disclaimer}
          </div>
          <Link
            href="/trademark/application"
            className="inline-flex rounded-full bg-rust px-5 py-3 text-sm font-semibold text-white"
          >
            进入申请书生成
          </Link>
        </SectionCard>
        {(result.normalizedPayload.riskLevel === "green") ? (
          <NextStepCard
            title="商标可用，建议生成申请书"
            description="查重结果显示商标可用，可以继续进行申请书生成。"
            action={{ label: "前往申请书生成", href: "/trademark/application" }}
          />
        ) : (result.normalizedPayload.riskLevel === "yellow") ? (
          <NextStepCard
            title="存在近似商标，请谨慎"
            description="查重发现近似商标，建议仔细评估风险后再决定是否申请。"
            action={{ label: "查看资产台账", href: "/assets" }}
          />
        ) : (result.normalizedPayload.riskLevel === "red") ? (
          <NextStepCard
            title="存在冲突，建议调整名称"
            description="查重发现明显冲突，建议调整商标名称后重新查重。"
            action={{ label: "重新查重", href: "/trademark/check" }}
          />
        ) : null}
        </>
      ) : null}
    </div>
  );
}

export function ApplicationWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);
  const [prefillData, setPrefillData] = useState<{
    trademarkName?: string;
    businessDescription?: string;
    applicantName?: string;
    applicantType?: string;
    categories?: string[];
    riskLevel?: string;
  }>({});

  useEffect(() => {
    request<ModuleResultItem[]>("/module-results?module_type=application_generate")
      .then((results) => {
        if (results.length > 0) {
          const latest = results[results.length - 1];
          setDraft(latest.resultData as unknown as ApplicationDraft);
        }
      })
      .catch(() => {});

    request<ModuleResultItem[]>("/module-results?module_type=trademark-check")
      .then((results) => {
        if (results.length > 0) {
          const latest = results[results.length - 1];
          const checkResult = latest.resultData as Record<string, unknown>;
          const envelope = checkResult as unknown as Envelope<TrademarkCheckResult>;
          setPrefillData((prev) => ({
            ...prev,
            riskLevel: envelope.normalizedPayload?.riskLevel ?? "yellow",
            categories: envelope.normalizedPayload?.suggestedCategories
          }));
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const payload = {
      trademark_name: String(formData.get("trademarkName") ?? ""),
      applicant_name: String(formData.get("applicantName") ?? ""),
      applicant_type: String(formData.get("applicantType") ?? "company"),
      business_description: String(formData.get("businessDescription") ?? ""),
      categories: String(formData.get("categories") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      risk_level: prefillData.riskLevel ?? "yellow"
    };

    try {
      const response = await request<{ id: string; result?: ApplicationDraft }>("/trademarks/application/jobs", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      if (!response.result) {
        throw new Error("申请书结果为空");
      }

      setDraft(response.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "申请书生成失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard title="商标申请书生成" eyebrow="Core Flow">
        <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-4">
          <input
            name="trademarkName"
            placeholder="商标名称"
            defaultValue={prefillData.trademarkName ?? ""}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            required
          />
          <textarea
            name="businessDescription"
            placeholder="业务描述"
            defaultValue={prefillData.businessDescription ?? ""}
            rows={5}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            required
          />
          <div className="grid gap-4 md:grid-cols-3">
            <input
              name="applicantName"
              placeholder="申请人名称"
              defaultValue={prefillData.applicantName ?? ""}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
              required
            />
            <select
              name="applicantType"
              defaultValue={prefillData.applicantType ?? "company"}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            >
              <option value="company">企业</option>
              <option value="individual">个人</option>
            </select>
            <input
              name="categories"
              placeholder="类别，用逗号分隔"
              defaultValue={prefillData.categories?.join(",") ?? ""}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-fit items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                正在生成申请书，请稍候...
              </>
            ) : (
              "生成 Word / PDF"
            )}
          </button>
          {loading ? (
            <div className="rounded-2xl border border-rust/20 bg-rust/5 p-4">
              <p className="text-sm text-rust">
                ⏳ AI 正在分析商标信息并生成文档，通常需要 10-20 秒...
              </p>
            </div>
          ) : null}
          {error ? <ErrorDisplay error={error} /> : null}
        </form>
      </SectionCard>

      {draft ? (
        <>
        <SectionCard title="申请书结果" eyebrow="Documents">
          <div className="flex items-center gap-3">
            <SourceTag mode={draft.sourceMode} provider={draft.provider} />
            <StatusBadge label="自动入台账已启用" tone="success" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="font-medium text-slate-900">{draft.trademarkName}</p>
              <p className="mt-2 text-sm text-slate-500">
                申请人 {draft.applicantName} · 类别 {(draft.categories ?? []).join(", ")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge label={riskLevelMeta[draft.riskLevel ?? "yellow"].label} tone={draft.riskLevel === "green" ? "success" : draft.riskLevel === "yellow" ? "warning" : "danger"} />
                {(draft.documentLabels ?? []).map((label) => (
                  <StatusBadge key={label} label={label} tone="info" />
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">下载文件</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  className="inline-flex rounded-full bg-rust px-4 py-2 text-sm font-semibold text-white"
                  href={`${proxyBaseUrl}${draft.downloadEndpoints.docx}`}
                >
                  下载 DOCX
                </a>
                <a
                  className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                  href={`${proxyBaseUrl}${draft.downloadEndpoints.pdf}`}
                >
                  下载 PDF
                </a>
              </div>
              <p className="mt-4 text-sm leading-7 text-slate-500">
                申请书生成完成后，系统会自动写入 IP 资产台账并创建提醒任务。
              </p>
            </div>
          </div>
          <Link
            href={`/trademark/submit?draftId=${draft.draftId}`}
            className="inline-flex rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white"
          >
            查看提交引导
          </Link>
        </SectionCard>
        <NextStepCard
          title="查看提交引导"
          description="申请书已生成，建议查看提交流程引导完成最终提交。"
          action={{ label: "前往提交引导", href: "/trademark/submit" }}
        />
        </>
      ) : null}
    </div>
  );
}

export function SubmitGuideWorkspace({ draftId }: { draftId?: string }) {
  const [guide, setGuide] = useState<Envelope<{ draft: ApplicationDraft; guide: { title: string; steps: string[]; officialUrl: string; warning: string } }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadGuide() {
      let activeDraftId = draftId;

      if (!activeDraftId) {
        try {
          const results = await request<ModuleResultItem[]>("/module-results?module_type=application_generate");
          if (results.length > 0) {
            const latest = results[results.length - 1];
            const appDraft = latest.resultData as unknown as ApplicationDraft;
            activeDraftId = appDraft?.draftId;
          }
        } catch {
          setError("未找到申请书，请先完成申请书生成。");
          return;
        }
      }

      if (!activeDraftId) {
        setError("未找到申请书，请先完成申请书生成。");
        return;
      }

      request<Envelope<{ draft: ApplicationDraft; guide: { title: string; steps: string[]; officialUrl: string; warning: string } }>>(
        `/trademarks/drafts/${activeDraftId}`
      )
        .then(setGuide)
        .catch((err: Error) => setError(err.message));
    }

    void loadGuide();
  }, [draftId]);

  return (
    <SectionCard title="提交流程引导" eyebrow="Compliance">
      {error ? <ErrorDisplay error={error} /> : null}
      {guide ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <SourceTag mode={guide.mode} provider={guide.provider} />
            <StatusBadge label="用户自行提交" tone="warning" />
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="font-medium text-slate-900">{guide.normalizedPayload.guide.title}</p>
            <ol className="mt-4 space-y-3 text-sm leading-7 text-slate-600">
              {guide.normalizedPayload.guide.steps.map((step, index) => (
                <li key={step}>
                  {index + 1}. {step}
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
            {guide.normalizedPayload.guide.warning}
          </div>
          <a
            href={guide.normalizedPayload.guide.officialUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-full bg-rust px-5 py-3 text-sm font-semibold text-white"
          >
            打开 CNIPA 官方入口
          </a>
        </div>
      ) : null}
    </SectionCard>
  );
}

export function AssetLedgerPanel() {
  const [assets, setAssets] = useState<IpAsset[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadAssets() {
    try {
      const response = await request<IpAsset[]>("/assets");
      setAssets(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    }
  }

  useEffect(() => {
    void loadAssets();
  }, []);

  async function handleCreate(formData: FormData) {
    setError(null);
    try {
      await request<IpAsset>("/assets", {
        method: "POST",
        body: JSON.stringify({
          name: String(formData.get("name") ?? ""),
          type: String(formData.get("type") ?? "trademark"),
          registration_number: String(formData.get("registrationNumber") ?? ""),
          expires_at: String(formData.get("expiresAt") ?? "")
        })
      });
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建失败");
    }
  }

  async function handleDelete(assetId: string) {
    setError(null);
    try {
      await request(`/assets/${assetId}`, { method: "DELETE" });
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard title="新增资产" eyebrow="Manual Ledger">
        <form onSubmit={async (e) => { e.preventDefault(); await handleCreate(new FormData(e.currentTarget)); }} className="grid gap-4 md:grid-cols-2">
          <input
            name="name"
            placeholder="资产名称"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            required
          />
          <select
            name="type"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
            defaultValue="trademark"
          >
            <option value="trademark">商标</option>
            <option value="patent">专利</option>
            <option value="soft-copyright">软著</option>
            <option value="copyright">版权</option>
          </select>
          <input
            name="registrationNumber"
            placeholder="注册号（可选）"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
          />
          <input
            name="expiresAt"
            type="date"
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring"
          />
          <button
            type="submit"
            className="inline-flex w-fit rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white"
          >
            添加资产
          </button>
        </form>
        {error ? <ErrorDisplay error={error} /> : null}
      </SectionCard>

      <SectionCard title="资产列表" eyebrow="Auto + Manual">
        <div className="space-y-3">
          {assets.length === 0 ? (
            <p className="text-sm text-slate-500">暂无资产记录。</p>
          ) : (
            assets.map((asset) => (
              <div key={asset.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-medium text-slate-900">{asset.name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {asset.type} · {asset.status} · 下次节点 {asset.nextMilestone ?? "待生成"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <SourceTag mode={asset.sourceMode} provider="ledger" />
                  <button
                    type="button"
                    onClick={() => void handleDelete(asset.id)}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </div>
  );
}

export function ReminderPanel() {
  const [tasks, setTasks] = useState<ReminderTask[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadTasks() {
    try {
      const response = await request<ReminderTask[]>("/reminders");
      setTasks(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提醒加载失败");
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  async function rerunTask(taskId: string) {
    setError(null);
    try {
      await request(`/jobs/${taskId}/rerun`, { method: "POST" });
      await loadTasks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "重跑失败");
    }
  }

  return (
    <SectionCard title="提醒中心" eyebrow="Queue + Retry">
      {error ? <ErrorDisplay error={error} /> : null}
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-500">暂无提醒任务。</p>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-medium text-slate-900">{task.channel.toUpperCase()}</p>
                <p className="mt-1 text-sm text-slate-500">
                  到期时间 {new Date(task.dueAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} · 资产 {task.assetId}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge
                  label={task.status}
                  tone={task.status === "sent" ? "success" : task.status === "failed" || task.status === "dead_letter" ? "danger" : "info"}
                />
                {(task.status === "failed" || task.status === "dead_letter") ? (
                  <button
                    type="button"
                    onClick={() => void rerunTask(task.id)}
                    className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    人工重跑
                  </button>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </SectionCard>
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

export function PatentAssessWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Envelope<PatentResult> | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [description, setDescription] = useState("");

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setStreamingText("");
    try {
      await fetchSSE<Envelope<PatentResult>>(
        `${proxyBaseUrl}/stream/patents/assess`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: String(formData.get("description") ?? "") })
        },
        {
          onToken: (token) => setStreamingText(prev => prev + token),
          onResult: (envelope) => { setResult(envelope); setStreamingText(""); },
          onError: (msg) => { setError(msg); setStreamingText(""); }
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "评估失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard title="专利/软著评估" eyebrow="Patent & Copyright">
        <form onSubmit={async (e) => { e.preventDefault(); await handleSubmit(new FormData(e.currentTarget)); }} className="grid gap-4">
          <FileUpload onTextExtracted={setDescription} label="上传技术文档，自动提取描述" />
          <textarea
            name="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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
            ) : "执行评估"}
          </button>
          {streamingText && (
            <div className="rounded-2xl border border-rust/20 bg-rust/5 p-4">
              <p className="leading-7 text-slate-700 whitespace-pre-wrap">{streamingText}</p>
              <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-rust" />
                正在生成...
              </div>
            </div>
          )}
          {error && <ErrorDisplay error={error} />}
        </form>
      </SectionCard>

      {result && (
        <SectionCard
          title="评估结果"
          eyebrow="Result"
          actions={<SourceTag mode={result.mode} provider={result.provider} />}
        >
          <div className="flex items-center gap-3">
            <StatusBadge label={`推荐类型: ${patentTypeLabel[result.normalizedPayload.recommended_type] || result.normalizedPayload.recommended_type}`} tone="info" />
            <StatusBadge label={`可行性: ${result.normalizedPayload.feasibility}`} tone={result.normalizedPayload.feasibility === "high" ? "success" : "warning"} />
          </div>
          <p className="mt-4 leading-7 text-slate-700">{result.normalizedPayload.novelty_assessment}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">技术要点</p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {(result.normalizedPayload.key_points ?? []).map((item, index) => <li key={index}>• {item}</li>)}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-700">需要材料</p>
              <ul className="mt-3 space-y-1 text-sm text-slate-600">
                {(result.normalizedPayload.materials_needed ?? []).map((item, index) => <li key={index}>• {item}</li>)}
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
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">{result.disclaimer}</div>
        </SectionCard>
      )}
    </div>
  );
}
