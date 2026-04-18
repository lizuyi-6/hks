"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DiagnosisWorkspace, PatentAssessWorkspace } from "@/components/workspace";

type Tab = "diagnosis" | "patent";

const tabs: { key: Tab; label: string }[] = [
  { key: "diagnosis", label: "IP 诊断" },
  { key: "patent", label: "专利/软著评估" },
];

function DiagnosisPageInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "patent" ? "patent" : "diagnosis";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key
                ? "border-rust text-rust"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

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
