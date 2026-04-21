"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceCard, SubmitButton } from "@a1plus/ui";
import { proxyBaseUrl } from "@/lib/env";

const INDUSTRIES = [
  "软件和信息技术服务",
  "电子商务 / 跨境电商",
  "制造业",
  "生物医药 / 医疗健康",
  "教育培训",
  "金融科技",
  "新能源 / 环保",
  "文化创意 / 媒体",
  "餐饮 / 食品",
  "农业科技",
];

const STAGES = [
  { value: "seed", label: "初创期" },
  { value: "pre-launch", label: "上线前" },
  { value: "growth", label: "成长期" },
  { value: "mature", label: "成熟期" },
];

const IP_FOCUS_OPTIONS = [
  { value: "trademark", label: "商标" },
  { value: "patent", label: "专利" },
  { value: "copyright", label: "软著 / 版权" },
  { value: "trade_secret", label: "商业秘密" },
  { value: "design", label: "外观设计" },
];

const INTENT_LABEL: Record<string, string> = {
  trademark: "商标",
  patent: "专利",
  copyright: "版权 / 软著",
  contract: "合同审查",
  litigation: "诉讼维权",
  compliance: "合规 / 数据",
  dueDiligence: "融资尽调",
  general: "综合咨询",
};

const URGENCY_LABEL: Record<string, string> = {
  low: "不急",
  medium: "中等",
  high: "很急",
};

const INTENT_TO_FOCUS: Record<string, string | null> = {
  trademark: "trademark",
  patent: "patent",
  copyright: "copyright",
  contract: null,
  litigation: null,
  compliance: null,
  dueDiligence: null,
  general: null,
};

const SAMPLE_QUERIES = [
  "我们是做跨境电商的，想尽快在美国注册商标，预算 1 万",
  "刚融资完成 A 轮，需要把核心算法申请发明专利",
  "合作方想 OEM 我们的产品，想让律师审一下合同",
  "收到了侵权警告函，需要紧急处理",
];

type Fingerprint = {
  intent: string;
  urgency: string;
  budget?: string | null;
  region?: string | null;
  tags: string[];
  snapshot?: {
    industry?: string;
    stage?: string;
    businessName?: string;
  } | null;
  llm_used?: boolean;
};

type FormData = {
  query: string;
  fingerprint: Fingerprint | null;
  businessName: string;
  applicantType: string;
  industry: string;
  customIndustry: string;
  businessDescription: string;
  stage: string;
  hasTrademark: boolean | null;
  hasPatent: boolean | null;
  ipFocus: string[];
};

const TOTAL_STEPS = 5;

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    query: "",
    fingerprint: null,
    businessName: "",
    applicantType: "company",
    industry: "",
    customIndustry: "",
    businessDescription: "",
    stage: "",
    hasTrademark: null,
    hasPatent: null,
    ipFocus: [],
  });

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function toggleIpFocus(value: string) {
    setForm((prev) => ({
      ...prev,
      ipFocus: prev.ipFocus.includes(value)
        ? prev.ipFocus.filter((v) => v !== value)
        : [...prev.ipFocus, value],
    }));
  }

  function toggleFingerprintTag(tag: string) {
    setForm((prev) => {
      if (!prev.fingerprint) return prev;
      const has = prev.fingerprint.tags.includes(tag);
      return {
        ...prev,
        fingerprint: {
          ...prev.fingerprint,
          tags: has
            ? prev.fingerprint.tags.filter((t) => t !== tag)
            : [...prev.fingerprint.tags, tag],
        },
      };
    });
  }

  async function handleExtract() {
    if (!form.query.trim()) {
      setError("请先用一句话描述你的需求");
      return;
    }
    setExtracting(true);
    setError(null);
    try {
      const res = await fetch(`${proxyBaseUrl}/profile/fingerprint/preview`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_query: form.query.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as Fingerprint;
      setForm((prev) => {
        const suggestedFocus = INTENT_TO_FOCUS[data.intent];
        const nextFocus =
          suggestedFocus && !prev.ipFocus.includes(suggestedFocus)
            ? [...prev.ipFocus, suggestedFocus]
            : prev.ipFocus;
        return {
          ...prev,
          fingerprint: data,
          businessDescription: prev.businessDescription || form.query,
          ipFocus: nextFocus,
        };
      });
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "画像生成失败，请重试");
    } finally {
      setExtracting(false);
    }
  }

  async function handleFinish() {
    setSaving(true);
    setError(null);

    const industry = form.industry === "__custom__" ? form.customIndustry : form.industry;

    try {
      const res = await fetch(`${proxyBaseUrl}/profile`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: form.businessName,
          applicantType: form.applicantType,
          industry,
          businessDescription: form.businessDescription || form.query,
          stage: form.stage,
          hasTrademark: form.hasTrademark ?? false,
          hasPatent: form.hasPatent ?? false,
          ipFocus: form.ipFocus.join(","),
          initialQuery: form.query || undefined,
          fingerprintTags: form.fingerprint?.tags ?? [],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  const stageLabel = STAGES.find((s) => s.value === form.stage)?.label ?? form.stage;
  const industryLabel =
    form.industry === "__custom__" ? form.customIndustry : form.industry;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-2">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full transition-colors ${
              i < step ? "bg-primary-500" : "bg-border"
            }`}
          />
        ))}
        <span className="ml-2 text-sm text-text-tertiary">
          {step}/{TOTAL_STEPS}
        </span>
      </div>

      {step === 1 && (
        <WorkspaceCard title="一句话说出你的需求" eyebrow="Step 1 · 智能画像">
          <p className="text-sm leading-7 text-text-secondary">
            不用填繁琐表单——用你自己的话描述场景，AI
            会自动抽取意图、紧急度、预算、地区等标签，形成你的「需求画像」。
          </p>
          <div className="mt-4 grid gap-3">
            <textarea
              value={form.query}
              onChange={(e) => update("query", e.target.value)}
              placeholder="例如：我们是做跨境电商的，想尽快在美国注册商标，预算大约 1 万"
              rows={4}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
            />
            <div>
              <div className="mb-1.5 text-xs text-text-tertiary">不知道怎么写？试试这些：</div>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_QUERIES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => update("query", q)}
                    className="rounded-full border border-dashed border-border bg-surface px-3 py-1 text-[11px] text-text-secondary transition-colors hover:border-primary-400 hover:text-primary-600"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </WorkspaceCard>
      )}

      {step === 2 && form.fingerprint && (
        <WorkspaceCard title="AI 为你生成的需求画像" eyebrow="Step 2 · 画像确认">
          <p className="text-sm leading-7 text-text-secondary">
            以下是 AI
            从你描述里抽取的关键信息，确认无误即可进入下一步。可以直接点击调整标签。
            {form.fingerprint.llm_used ? (
              <span className="ml-1 rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-600">
                LLM 增强
              </span>
            ) : null}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <InfoChip
              label="主要意图"
              value={INTENT_LABEL[form.fingerprint.intent] ?? form.fingerprint.intent}
            />
            <InfoChip
              label="紧急度"
              value={URGENCY_LABEL[form.fingerprint.urgency] ?? form.fingerprint.urgency}
            />
            <InfoChip label="预算" value={form.fingerprint.budget ?? "未明确"} />
            <InfoChip label="地区" value={form.fingerprint.region ?? "未明确"} />
          </dl>

          <div className="mt-4">
            <div className="mb-2 text-xs font-medium text-text-tertiary">
              画像标签（可点击开关）
            </div>
            <div className="flex flex-wrap gap-2">
              {form.fingerprint.tags.length === 0 && (
                <span className="text-xs text-text-tertiary">暂未生成标签</span>
              )}
              {form.fingerprint.tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleFingerprintTag(t)}
                  className="rounded-full border border-primary-200 bg-primary-50 px-3 py-1 text-[11px] text-primary-700 transition-colors hover:bg-primary-100"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setStep(1)}
            className="mt-4 text-xs text-primary-600 hover:underline"
          >
            ← 描述不对？重写一句话
          </button>
        </WorkspaceCard>
      )}

      {step === 3 && (
        <WorkspaceCard title="补充基本信息" eyebrow="Step 3 · 档案">
          <p className="text-sm leading-7 text-text-secondary">
            用于后续商标申请、合同、诉讼等文书自动预填。
          </p>
          <div className="mt-4 grid gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">
                公司名称 / 项目名
              </label>
              <input
                value={form.businessName}
                onChange={(e) => update("businessName", e.target.value)}
                placeholder="例如：星火科技有限公司"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">申请人类型</label>
              <div className="grid grid-cols-2 gap-3">
                {["company", "individual"].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => update("applicantType", type)}
                    className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                      form.applicantType === type
                        ? "border-primary-500 bg-primary-50 text-primary-500"
                        : "border-border bg-surface text-text-secondary hover:bg-surface-sunken"
                    }`}
                  >
                    {type === "company" ? "企业" : "个人"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </WorkspaceCard>
      )}

      {step === 4 && (
        <WorkspaceCard title="行业与阶段（可跳过）" eyebrow="Step 4 · 场景">
          <p className="text-sm leading-7 text-text-secondary">
            用于场景化推送、政策雷达和合规巡检。
          </p>
          <div className="mt-4 grid gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">所属行业</label>
              <select
                value={form.industry}
                onChange={(e) => update("industry", e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
              >
                <option value="">请选择行业</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
                <option value="__custom__">其他（自定义）</option>
              </select>
              {form.industry === "__custom__" && (
                <input
                  value={form.customIndustry}
                  onChange={(e) => update("customIndustry", e.target.value)}
                  placeholder="请输入您的行业"
                  className="mt-2 w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
                />
              )}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">企业阶段</label>
              <div className="grid grid-cols-2 gap-3">
                {STAGES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => update("stage", s.value)}
                    className={`rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                      form.stage === s.value
                        ? "border-primary-500 bg-primary-50 text-primary-500"
                        : "border-border bg-surface text-text-secondary hover:bg-surface-sunken"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-text-primary">
                关注的 IP 领域（可多选）
              </label>
              <div className="flex flex-wrap gap-2">
                {IP_FOCUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleIpFocus(opt.value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      form.ipFocus.includes(opt.value)
                        ? "border-primary-500 bg-primary-50 text-primary-500"
                        : "border-border bg-surface text-text-secondary hover:bg-surface-sunken"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-tertiary">
                  已有商标？
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: true, label: "有" },
                    { val: false, label: "暂无" },
                  ].map((opt) => (
                    <button
                      key={String(opt.val)}
                      type="button"
                      onClick={() => update("hasTrademark", opt.val)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        form.hasTrademark === opt.val
                          ? "border-primary-500 bg-primary-50 text-primary-500"
                          : "border-border bg-surface text-text-secondary hover:bg-surface-sunken"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-text-tertiary">
                  已有专利/软著？
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: true, label: "有" },
                    { val: false, label: "暂无" },
                  ].map((opt) => (
                    <button
                      key={String(opt.val)}
                      type="button"
                      onClick={() => update("hasPatent", opt.val)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                        form.hasPatent === opt.val
                          ? "border-primary-500 bg-primary-50 text-primary-500"
                          : "border-border bg-surface text-text-secondary hover:bg-surface-sunken"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </WorkspaceCard>
      )}

      {step === 5 && (
        <WorkspaceCard title="确认并开始" eyebrow="Step 5">
          <p className="text-sm leading-7 text-text-secondary">
            下面的画像 + 档案会同步保存到你的账户；之后可以随时在「我的画像」页面调整。
          </p>
          <div className="mt-4 space-y-3 rounded-md border border-border bg-surface p-4">
            <SummaryRow label="一句话需求" value={form.query || "—"} />
            {form.fingerprint && (
              <>
                <SummaryRow
                  label="意图 · 紧急度"
                  value={`${INTENT_LABEL[form.fingerprint.intent] ?? form.fingerprint.intent} · ${
                    URGENCY_LABEL[form.fingerprint.urgency] ?? form.fingerprint.urgency
                  }`}
                />
                <SummaryRow
                  label="预算 · 地区"
                  value={`${form.fingerprint.budget ?? "—"} · ${form.fingerprint.region ?? "—"}`}
                />
                <SummaryRow
                  label="标签"
                  value={
                    form.fingerprint.tags.length > 0 ? form.fingerprint.tags.join("、") : "—"
                  }
                />
              </>
            )}
            <SummaryRow label="公司名称" value={form.businessName || "—"} />
            <SummaryRow
              label="申请人类型"
              value={form.applicantType === "company" ? "企业" : "个人"}
            />
            <SummaryRow label="所属行业" value={industryLabel || "—"} />
            <SummaryRow label="企业阶段" value={stageLabel || "—"} />
            <SummaryRow
              label="关注领域"
              value={
                form.ipFocus.length > 0
                  ? form.ipFocus
                      .map((v) => IP_FOCUS_OPTIONS.find((o) => o.value === v)?.label ?? v)
                      .join("、")
                  : "—"
              }
            />
          </div>
        </WorkspaceCard>
      )}

      <div className="flex items-center gap-3">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-sunken"
          >
            上一步
          </button>
        )}
        {step === 1 ? (
          <button
            type="button"
            onClick={handleExtract}
            disabled={extracting}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:opacity-60"
          >
            {extracting ? "AI 识别中…" : "生成需求画像"}
          </button>
        ) : step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600"
          >
            下一步
          </button>
        ) : (
          <SubmitButton
            type="button"
            loading={saving}
            loadingText="保存中..."
            onClick={handleFinish}
          >
            开始使用
          </SubmitButton>
        )}
        {step === 1 && (
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="text-sm text-text-tertiary hover:text-text-secondary"
          >
            跳过
          </button>
        )}
      </div>
      {error && <p className="text-sm text-error-700">{error}</p>}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 text-sm">
      <span className="w-24 shrink-0 text-text-tertiary">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-elevated px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-text-primary">{value}</div>
    </div>
  );
}
