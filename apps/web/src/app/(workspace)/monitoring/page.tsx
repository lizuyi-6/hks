import { SkeletonModule } from "@/components/placeholders";

export default function MonitoringPage() {
  return (
    <SkeletonModule
      title="侵权监控雷达"
      description="预留公开搜索、授权 API、授权抓取三类监控通道。首版保留 feature flag 和最小结果结构。"
      featureName="FEATURE_MONITORING_*"
    />
  );
}

