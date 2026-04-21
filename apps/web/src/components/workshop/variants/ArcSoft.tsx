"use client";

import type { DashboardMockData } from "../mock-data";
import { quickActions } from "../mock-data";
import { AreaChart, DonutRing, Sparkline } from "../viz";

const kpiThemes = [
  { cls: "sage", color: "#8fb49b", icon: "◆" },
  { cls: "peach", color: "#f4b895", icon: "◉" },
  { cls: "lavender", color: "#c4b4e8", icon: "◇" },
  { cls: "rose", color: "#e8a5a5", icon: "◎" },
] as const;

const stepTypeLabels: Record<string, string> = {
  diagnosis: "诊断",
  trademark_check: "查重",
  application_generate: "申请",
  submission_guide: "提交",
  contract_review: "审查",
  patent_assess: "评估",
  ledger_write: "入账",
  reminder_create: "提醒",
};

export function ArcSoft({ data }: { data: DashboardMockData }) {
  const { kpis, activity, coverage, assetBreakdown, suggestions, workflows, assets, reminders } = data;
  const maxBreakdown = Math.max(...assetBreakdown.map((a) => a.value));

  return (
    <div className="wsv-arc">
      <div className="arc-stack">
        {/* KPI Grid */}
        <div className="arc-kpi-grid">
          {kpis.map((k, i) => {
            const theme = kpiThemes[i % kpiThemes.length];
            return (
              <div key={k.label} className="arc-kpi-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className={`arc-kpi-icon ${theme.cls}`}>{theme.icon}</div>
                  <span className={`arc-delta ${k.trend === "up" ? "up" : "down"}`}>
                    {k.trend === "up" ? "↑" : "↓"} {k.delta}
                  </span>
                </div>
                <div>
                  <div className="arc-kpi-label">{k.label}</div>
                  <div className="arc-hero-number" style={{ marginTop: 8 }}>{k.value}</div>
                </div>
                <div style={{ color: theme.color, marginTop: "auto" }}>
                  <Sparkline data={k.series} color={theme.color} width={200} height={32} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Hero row: activity + coverage */}
        <div className="arc-row-2">
          <div className="arc-card">
            <h3 className="arc-card-title">资产增长趋势</h3>
            <p className="arc-card-subtitle">近 12 个月新增 IP 资产数量</p>
            <div style={{ color: "#8fb49b" }}>
              <AreaChart
                data={activity.series}
                labels={activity.labels}
                color="#8fb49b"
                width={720}
                height={200}
                gridColor="rgba(61,43,31,0.06)"
                labelColor="#a89582"
              />
            </div>
          </div>
          <div className="arc-card" style={{ display: "flex", flexDirection: "column" }}>
            <h3 className="arc-card-title">保护覆盖率</h3>
            <p className="arc-card-subtitle">综合维度评估</p>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, flex: 1, justifyContent: "center" }}>
              <DonutRing
                percent={coverage.percent}
                color="#8fb49b"
                track="#f0e9dc"
                size={150}
                strokeWidth={12}
                valueLabel={
                  <span style={{ fontSize: 36, fontWeight: 600, color: "#3d2b1f", letterSpacing: "-0.02em" }}>
                    {coverage.percent}%
                  </span>
                }
              />
              <div style={{ display: "flex", gap: 18, fontSize: 11, color: "#8a7563" }}>
                <span>已覆盖 <strong style={{ color: "#3d2b1f" }}>92</strong>%</span>
                <span>待补齐 <strong style={{ color: "#c77a4a" }}>8</strong>%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Breakdown + Suggestions */}
        <div className="arc-row-3">
          <div className="arc-card">
            <h3 className="arc-card-title">资产类别</h3>
            <p className="arc-card-subtitle">按 IP 类型分布</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {assetBreakdown.map((b, i) => {
                const theme = kpiThemes[i % kpiThemes.length];
                return (
                  <div key={b.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: "#3d2b1f", fontWeight: 500 }}>{b.label}</span>
                      <span style={{ fontSize: 13, color: "#8a7563", fontFeatureSettings: '"tnum"' }}>{b.value}</span>
                    </div>
                    <div style={{ height: 8, background: "#f3ece0", borderRadius: 999, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${(b.value / maxBreakdown) * 100}%`,
                          height: "100%",
                          background: theme.color,
                          borderRadius: 999,
                          transition: "width 600ms cubic-bezier(0.22,1,0.36,1)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="arc-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
              <h3 className="arc-card-title">今日建议</h3>
              <span style={{ fontSize: 11, color: "#a89582" }}>{suggestions.length} 条待处理</span>
            </div>
            <p className="arc-card-subtitle">AI 基于你的资产动态生成</p>
            <div>
              {suggestions.map((s) => {
                const pill =
                  s.priority === "high" ? "rose" : s.priority === "medium" ? "peach" : "lavender";
                const label = s.priority === "high" ? "紧急" : s.priority === "medium" ? "建议" : "提示";
                return (
                  <div key={s.id} className="arc-list-item">
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                      <span className={`arc-chip ${pill}`}>{label}</span>
                      <span className="arc-item-title">{s.title}</span>
                    </div>
                    <div className="arc-item-desc">{s.description}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Workflows */}
        <div className="arc-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
            <h3 className="arc-card-title">工作流</h3>
            <span className="arc-chip lavender">{workflows.length} 运行中</span>
          </div>
          <p className="arc-card-subtitle">当前正在执行的任务流水线</p>
          <div className="arc-pipeline">
            {workflows.map((wf) => (
              <div key={wf.id} className="arc-pipeline-row">
                <div style={{ minWidth: 140, fontSize: 13, fontWeight: 600, color: "#3d2b1f" }}>
                  {wf.workflowType}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flex: 1 }}>
                  {wf.steps.map((step) => {
                    const cls =
                      step.status === "completed" ? "done" : step.status === "running" ? "running" : "pending";
                    const icon = step.status === "completed" ? "✓" : step.status === "running" ? "●" : "○";
                    return (
                      <span key={step.id} className={`arc-step-pill ${cls}`}>
                        {icon} {stepTypeLabels[step.stepType] ?? step.stepType}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reminders + Quick actions */}
        <div className="arc-row-3">
          <div className="arc-card">
            <h3 className="arc-card-title">提醒队列</h3>
            <p className="arc-card-subtitle">即将到期的动作</p>
            <div>
              {reminders.map((r) => {
                const asset = assets.find((a) => a.id === r.assetId);
                const pill =
                  r.status === "sent" ? "sage" : r.status === "failed" ? "rose" : "peach";
                return (
                  <div key={r.id} className="arc-list-item">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span className="arc-item-title">{asset?.name ?? r.assetId}</span>
                      <span className={`arc-chip ${pill}`}>{r.status}</span>
                    </div>
                    <div className="arc-item-desc">
                      {r.channel} · {new Date(r.dueAt).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="arc-card">
            <h3 className="arc-card-title">快捷操作</h3>
            <p className="arc-card-subtitle">常用工具入口</p>
            <div className="arc-action-grid">
              {quickActions.map((qa) => (
                <a key={qa.href} href="#" className="arc-action">
                  <span className="arc-action-icon">{qa.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="arc-action-title">{qa.title}</div>
                    <div className="arc-action-desc">{qa.description}</div>
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
