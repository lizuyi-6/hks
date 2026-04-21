"use client";

import { Fragment } from "react";
import type { DashboardMockData } from "../mock-data";
import { quickActions } from "../mock-data";
import { AreaChart, DonutRing, Sparkline } from "../viz";
import { Mascot } from "../../Mascot";

const kpiAccents = ["accent-blue", "accent-red", "accent-purple", "accent-green"] as const;
const kpiColors = ["#5ac8ff", "#ff8fa5", "#d99aff", "#7eedb3"] as const;

const stepTypeLabels: Record<string, string> = {
  diagnosis: "IP 诊断",
  trademark_check: "商标查重",
  application_generate: "申请生成",
  submission_guide: "提交指引",
  contract_review: "合同审查",
  patent_assess: "专利评估",
  ledger_write: "台账入账",
  reminder_create: "提醒创建",
};

export function AppleGlass({ data }: { data: DashboardMockData }) {
  const { kpis, activity, coverage, assetBreakdown, suggestions, workflows, assets, reminders } = data;
  const maxBreakdown = Math.max(...assetBreakdown.map((a) => a.value));

  return (
    <div className="wsv-apple">
      <div className="apple-blobs">
        <span className="apple-blob blob-1" />
        <span className="apple-blob blob-2" />
        <span className="apple-blob blob-3" />
      </div>

      <div className="apple-stack">
        {/* KPI Grid */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <Mascot expression="thinking" size="sm" />
          <span className="apple-card-title" style={{ margin: 0, letterSpacing: "0.04em" }}>
            核心指标 · 实时同步
          </span>
        </div>
        <div className="apple-kpi-grid">
          {kpis.map((k, i) => (
            <div key={k.label} className="apple-card iridescent">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <span className="apple-kpi-label">{k.label}</span>
                <span className={`apple-chip ${kpiAccents[i % kpiAccents.length]}`}>
                  {k.trend === "up" ? "↑" : "↓"} {k.delta}
                </span>
              </div>
              <div className="apple-hero-number">{k.value}</div>
              <div style={{ marginTop: 14, color: kpiColors[i % kpiColors.length] }}>
                <Sparkline data={k.series} color={kpiColors[i % kpiColors.length]} width={180} height={36} />
              </div>
            </div>
          ))}
        </div>

        {/* Hero row: activity + coverage */}
        <div className="apple-row-2">
          <div className="apple-card">
            <h3 className="apple-card-title">资产增长 · 12 个月</h3>
            <div style={{ color: "#5ac8ff" }}>
              <AreaChart
                data={activity.series}
                labels={activity.labels}
                color="#5ac8ff"
                width={720}
                height={180}
                gridColor="rgba(255,255,255,0.05)"
                labelColor="rgba(255,255,255,0.4)"
              />
            </div>
          </div>
          <div className="apple-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            <h3 className="apple-card-title" style={{ alignSelf: "flex-start" }}>保护覆盖率</h3>
            <DonutRing
              percent={coverage.percent}
              color="#30d158"
              track="rgba(255,255,255,0.08)"
              size={160}
              strokeWidth={14}
              valueLabel={
                <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: "-0.03em", color: "#fff" }}>
                  {coverage.percent}%
                </span>
              }
              label={<span style={{ color: "rgba(255,255,255,0.5)" }}>{coverage.label}</span>}
            />
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textAlign: "center" }}>
              相比上月 <span style={{ color: "#7eedb3", fontWeight: 600 }}>+4%</span>
            </div>
          </div>
        </div>

        {/* Breakdown + Suggestions */}
        <div className="apple-row-3">
          <div className="apple-card">
            <h3 className="apple-card-title">资产结构</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {assetBreakdown.map((b, i) => (
                <div key={b.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#fff" }}>{b.label}</span>
                    <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontFeatureSettings: '"tnum"' }}>
                      {b.value}
                    </span>
                  </div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${(b.value / maxBreakdown) * 100}%`,
                        height: "100%",
                        background: `linear-gradient(90deg, ${kpiColors[i % kpiColors.length]}, rgba(255,255,255,0.3))`,
                        borderRadius: 999,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="apple-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <h3 className="apple-card-title" style={{ margin: 0 }}>智能建议</h3>
              <span className="apple-chip">{suggestions.length} 条</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Mascot expression="happy" size="sm" />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                发现 {suggestions.length} 条可优化项，优先处理高优先级项可有效降低 IP 风险
              </span>
            </div>
            {suggestions.map((s) => {
              const chipClass =
                s.priority === "high"
                  ? "accent-red"
                  : s.priority === "medium"
                  ? "accent-purple"
                  : "accent-blue";
              const chipLabel = s.priority === "high" ? "高优" : s.priority === "medium" ? "中优" : "低优";
              return (
                <div key={s.id} className="apple-list-item">
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 6 }}>
                    <span className={`apple-chip ${chipClass}`}>{chipLabel}</span>
                    <span className="apple-item-title">{s.title}</span>
                  </div>
                  <div className="apple-item-desc">{s.description}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Workflows pipeline */}
        <div className="apple-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Mascot expression="thinking" size="sm" />
              <h3 className="apple-card-title" style={{ margin: 0 }}>正在运行的工作流</h3>
            </div>
            <span className="apple-chip accent-blue">{workflows.length} 个进行中</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {workflows.map((wf) => (
              <div key={wf.id}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 12 }}>
                  {wf.workflowType}
                </div>
                <div className="apple-pipeline">
                  {wf.steps.map((step, idx) => {
                    const status =
                      step.status === "completed" ? "done" : step.status === "running" ? "running" : "pending";
                    return (
                      <Fragment key={step.id}>
                        <div className="apple-step">
                          <div className={`apple-step-dot ${status}`}>
                            {status === "done" ? "✓" : idx + 1}
                          </div>
                          <span className="apple-step-label">
                            {stepTypeLabels[step.stepType] ?? step.stepType}
                          </span>
                        </div>
                        {idx < wf.steps.length - 1 && (
                          <div className={`apple-step-line ${status === "done" ? "done" : ""}`} />
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reminders + Assets + Actions */}
        <div className="apple-row-3">
          <div className="apple-card">
            <h3 className="apple-card-title">提醒队列</h3>
            <div>
              {reminders.map((r) => {
                const asset = assets.find((a) => a.id === r.assetId);
                const statusChip =
                  r.status === "sent"
                    ? "accent-green"
                    : r.status === "failed"
                    ? "accent-red"
                    : "accent-blue";
                return (
                  <div key={r.id} className="apple-list-item">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span className="apple-item-title">{asset?.name ?? r.assetId}</span>
                      <span className={`apple-chip ${statusChip}`}>{r.status}</span>
                    </div>
                    <div className="apple-item-desc">
                      {r.channel} · {new Date(r.dueAt).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="apple-card">
            <h3 className="apple-card-title">快捷操作</h3>
            <div className="apple-action-grid">
              {quickActions.map((qa) => (
                <a key={qa.href} href="#" className="apple-action">
                  <span className="apple-action-icon">{qa.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 2 }}>{qa.title}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {qa.description}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
