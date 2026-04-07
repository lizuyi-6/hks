"use client";

import { SectionCard, StatusBadge } from "@a1plus/ui";

export function SkeletonModule({
  title,
  description,
  featureName
}: {
  title: string;
  description: string;
  featureName: string;
}) {
  return (
    <SectionCard title={title} eyebrow="Skeleton Module">
      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <p className="leading-7 text-slate-600">{description}</p>
          <p className="text-sm leading-7 text-slate-500">
            该模块已预留页面、BFF 代理入口、后端占位 API、feature flag 与 provider
            接口。首版仅返回最小合法结果，不启用真实业务写入。
          </p>
        </div>
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <p className="text-sm font-medium text-slate-700">当前状态</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge label="Feature Flag" tone="info" />
            <StatusBadge label={featureName} tone="info" />
            <StatusBadge label="待接入" tone="warning" />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
