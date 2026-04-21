"use client";

import { WorkspaceCard, Badge } from "@a1plus/ui";

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
    <WorkspaceCard title={title} eyebrow="Skeleton Module">
      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <p className="leading-7 text-text-secondary">{description}</p>
          <p className="text-sm leading-7 text-text-tertiary">
            该模块已预留页面、BFF 代理入口、后端占位 API、feature flag 与 provider
            接口。首版仅返回最小合法结果，不启用真实业务写入。
          </p>
        </div>
        <div className="rounded-md border border-dashed border-border bg-neutral-50 p-4">
          <p className="text-sm font-medium text-text-primary">当前状态</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="info" size="sm">Feature Flag</Badge>
            <Badge variant="info" size="sm">{featureName}</Badge>
            <Badge variant="warning" size="sm">待接入</Badge>
          </div>
        </div>
      </div>
    </WorkspaceCard>
  );
}
