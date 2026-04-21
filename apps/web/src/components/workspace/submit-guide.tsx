"use client";

import { useEffect, useState } from "react";
import type { ApplicationDraft, ModuleResultItem } from "@a1plus/domain";
import {
  WorkspaceCard,
  DataTag,
  Badge,
  DisclaimerBox,
} from "@a1plus/ui";
import {
  PageHeader,
  SectionHeader,
  IconGlyph,
  accentBgClass,
  type IconName,
  type Accent,
} from "./primitives";
import { MilestoneTrack, RadialProgress } from "./viz-hero";
import { request, ErrorDisplay } from "./shared";
import type { Envelope } from "./shared";

const WORKFLOW_STEPS = [
  { name: "业务诊断", description: "确认保护方向与分类" },
  { name: "商标查重", description: "排查近似风险" },
  { name: "申请书生成", description: "自动填充申请材料" },
  { name: "准备提交", description: "核对材料 · 登录 CNIPA", icon: "upload" as IconName },
  { name: "形式审查", description: "1 – 2 个月" },
  { name: "公告受理", description: "9 – 12 个月" },
];

type StepAccent = { icon: IconName; accent: Accent; durationHint?: string };

const stepMeta: StepAccent[] = [
  { icon: "download", accent: "primary", durationHint: "5 分钟" },
  { icon: "approval", accent: "info", durationHint: "10 分钟" },
  { icon: "building", accent: "warning", durationHint: "30 分钟" },
  { icon: "upload", accent: "success", durationHint: "5 分钟" },
  { icon: "external", accent: "muted", durationHint: "实时" },
  { icon: "check", accent: "success", durationHint: "视官方而定" },
];

const CHECKLIST_ITEMS = [
  { id: "license", label: "营业执照或身份证复印件" },
  { id: "logo", label: "商标图样（JPG 不超过 5 × 5 厘米）" },
  { id: "application", label: "申请书 DOCX/PDF" },
  { id: "category", label: "确认好尼斯分类与商品小类" },
  { id: "fee", label: "申请费用（官费约 300 元/类）" },
  { id: "contact", label: "联系地址与电话填写无误" },
];

const STORAGE_KEY = "submit-guide.checklist";

function useChecklist() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setDone(JSON.parse(stored));
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = (id: string) => {
    setDone((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  return { done, toggle };
}

export function SubmitGuideWorkspace({ draftId }: { draftId?: string }) {
  const [guide, setGuide] = useState<Envelope<{
    draft: ApplicationDraft;
    guide: { title: string; steps: string[]; officialUrl: string; warning: string };
  }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { done, toggle } = useChecklist();

  useEffect(() => {
    async function loadGuide() {
      let activeDraftId = draftId;

      if (!activeDraftId) {
        try {
          const results = await request<ModuleResultItem[]>(
            "/module-results?module_type=application_generate",
          );
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

      request<
        Envelope<{
          draft: ApplicationDraft;
          guide: { title: string; steps: string[]; officialUrl: string; warning: string };
        }>
      >(`/trademarks/drafts/${activeDraftId}`)
        .then(setGuide)
        .catch((err: Error) => setError(err.message));
    }

    void loadGuide();
  }, [draftId]);

  const checklistDone = CHECKLIST_ITEMS.filter((c) => done[c.id]).length;
  const checklistRatio = Math.round((checklistDone / CHECKLIST_ITEMS.length) * 100);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Submit guide"
        title="准备提交"
        icon="external"
        accent="primary"
        description="申请书已备好，按以下步骤登录 CNIPA 官方系统完成提交。A1+ 不代替您提交。"
        actions={
          guide && (
            <a
              href={guide.normalizedPayload.guide.officialUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary-600 px-4 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-700"
            >
              <IconGlyph name="external" size={14} />
              打开 CNIPA 官方入口
            </a>
          )
        }
      />

      {error ? <ErrorDisplay error={error} /> : null}

      {/* ===== 流程概览 ===== */}
      <WorkspaceCard title="商标注册流程" eyebrow="Workflow" actions={
        <Badge variant="warning" size="sm" dot>
          准备提交中
        </Badge>
      }>
        <div className="pt-2">
          <MilestoneTrack
            steps={WORKFLOW_STEPS.map((s, i) => ({
              label: s.name,
              hint: stepMeta[i]?.durationHint ?? s.description,
            }))}
            current={3}
            color="rgb(var(--color-primary-600))"
          />
        </div>
      </WorkspaceCard>

      {guide ? (
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            <WorkspaceCard
              title={guide.normalizedPayload.guide.title}
              eyebrow="Submission steps"
              actions={
                <div className="flex items-center gap-2">
                  <DataTag mode={guide.mode} provider={guide.provider} />
                  <Badge variant="warning" size="sm">用户自行提交</Badge>
                </div>
              }
            >
              <ol className="space-y-3">
                {guide.normalizedPayload.guide.steps.map((step, index) => {
                  const meta = stepMeta[index] ?? stepMeta[0];
                  return (
                    <li
                      key={step}
                      className="flex items-start gap-4 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${accentBgClass(meta.accent)} num-display text-sm font-semibold`}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-6 text-text-primary">{step}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
                          <span className="inline-flex items-center gap-1">
                            <IconGlyph name={meta.icon} size={12} />
                            步骤 {index + 1}
                          </span>
                          {meta.durationHint && (
                            <>
                              <span className="text-text-muted">·</span>
                              <span className="inline-flex items-center gap-1">
                                <IconGlyph name="clock" size={12} />
                                预计 {meta.durationHint}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </WorkspaceCard>

            <DisclaimerBox>{guide.normalizedPayload.guide.warning}</DisclaimerBox>

            <WorkspaceCard title="下一步" eyebrow="Next step">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    <span className="mr-1.5 text-primary-600">→</span>
                    录入 IP 资产台账
                  </p>
                  <p className="mt-1 text-xs text-text-secondary">
                    提交后可在资产台账中记录申请号，系统会自动跟进受理通知与审查节点。
                  </p>
                </div>
                <a
                  href="/assets"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface-elevated"
                >
                  前往资产台账
                  <IconGlyph name="external" size={12} />
                </a>
              </div>
            </WorkspaceCard>
          </div>

          {/* ===== Checklist sidebar ===== */}
          <aside className="space-y-4">
            <div className="rounded-lg border border-border bg-gradient-to-br from-primary-50/40 via-surface to-surface p-4">
              <SectionHeader
                eyebrow="Checklist"
                title="材料准备清单"
                actions={
                  <Badge variant={checklistRatio === 100 ? "success" : "warning"} size="sm">
                    {checklistDone}/{CHECKLIST_ITEMS.length}
                  </Badge>
                }
              />
              <div className="mt-3 flex justify-center text-primary-600">
                <RadialProgress
                  total={CHECKLIST_ITEMS.length}
                  done={checklistDone}
                  color="currentColor"
                  track="rgb(var(--color-border) / 0.6)"
                  size={150}
                  strokeWidth={11}
                >
                  <span className="num-display text-3xl tracking-tight text-text-primary">
                    {checklistRatio}
                    <span className="text-base align-top text-text-tertiary">%</span>
                  </span>
                  <span className="mt-0.5 text-[11px] text-text-tertiary">
                    {checklistDone} / {CHECKLIST_ITEMS.length} 项
                  </span>
                </RadialProgress>
              </div>
              <ul className="mt-4 space-y-1.5">
                {CHECKLIST_ITEMS.map((item) => {
                  const checked = !!done[item.id];
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => toggle(item.id)}
                        className={`flex w-full items-center gap-2.5 rounded-md border px-3 py-1.5 text-left transition-colors ${
                          checked
                            ? "border-primary-100 bg-primary-50/60"
                            : "border-border bg-surface hover:bg-surface-elevated"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                            checked
                              ? "border-primary-500 bg-primary-500 text-white"
                              : "border-border bg-surface"
                          }`}
                        >
                          {checked && <IconGlyph name="check" size={10} />}
                        </span>
                        <span
                          className={`flex-1 text-xs leading-5 ${
                            checked
                              ? "text-primary-700 line-through decoration-primary-500/40"
                              : "text-text-primary"
                          }`}
                        >
                          {item.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-[11px] text-text-tertiary">
                进度保存在本地浏览器，不会上传到服务器。
              </p>
            </div>

            <div className="rounded-lg border border-info-100 bg-info-50/50 p-4">
              <SectionHeader eyebrow="Tip" title="小提醒" />
              <ul className="mt-2 space-y-1.5 text-xs leading-6 text-text-secondary">
                <li className="flex gap-1.5">
                  <IconGlyph name="check" size={12} className="mt-0.5 text-info-500" />
                  同一商标可同时报多个尼斯分类，费用按类叠加。
                </li>
                <li className="flex gap-1.5">
                  <IconGlyph name="check" size={12} className="mt-0.5 text-info-500" />
                  建议使用 CA 证书或电子签章登录，保证提交稳定。
                </li>
                <li className="flex gap-1.5">
                  <IconGlyph name="check" size={12} className="mt-0.5 text-info-500" />
                  受理通知书下发后，请及时录入 IP 资产台账。
                </li>
              </ul>
            </div>
          </aside>
        </div>
      ) : !error ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border text-sm text-text-tertiary">
          加载指南中…
        </div>
      ) : null}
    </div>
  );
}
