"use client";

import { Fragment } from "react";
import type { DashboardMockData } from "../mock-data";
import { quickActions } from "../mock-data";
import { AreaChart, DonutRing, Sparkline } from "../viz";

const kpiColors = ["#00d884", "#f75a5a", "#a855f7", "#00d884"] as const;
const kpiSparkClasses = ["", "red", "purple", ""] as const;

const stepTypeLabels: Record<string, string> = {
  diagnosis: "diagnosis",
  trademark_check: "tm_check",
  application_generate: "app_gen",
  submission_guide: "submit",
  contract_review: "review",
  patent_assess: "assess",
  ledger_write: "ledger",
  reminder_create: "remind",
};

export function VercelDash({ data }: { data: DashboardMockData }) {
  const { kpis, activity, coverage, assetBreakdown, suggestions, workflows, assets, reminders } = data;
  const maxBreakdown = Math.max(...assetBreakdown.map((a) => a.value));

  return (
    <div className="wsv-vercel">
      <div className="vercel-stack">
        {/* KPI Grid with mini sparklines */}
        <div className="vercel-kpi-grid">
          {kpis.map((k, i) => {
            const sparkClass = kpiSparkClasses[i % kpiSparkClasses.length];
            const sparkColor = kpiColors[i % kpiColors.length];
            return (
              <div key={k.label} className="vercel-card">
                <div className="vercel-kpi-label">{k.label}</div>
                <div className="vercel-hero-number">{k.value}</div>
                <div className={`vercel-delta ${k.trend === "up" ? "up" : "down"}`}>
                  {k.trend === "up" ? "↑" : "↓"} {k.delta}
                  <span style={{ color: "#565656", fontWeight: 500, marginLeft: 6 }}>vs 上月</span>
                </div>
                <div className={`vercel-spark-wrap ${sparkClass}`}>
                  <Sparkline data={k.series} color={sparkColor} width={200} height={28} strokeWidth={1.25} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Activity + Coverage */}
        <div className="vercel-row-2">
          <div className="vercel-card">
            <div className="vercel-card-header">
              <div>
                <h3 className="vercel-card-title">Asset Activity</h3>
                <div className="vercel-card-sub">Last 12 months · new registrations</div>
              </div>
              <div className="vercel-tabs">
                <span className="vercel-tab active">12m</span>
                <span className="vercel-tab">30d</span>
                <span className="vercel-tab">7d</span>
              </div>
            </div>
            <div className="vercel-activity-chart">
              <AreaChart
                data={activity.series}
                labels={activity.labels}
                color="#a855f7"
                width={720}
                height={180}
                gridColor="#1f1f1f"
                labelColor="#565656"
              />
            </div>
          </div>

          <div className="vercel-card">
            <div className="vercel-card-header">
              <div>
                <h3 className="vercel-card-title">Coverage</h3>
                <div className="vercel-card-sub">综合保护覆盖率</div>
              </div>
            </div>
            <div className="vercel-coverage-center">
              <DonutRing
                percent={coverage.percent}
                color="#00d884"
                track="#1f1f1f"
                size={132}
                strokeWidth={8}
                valueLabel={
                  <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.04em", color: "#ededed", fontFeatureSettings: '"tnum"' }}>
                    {coverage.percent}%
                  </span>
                }
              />
              <div className="vercel-coverage-legend">
                <span>已覆盖<strong>{coverage.percent}%</strong></span>
                <span>待补<strong>{100 - coverage.percent}%</strong></span>
              </div>
            </div>
          </div>
        </div>

        {/* Breakdown + Suggestions */}
        <div className="vercel-row-3">
          <div className="vercel-card">
            <div className="vercel-card-header">
              <div>
                <h3 className="vercel-card-title">Asset Breakdown</h3>
                <div className="vercel-card-sub">按类型</div>
              </div>
            </div>
            <div className="vercel-breakdown">
              {assetBreakdown.map((b) => (
                <div key={b.label} className="vercel-breakdown-row">
                  <span className="vercel-bd-label">{b.label}</span>
                  <div className="vercel-bd-track">
                    <div
                      className="vercel-bd-fill"
                      style={{ width: `${(b.value / maxBreakdown) * 100}%` }}
                    />
                  </div>
                  <span className="vercel-bd-value">{b.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="vercel-card">
            <div className="vercel-card-header">
              <div>
                <h3 className="vercel-card-title">Suggestions</h3>
                <div className="vercel-card-sub">{suggestions.length} items pending</div>
              </div>
              <span className="vercel-pill purple">AI</span>
            </div>
            <div className="vercel-list">
              {suggestions.map((s) => {
                const dot = s.priority === "high" ? "red" : s.priority === "medium" ? "purple" : "green";
                const pill = s.priority === "high" ? "red" : s.priority === "medium" ? "purple" : "green";
                const pillLabel = s.priority === "high" ? "P0" : s.priority === "medium" ? "P1" : "P2";
                return (
                  <div key={s.id} className="vercel-row">
                    <span className={`vercel-dot ${dot}`} />
                    <div className="vercel-row-main">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span className={`vercel-pill ${pill}`}>{pillLabel}</span>
                        <span className="vercel-row-title">{s.title}</span>
                      </div>
                      <div className="vercel-row-desc">{s.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Workflows pipeline */}
        <div className="vercel-card">
          <div className="vercel-card-header">
            <div>
              <h3 className="vercel-card-title">Workflow Pipelines</h3>
              <div className="vercel-card-sub">{workflows.length} running</div>
            </div>
            <span className="vercel-pill green">●  live</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {workflows.map((wf) => (
              <div key={wf.id}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#ededed" }}>{wf.workflowType}</span>
                  <span style={{ fontSize: 11, color: "#565656", fontFamily: '"Geist Mono", monospace' }}>
                    {wf.id}
                  </span>
                </div>
                <div className="vercel-pipeline">
                  {wf.steps.map((step, idx) => {
                    const cls =
                      step.status === "completed" ? "done" : step.status === "running" ? "running" : "pending";
                    return (
                      <Fragment key={step.id}>
                        <div className="vercel-step">
                          <div className={`vercel-step-dot ${cls}`}>
                            {cls === "done" ? "✓" : idx + 1}
                          </div>
                          <div className="vercel-step-label">{stepTypeLabels[step.stepType] ?? step.stepType}</div>
                        </div>
                        {idx < wf.steps.length - 1 && (
                          <div className={`vercel-step-line ${cls === "done" ? "done" : ""}`} />
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reminders + Quick actions */}
        <div className="vercel-row-3">
          <div className="vercel-card">
            <div className="vercel-card-header">
              <div>
                <h3 className="vercel-card-title">Reminder Queue</h3>
                <div className="vercel-card-sub">{reminders.length} scheduled</div>
              </div>
            </div>
            <div className="vercel-list">
              {reminders.map((r) => {
                const asset = assets.find((a) => a.id === r.assetId);
                const dot =
                  r.status === "sent" ? "green" : r.status === "failed" ? "red" : "purple";
                const pill =
                  r.status === "sent" ? "green" : r.status === "failed" ? "red" : "gray";
                return (
                  <div key={r.id} className="vercel-row">
                    <span className={`vercel-dot ${dot}`} />
                    <div className="vercel-row-main">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span className="vercel-row-title">{asset?.name ?? r.assetId}</span>
                        <span className={`vercel-pill ${pill}`}>{r.status}</span>
                      </div>
                      <div className="vercel-row-desc" style={{ fontFamily: '"Geist Mono", monospace' }}>
                        {r.channel} · {new Date(r.dueAt).toISOString().slice(0, 10)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="vercel-card">
            <div className="vercel-card-header">
              <div>
                <h3 className="vercel-card-title">Quick Actions</h3>
                <div className="vercel-card-sub">常用命令</div>
              </div>
              <span className="vercel-pill gray">⌘K</span>
            </div>
            <div className="vercel-action-grid">
              {quickActions.map((qa) => (
                <a key={qa.href} href="#" className="vercel-action">
                  <span className="vercel-action-icon">{qa.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="vercel-action-title">{qa.title}</div>
                    <div className="vercel-action-desc">{qa.description}</div>
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
