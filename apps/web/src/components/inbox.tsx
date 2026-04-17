"use client";

import { useState, useEffect, useCallback } from "react";
import type { AppNotification, AutomationRule } from "@a1plus/domain";
import { proxyBaseUrl } from "@/lib/env";

interface Job {
  id: string;
  jobType: string;
  status: string;
  createdAt: string;
}

interface WorkflowStep {
  id: string;
  stepType: string;
  status: string;
  workflowId: string;
}

interface Workflow {
  id: string;
  workflowType: string;
  status: string;
  steps: WorkflowStep[];
}

type Tab = "in_flight" | "awaiting" | "schedule";

const JOB_TYPE_LABELS: Record<string, string> = {
  "diagnosis.report": "IP 诊断",
  "trademark.application": "商标申请书生成",
  "trademark.check": "商标查重",
  "monitoring.scan": "侵权监控扫描",
  "competitor.track": "竞品追踪",
  "policy.digest": "政策速递",
  "contract.review": "合同审查",
  "patent.assess": "专利评估",
  "asset.expiry_check": "资产到期检查",
  "reminder.dispatch": "提醒发送",
  "due-diligence.investigate": "融资尽调",
};

const STEP_TYPE_LABELS: Record<string, string> = {
  diagnosis: "IP 诊断",
  "trademark-check": "商标查重",
  application: "申请书生成",
  "submit-guide": "提交引导",
  ledger: "入台账",
};

function InFlightCard({ job }: { job: Job }) {
  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg bg-white">
      <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm text-slate-900 truncate">
          {JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {job.status === "processing" ? "执行中…" : "排队中"} · {new Date(job.createdAt).toLocaleString("zh-CN")}
        </p>
      </div>
      <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-600">
        {job.status}
      </span>
    </div>
  );
}

function AwaitingCard({
  step,
  workflow,
  onApprove,
}: {
  step: WorkflowStep;
  workflow: Workflow;
  onApprove: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [showReject, setShowReject] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    try {
      await fetch(`${proxyBaseUrl}/workflows/${workflow.id}/approve-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ step_id: step.id, approved: true }),
      });
      onApprove();
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await fetch(`${proxyBaseUrl}/workflows/${workflow.id}/approve-step`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ step_id: step.id, approved: false, note }),
      });
      onApprove();
    } finally {
      setLoading(false);
    }
  };

  const stepLabel = STEP_TYPE_LABELS[step.stepType] ?? step.stepType;

  return (
    <div className="p-4 border border-amber-200 rounded-lg bg-amber-50">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-sm text-slate-900">
            「{stepLabel}」完成，等待您确认
          </p>
          <p className="text-xs text-slate-600 mt-1">
            工作流：{workflow.workflowType} · 请审阅后决定是否继续
          </p>
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
          待审批
        </span>
      </div>
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleApprove}
          disabled={loading}
          className="px-4 py-1.5 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? "处理中…" : "批准继续"}
        </button>
        <button
          onClick={() => setShowReject(!showReject)}
          disabled={loading}
          className="px-4 py-1.5 text-sm border border-slate-300 text-slate-700 rounded-md hover:bg-slate-50"
        >
          拒绝
        </button>
      </div>
      {showReject && (
        <div className="mt-2 flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="填写拒绝原因（可选）"
            className="flex-1 text-sm border rounded px-3 py-1.5"
          />
          <button
            onClick={handleReject}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            确认拒绝
          </button>
        </div>
      )}
    </div>
  );
}

function ScheduleCard({ rule }: { rule: AutomationRule }) {
  const [enabled, setEnabled] = useState(rule.enabled);
  const [toggling, setToggling] = useState(false);

  const toggle = async () => {
    setToggling(true);
    try {
      await fetch(`${proxyBaseUrl}/automation/rules/${rule.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled: !enabled }),
      });
      setEnabled(!enabled);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-4 border rounded-lg bg-white">
      <div className="flex-1">
        <p className="font-medium text-sm text-slate-900">{rule.description ?? rule.ruleKey}</p>
        {rule.lastFiredAt && (
          <p className="text-xs text-slate-500 mt-0.5">
            上次执行：{new Date(rule.lastFiredAt).toLocaleString("zh-CN")}
          </p>
        )}
        {!rule.lastFiredAt && (
          <p className="text-xs text-slate-400 mt-0.5">尚未执行</p>
        )}
      </div>
      <button
        onClick={toggle}
        disabled={toggling}
        className={`relative w-10 h-6 rounded-full transition-colors ${
          enabled ? "bg-green-500" : "bg-slate-300"
        } disabled:opacity-50`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-4" : ""
          }`}
        />
      </button>
    </div>
  );
}

export function InboxPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("in_flight");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [jobsRes, wfRes, rulesRes] = await Promise.all([
        fetch(`${proxyBaseUrl}/jobs?status=processing,queued`, { credentials: "include" }),
        fetch(`${proxyBaseUrl}/workflows?status=running`, { credentials: "include" }),
        fetch(`${proxyBaseUrl}/automation/rules`, { credentials: "include" }),
      ]);

      const jobsData = jobsRes.ok ? await jobsRes.json() : [];
      const wfData = wfRes.ok ? await wfRes.json() : [];
      const rulesData = rulesRes.ok ? await rulesRes.json() : [];

      setJobs(Array.isArray(jobsData) ? jobsData : []);
      setWorkflows(Array.isArray(wfData) ? wfData : []);
      setRules(Array.isArray(rulesData) ? rulesData : []);
    } catch {
      /* network error, retry next cycle */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      if (activeTab === "in_flight") loadData();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadData, activeTab]);

  const awaitingSteps = workflows.flatMap((wf) =>
    wf.steps
      .filter((s) => s.status === "awaiting_review")
      .map((s) => ({ step: s, workflow: wf }))
  );

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "in_flight", label: "正在处理", count: jobs.length },
    { key: "awaiting", label: "待你决定", count: awaitingSteps.length },
    { key: "schedule", label: "自动巡检", count: rules.filter((r) => r.enabled).length },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        加载中…
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {activeTab === "in_flight" && (
          <>
            {jobs.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">暂无进行中的任务</p>
            ) : (
              jobs.map((job) => <InFlightCard key={job.id} job={job} />)
            )}
          </>
        )}

        {activeTab === "awaiting" && (
          <>
            {awaitingSteps.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">暂无待审批事项</p>
            ) : (
              awaitingSteps.map(({ step, workflow }) => (
                <AwaitingCard
                  key={step.id}
                  step={step}
                  workflow={workflow}
                  onApprove={loadData}
                />
              ))
            )}
          </>
        )}

        {activeTab === "schedule" && (
          <>
            {rules.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">暂无自动化规则</p>
            ) : (
              rules.map((rule) => <ScheduleCard key={rule.id} rule={rule} />)
            )}
          </>
        )}
      </div>
    </div>
  );
}
