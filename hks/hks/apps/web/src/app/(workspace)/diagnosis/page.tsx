"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  PageHeader,
  IconTabBar,
  type IconName,
} from "@/components/workspace/primitives";
import { DiagnosisWorkspace, PatentAssessWorkspace } from "@/components/workspace/diagnosis";

type Tab = "diagnosis" | "patent";

const tabs: Array<{ key: Tab; label: string; icon: IconName }> = [
  { key: "diagnosis", label: "IP 诊断", icon: "diagnosis" },
  { key: "patent", label: "专利 / 软著评估", icon: "patent" },
];

function DiagnosisPageInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "patent" ? "patent" : "diagnosis";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI diagnosis"
        title="IP 智能诊断"
        icon="diagnosis"
        accent="error"
        description="一次性梳理您的业务 IP 风险与保护优先级，给出可执行的下一步建议。"
      />
      <IconTabBar<Tab> tabs={tabs} active={activeTab} onChange={setActiveTab} />
      {activeTab === "diagnosis" && <DiagnosisWorkspace />}
      {activeTab === "patent" && <PatentAssessWorkspace />}
    </div>
  );
}

export default function DiagnosisPage() {
  return (
    <Suspense>
      <DiagnosisPageInner />
    </Suspense>
  );
}
