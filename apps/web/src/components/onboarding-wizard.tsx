"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SectionCard } from "@a1plus/ui";
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

type FormData = {
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

const TOTAL_STEPS = 4;

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
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
          businessDescription: form.businessDescription,
          stage: form.stage,
          hasTrademark: form.hasTrademark ?? false,
          hasPatent: form.hasPatent ?? false,
          ipFocus: form.ipFocus.join(","),
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

  const inputCls =
    "w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none ring-rust/20 focus:ring";
  const btnCls =
    "inline-flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60";
  const btnOutlineCls =
    "rounded-full border border-slate-200 px-5 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50";

  const stageLabel = STAGES.find((s) => s.value === form.stage)?.label ?? form.stage;
  const industryLabel =
    form.industry === "__custom__" ? form.customIndustry : form.industry;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        {Array.from({ length: TOTAL_STEPS }, (_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full transition ${
              i < step ? "bg-rust" : "bg-slate-200"
            }`}
          />
        ))}
        <span className="ml-2 text-sm text-slate-400">
          {step}/{TOTAL_STEPS}
        </span>
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <SectionCard title="基本信息" eyebrow="Step 1">
          <p className="text-sm leading-7 text-slate-600">
            告诉我们您的企业信息，后续操作将自动预填。
          </p>
          <div className="mt-4 grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                公司名称 / 项目名
              </label>
              <input
                value={form.businessName}
                onChange={(e) => update("businessName", e.target.value)}
                placeholder="例如：星火科技有限公司"
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                申请人类型
              </label>
              <div className="grid grid-cols-2 gap-3">
                {["company", "individual"].map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => update("applicantType", type)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      form.applicantType === type
                        ? "border-rust bg-rust/10 text-rust"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {type === "company" ? "企业" : "个人"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Step 2: Business Description */}
      {step === 2 && (
        <SectionCard title="业务描述" eyebrow="Step 2">
          <p className="text-sm leading-7 text-slate-600">
            了解您的业务方向有助于提供更精准的 IP 建议。
          </p>
          <div className="mt-4 grid gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                所属行业
              </label>
              <select
                value={form.industry}
                onChange={(e) => update("industry", e.target.value)}
                className={inputCls}
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
                  className={`mt-2 ${inputCls}`}
                />
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                主营业务描述
              </label>
              <textarea
                value={form.businessDescription}
                onChange={(e) => update("businessDescription", e.target.value)}
                placeholder="描述您的产品、服务、目标客群和商业场景..."
                rows={4}
                className={inputCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                企业阶段
              </label>
              <div className="grid grid-cols-2 gap-3">
                {STAGES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => update("stage", s.value)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      form.stage === s.value
                        ? "border-rust bg-rust/10 text-rust"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Step 3: IP Status */}
      {step === 3 && (
        <SectionCard title="知识产权现状" eyebrow="Step 3">
          <p className="text-sm leading-7 text-slate-600">
            了解您当前的知识产权状况，帮助系统提供更有针对性的建议。
          </p>
          <div className="mt-4 grid gap-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                您是否已有注册商标？
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { val: true, label: "是，已有商标" },
                  { val: false, label: "暂无" },
                ].map((opt) => (
                  <button
                    key={String(opt.val)}
                    type="button"
                    onClick={() => update("hasTrademark", opt.val)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      form.hasTrademark === opt.val
                        ? "border-rust bg-rust/10 text-rust"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                您是否已有专利或软著？
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { val: true, label: "是，已有专利/软著" },
                  { val: false, label: "暂无" },
                ].map((opt) => (
                  <button
                    key={String(opt.val)}
                    type="button"
                    onClick={() => update("hasPatent", opt.val)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      form.hasPatent === opt.val
                        ? "border-rust bg-rust/10 text-rust"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                主要关注的 IP 领域（可多选）
              </label>
              <div className="flex flex-wrap gap-2">
                {IP_FOCUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleIpFocus(opt.value)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      form.ipFocus.includes(opt.value)
                        ? "border-rust bg-rust/10 text-rust"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Step 4: Summary */}
      {step === 4 && (
        <SectionCard title="确认信息" eyebrow="Step 4">
          <p className="text-sm leading-7 text-slate-600">
            确认以下信息，随时可在个人中心修改。
          </p>
          <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <SummaryRow label="公司名称" value={form.businessName || "—"} />
            <SummaryRow label="申请人类型" value={form.applicantType === "company" ? "企业" : "个人"} />
            <SummaryRow label="所属行业" value={industryLabel || "—"} />
            <SummaryRow label="业务描述" value={form.businessDescription || "—"} />
            <SummaryRow label="企业阶段" value={stageLabel || "—"} />
            <SummaryRow label="已有商标" value={form.hasTrademark === true ? "是" : form.hasTrademark === false ? "暂无" : "—"} />
            <SummaryRow label="已有专利/软著" value={form.hasPatent === true ? "是" : form.hasPatent === false ? "暂无" : "—"} />
            <SummaryRow
              label="关注领域"
              value={
                form.ipFocus.length > 0
                  ? form.ipFocus.map((v) => IP_FOCUS_OPTIONS.find((o) => o.value === v)?.label ?? v).join("、")
                  : "—"
              }
            />
          </div>
        </SectionCard>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center gap-3">
        {step > 1 && (
          <button type="button" onClick={() => setStep(step - 1)} className={btnOutlineCls}>
            上一步
          </button>
        )}
        {step < TOTAL_STEPS ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            className={btnCls}
          >
            下一步
          </button>
        ) : (
          <button
            type="button"
            onClick={handleFinish}
            disabled={saving}
            className={btnCls}
          >
            {saving ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                保存中...
              </>
            ) : (
              "开始使用"
            )}
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="text-sm text-slate-400 hover:text-slate-600"
        >
          跳过
        </button>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 text-sm">
      <span className="w-24 shrink-0 text-slate-500">{label}</span>
      <span className="text-slate-800">{value}</span>
    </div>
  );
}
