"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  ApplicationDraft,
  ModuleResultItem,
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
import {
  PageHeader,
  SectionHeader,
  IconGlyph,
  accentBgClass,
  type Accent,
} from "./primitives";
import { SegmentedRings } from "./viz-hero";
import { request, ErrorDisplay } from "./shared";
import type { Envelope } from "./shared";

export function ApplicationWorkspace() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ApplicationDraft | null>(null);
  const [liveForm, setLiveForm] = useState<{
    trademarkName: string;
    businessDescription: string;
    applicantName: string;
    categories: string;
  }>({ trademarkName: "", businessDescription: "", applicantName: "", categories: "" });
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
            categories: envelope.normalizedPayload?.suggestedCategories,
          }));
        }
      })
      .catch(() => {});

    fetch(`/api/backend/profile`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((p: { applicantName?: string; applicantType?: string; businessDescription?: string } | null) => {
        if (!p) return;
        setPrefillData((prev) => ({
          ...prev,
          applicantName: p.applicantName,
          applicantType: p.applicantType,
          businessDescription: p.businessDescription,
        }));
      })
      .catch(() => {});
  }, []);

  // Sync live form from prefill once it arrives (only if empty)
  useEffect(() => {
    setLiveForm((prev) => ({
      trademarkName: prev.trademarkName || "",
      businessDescription: prev.businessDescription || prefillData.businessDescription || "",
      applicantName: prev.applicantName || prefillData.applicantName || "",
      categories: prev.categories || (prefillData.categories ?? []).join(","),
    }));
  }, [prefillData]);

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
      risk_level: prefillData.riskLevel ?? "yellow",
    };

    try {
      const response = await request<{ id: string; result?: ApplicationDraft }>(
        "/trademarks/application/jobs",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );

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

  const completion = useMemo(() => {
    const fields = [
      liveForm.trademarkName,
      liveForm.businessDescription,
      liveForm.applicantName,
      liveForm.categories,
    ];
    const filled = fields.filter((v) => v.trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [liveForm]);

  const missing: string[] = [];
  if (!liveForm.trademarkName.trim()) missing.push("商标名称");
  if (!liveForm.businessDescription.trim()) missing.push("业务描述");
  if (!liveForm.applicantName.trim()) missing.push("申请人");
  if (!liveForm.categories.trim()) missing.push("尼斯分类");

  const completionAccent: Accent =
    completion >= 100 ? "success" : completion >= 50 ? "warning" : "error";

  const formRings = useMemo(() => {
    const hasApplicant = liveForm.applicantName.trim().length > 0;
    const hasTm = liveForm.trademarkName.trim().length > 0;
    const hasDesc = liveForm.businessDescription.trim().length > 0;
    const hasCat = liveForm.categories.trim().length > 0;
    const ratio = (ok: boolean, partial?: number) => (ok ? 100 : (partial ?? 0));
    return [
      {
        label: "申请人",
        percent: ratio(hasApplicant),
        color: "rgb(var(--color-primary-500))",
        hint: hasApplicant ? "已填" : "必填",
      },
      {
        label: "商标信息",
        percent: ratio(hasTm, 30),
        color: "rgb(var(--color-primary-600))",
        hint: hasTm ? "已填" : "必填",
      },
      {
        label: "商品服务",
        percent: hasDesc && hasCat ? 100 : hasDesc || hasCat ? 50 : 0,
        color: "rgb(var(--color-info-500))",
        hint: hasDesc && hasCat ? "齐全" : hasDesc || hasCat ? "部分" : "未填",
      },
      {
        label: "声明",
        percent: hasApplicant && hasTm && hasDesc && hasCat ? 100 : 40,
        color: "rgb(var(--color-success-500))",
        hint: hasApplicant && hasTm && hasDesc && hasCat ? "就绪" : "待签",
      },
    ];
  }, [liveForm]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Application draft"
        title="商标申请书生成"
        icon="edit"
        accent="primary"
        description="基于诊断与查重结果自动填充申请书，支持 DOCX/PDF 下载。"
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        {/* ===== Left: form ===== */}
        <WorkspaceCard title="申请信息" eyebrow="Form">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await handleSubmit(new FormData(e.currentTarget));
            }}
            className="grid gap-4"
          >
            <FormInput
              name="trademarkName"
              label="商标名称"
              placeholder="商标名称"
              defaultValue={prefillData.trademarkName ?? ""}
              onChange={(e) => setLiveForm((p) => ({ ...p, trademarkName: e.target.value }))}
              required
            />
            <FormTextarea
              name="businessDescription"
              label="业务描述"
              placeholder="业务描述"
              defaultValue={prefillData.businessDescription ?? ""}
              onChange={(e) => setLiveForm((p) => ({ ...p, businessDescription: e.target.value }))}
              rows={5}
              required
            />
            <div className="grid gap-4 md:grid-cols-3">
              <FormInput
                name="applicantName"
                label="申请人"
                placeholder="申请人名称"
                defaultValue={prefillData.applicantName ?? ""}
                onChange={(e) => setLiveForm((p) => ({ ...p, applicantName: e.target.value }))}
                required
              />
              <div className="w-full">
                <label htmlFor="applicantType" className="mb-1.5 block text-sm font-medium text-text-primary">
                  类型
                </label>
                <select
                  id="applicantType"
                  name="applicantType"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-primary outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20"
                  defaultValue={prefillData.applicantType ?? "company"}
                >
                  <option value="company">企业</option>
                  <option value="individual">个人</option>
                </select>
              </div>
              <FormInput
                name="categories"
                label="尼斯分类"
                placeholder="类别，用逗号分隔"
                defaultValue={prefillData.categories?.join(",") ?? ""}
                onChange={(e) => setLiveForm((p) => ({ ...p, categories: e.target.value }))}
                required
              />
            </div>
            <SubmitButton loading={loading} loadingText="正在生成申请书...">
              生成 Word / PDF
            </SubmitButton>
            {loading && (
              <p className="text-sm text-text-tertiary">
                AI 正在分析商标信息并生成文档，通常需要 10–20 秒...
              </p>
            )}
            {error ? <ErrorDisplay error={error} /> : null}
          </form>
        </WorkspaceCard>

        {/* ===== Right: blueprint preview ===== */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border-2 border-dashed border-primary-300 bg-primary-50/20 p-5">
            <SectionHeader
              eyebrow="Blueprint preview"
              title="申请书实时蓝图"
              description="跟随左侧填写实时更新"
              actions={
                <Badge variant={completionAccent === "success" ? "success" : completionAccent === "warning" ? "warning" : "error"} size="sm" dot>
                  完整度 {completion}%
                </Badge>
              }
            />

            <div className="mt-4 text-primary-600">
              <SegmentedRings items={formRings} size={70} strokeWidth={7} />
            </div>

            {missing.length > 0 && (
              <div className="mt-3 rounded-md border border-warning-100 bg-warning-50/60 p-2.5 text-[11px]">
                <p className="font-medium text-warning-700">待填字段</p>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {missing.map((m) => (
                    <li key={m} className="flex items-center gap-1 text-warning-700">
                      <IconGlyph name="alert" size={10} />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Blueprint: dashed rule ticks along top and bottom */}
            <div className="relative mt-5 rounded-md border-2 border-dashed border-primary-300 bg-[linear-gradient(rgb(var(--color-primary-100)/0.25)_1px,transparent_1px)] bg-[size:100%_24px] p-5 font-mono text-sm">
              <div className="pointer-events-none absolute inset-x-4 -top-[1px] flex justify-between">
                {Array.from({ length: 11 }).map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block w-px ${i % 5 === 0 ? "h-3" : "h-1.5"} bg-primary-400`}
                  />
                ))}
              </div>
              <div className="pointer-events-none absolute inset-y-4 -left-[1px] flex flex-col justify-between">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span
                    key={i}
                    className={`inline-block h-px ${i % 2 === 0 ? "w-3" : "w-1.5"} bg-primary-400`}
                  />
                ))}
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-primary-600">商标名称</p>
                  <p className="font-serif text-xl font-medium tracking-tight text-text-primary">
                    {liveForm.trademarkName || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-primary-600">申请人</p>
                  <p className="text-sm text-text-primary">{liveForm.applicantName || "—"}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-primary-600">业务描述</p>
                  <p className="line-clamp-3 text-xs leading-6 text-text-secondary">
                    {liveForm.businessDescription || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-primary-600">类别</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {liveForm.categories
                      .split(",")
                      .map((c) => c.trim())
                      .filter(Boolean)
                      .map((c) => (
                        <span
                          key={c}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${accentBgClass("primary")}`}
                        >
                          第 {c} 类
                        </span>
                      ))}
                    {liveForm.categories.trim().length === 0 && (
                      <span className="text-xs text-text-tertiary">—</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {draft ? (
        <>
          <WorkspaceCard
            title="申请书已生成"
            eyebrow="Documents"
            actions={
              <div className="flex items-center gap-2">
                <DataTag mode={draft.sourceMode} provider={draft.provider} />
                <Badge variant="success" size="sm" dot>
                  自动入台账已启用
                </Badge>
              </div>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-border bg-surface p-4">
                <p className="font-serif text-xl font-medium tracking-tight text-text-primary">
                  {draft.trademarkName}
                </p>
                <p className="mt-2 text-sm text-text-tertiary">
                  申请人 {draft.applicantName} · 类别 {(draft.categories ?? []).join(", ")}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge
                    variant={
                      draft.riskLevel === "green"
                        ? "success"
                        : draft.riskLevel === "yellow"
                          ? "warning"
                          : "error"
                    }
                    size="sm"
                    dot
                  >
                    {riskLevelMeta[draft.riskLevel ?? "yellow"].label}
                  </Badge>
                  {(draft.documentLabels ?? []).map((label) => (
                    <Badge key={label} variant="info" size="sm">
                      {label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <a
                  className="group flex items-center gap-3 rounded-lg border border-transparent bg-primary-600 p-4 text-text-inverse transition-colors hover:bg-primary-700"
                  href={`/api/backend${draft.downloadEndpoints.docx}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-500">
                    <IconGlyph name="download" size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">下载 DOCX</p>
                    <p className="text-xs opacity-80">可编辑源文件，适合二次修改</p>
                  </div>
                  <IconGlyph name="external" size={14} className="opacity-70" />
                </a>
                <a
                  className="group flex items-center gap-3 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
                  href={`/api/backend${draft.downloadEndpoints.pdf}`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-md bg-info-50 text-info-700">
                    <IconGlyph name="download" size={18} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary">下载 PDF</p>
                    <p className="text-xs text-text-tertiary">标准格式，适合打印 / 归档</p>
                  </div>
                  <IconGlyph name="external" size={14} className="text-text-muted" />
                </a>
              </div>
            </div>

            <DisclaimerBox>
              申请书仅供参考，请在提交前核对所有信息并结合 CNIPA 官方要求。
            </DisclaimerBox>
          </WorkspaceCard>

          <div className="rounded-lg border border-primary-100 bg-primary-50/60 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">
                  <span className="mr-1.5 text-primary-600">→</span>
                  下一步：提交引导
                </p>
                <p className="mt-1 text-xs text-text-secondary">
                  按提交引导登录 CNIPA 完成正式提交；系统会自动同步节点到台账。
                </p>
              </div>
              <Link
                href={`/trademark/submit?draftId=${draft.draftId}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
              >
                <IconGlyph name="external" size={14} />
                查看提交引导
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
