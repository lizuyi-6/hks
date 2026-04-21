"use client";

import type { DashboardMockData } from "../mock-data";
import { quickActions } from "../mock-data";
import { AreaChart, DonutRing } from "../viz";

const suggestionEmoji: Record<string, string> = {
  high: "🔴",
  medium: "🟠",
  low: "🟡",
};

const suggestionBadge: Record<string, "green" | "ochre" | "mute"> = {
  high: "ochre",
  medium: "green",
  low: "mute",
};

const stepTypeLabels: Record<string, string> = {
  diagnosis: "IP 诊断",
  trademark_check: "商标查重",
  application_generate: "申请书生成",
  submission_guide: "提交指引",
  contract_review: "合同审查",
  patent_assess: "专利评估",
  ledger_write: "台账入账",
  reminder_create: "创建提醒",
};

const stepStatusLabel: Record<string, string> = {
  completed: "已完成",
  running: "进行中",
  pending: "待开始",
  failed: "失败",
  skipped: "已跳过",
};

export function NotionCraft({ data }: { data: DashboardMockData }) {
  const { kpis, activity, coverage, assetBreakdown, suggestions, workflows, assets, reminders } = data;
  const maxBreakdown = Math.max(...assetBreakdown.map((a) => a.value));

  return (
    <div className="wsv-notion">
      <div className="notion-stack">
        {/* KPI — serif numbers */}
        <div className="notion-block no-border">
          <div className="notion-overline">Overview · 2026 Q2</div>
          <h2 className="notion-h" style={{ fontSize: 28, marginBottom: 4 }}>
            IP 资产速览
          </h2>
          <p className="notion-sub">跟踪品牌、专利、版权等知识产权的动态与健康度</p>
          <div className="notion-kpi-grid">
            {kpis.map((k) => (
              <div key={k.label} className="notion-kpi">
                <span className="notion-kpi-label">{k.label}</span>
                <span className="notion-serif-number">{k.value}</span>
                <span className={`notion-delta ${k.trend === "up" ? "up" : "down"}`}>
                  {k.trend === "up" ? "↑" : "↓"} {k.delta} <span style={{ color: "#9b9a97" }}>本月</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Activity + Coverage */}
        <div className="notion-block">
          <div className="notion-overline">Growth</div>
          <div className="notion-row-2">
            <div>
              <h3 className="notion-h">资产增长</h3>
              <p className="notion-sub">过去 12 个月，资产数量从 4 增长到 12 —— 增长的大多数发生在近 4 个月。</p>
              <div style={{ color: "#2f7c52" }}>
                <AreaChart
                  data={activity.series}
                  labels={activity.labels}
                  color="#2f7c52"
                  width={720}
                  height={180}
                  gridColor="#e8e3d6"
                  labelColor="#9b9a97"
                />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
              <h3 className="notion-h">保护覆盖</h3>
              <p className="notion-sub">综合监控、续展、侵权追踪三项指标</p>
              <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                <DonutRing
                  percent={coverage.percent}
                  color="#2f7c52"
                  track="#e8e3d6"
                  size={140}
                  strokeWidth={10}
                  valueLabel={
                    <span
                      style={{
                        fontFamily: '"New York", "Source Serif 4", "Noto Serif SC", Georgia, serif',
                        fontSize: 42,
                        fontWeight: 500,
                        color: "#1c1c1a",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      {coverage.percent}
                    </span>
                  }
                />
                <div>
                  <div style={{ fontSize: 12, color: "#6b6a66", marginBottom: 8 }}>覆盖率</div>
                  <div style={{ fontSize: 12, color: "#2f7c52", fontWeight: 500 }}>↑ +4% 相比上季</div>
                  <div style={{ fontSize: 12, color: "#9b9a97", marginTop: 12, lineHeight: 1.55 }}>
                    相比 85% 的行业平均水平，当前覆盖已属优秀。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Breakdown + Suggestions */}
        <div className="notion-block">
          <div className="notion-overline">Breakdown</div>
          <div className="notion-row-3">
            <div>
              <h3 className="notion-h">资产结构</h3>
              <p className="notion-sub">按 IP 类型拆分</p>
              {assetBreakdown.map((b) => (
                <div key={b.label} className="notion-breakdown-row">
                  <span className="notion-bd-label">{b.label}</span>
                  <div className="notion-bd-bar">
                    <div
                      className="notion-bd-bar-fill"
                      style={{ width: `${(b.value / maxBreakdown) * 100}%` }}
                    />
                  </div>
                  <span className="notion-bd-value">{b.value}</span>
                </div>
              ))}
            </div>
            <div>
              <h3 className="notion-h">智能建议</h3>
              <p className="notion-sub">基于你的资产动态，本周共识别到 {suggestions.length} 条事项</p>
              <div className="notion-list">
                {suggestions.map((s) => (
                  <div key={s.id} className="notion-list-item">
                    <span className="notion-emoji">{suggestionEmoji[s.priority] ?? "🔵"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span className={`notion-badge ${suggestionBadge[s.priority] ?? "mute"}`}>
                          {s.priority === "high" ? "高" : s.priority === "medium" ? "中" : "低"}
                        </span>
                        <span className="notion-item-title">{s.title}</span>
                      </div>
                      <div className="notion-item-desc" style={{ marginTop: 4 }}>
                        {s.description}{" "}
                        <a href="#" className="notion-link">
                          {s.action.label} →
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Workflows */}
        <div className="notion-block">
          <div className="notion-overline">Workflows</div>
          <h3 className="notion-h">正在运行的工作流</h3>
          <p className="notion-sub">{workflows.length} 个工作流正在后台推进</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {workflows.map((wf) => (
              <div key={wf.id}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1c1c1a", marginBottom: 8 }}>
                  {wf.workflowType}
                </div>
                <div className="notion-pipeline">
                  {wf.steps.map((step, idx) => {
                    const badge: "green" | "ochre" | "mute" =
                      step.status === "completed" ? "green" : step.status === "running" ? "ochre" : "mute";
                    return (
                      <div key={step.id} className="notion-pipe-row">
                        <span className="notion-step-num">{String(idx + 1).padStart(2, "0")}</span>
                        <span className="notion-step-label">
                          {stepTypeLabels[step.stepType] ?? step.stepType}
                        </span>
                        <span className={`notion-badge ${badge}`}>
                          {stepStatusLabel[step.status] ?? step.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reminders + Quick actions */}
        <div className="notion-block">
          <div className="notion-overline">Inbox</div>
          <div className="notion-row-3">
            <div>
              <h3 className="notion-h">提醒</h3>
              <p className="notion-sub">等待你处理的通知</p>
              <div className="notion-list">
                {reminders.map((r) => {
                  const asset = assets.find((a) => a.id === r.assetId);
                  const badge: "green" | "ochre" | "mute" =
                    r.status === "sent" ? "green" : r.status === "failed" ? "ochre" : "mute";
                  return (
                    <div key={r.id} className="notion-list-item">
                      <span className="notion-emoji">📬</span>
                      <div style={{ flex: 1 }}>
                        <div className="notion-item-title">{asset?.name ?? r.assetId}</div>
                        <div className="notion-item-desc" style={{ marginTop: 2 }}>
                          <span className={`notion-badge ${badge}`}>{r.status}</span>
                          {r.channel} · {new Date(r.dueAt).toLocaleDateString("zh-CN")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="notion-h">快捷入口</h3>
              <p className="notion-sub">常用工具</p>
              <div className="notion-quick-actions">
                {quickActions.map((qa) => (
                  <a key={qa.href} href="#" className="notion-action">
                    <span className="notion-action-emoji">{qa.icon}</span>
                    <div>
                      <div className="notion-action-title">{qa.title}</div>
                      <div className="notion-action-desc">{qa.description}</div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
