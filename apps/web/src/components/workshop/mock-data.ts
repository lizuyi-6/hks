import type { IpAsset, ReminderTask, Suggestion, WorkflowInstance } from "@a1plus/domain";

export type Kpi = {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
  series: number[];
};

export type DashboardMockData = {
  kpis: Kpi[];
  activity: { labels: string[]; series: number[] };
  coverage: { percent: number; label: string };
  assetBreakdown: Array<{ label: string; value: number; color?: string }>;
  suggestions: Suggestion[];
  workflows: WorkflowInstance[];
  assets: IpAsset[];
  reminders: ReminderTask[];
};

const now = new Date("2026-04-18T10:00:00+08:00");
const fmt = (d: Date) => d.toISOString();
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export const dashboardMockData: DashboardMockData = {
  kpis: [
    {
      label: "IP 资产总数",
      value: "12",
      delta: "+2",
      trend: "up",
      series: [4, 5, 5, 6, 6, 7, 8, 9, 9, 10, 11, 12],
    },
    {
      label: "即将到期",
      value: "3",
      delta: "-1",
      trend: "down",
      series: [5, 5, 4, 4, 5, 6, 6, 5, 4, 4, 4, 3],
    },
    {
      label: "监控告警",
      value: "5",
      delta: "+3",
      trend: "up",
      series: [2, 1, 2, 2, 3, 2, 3, 3, 4, 4, 5, 5],
    },
    {
      label: "保护覆盖率",
      value: "92%",
      delta: "+4",
      trend: "up",
      series: [78, 80, 81, 83, 84, 85, 86, 88, 89, 90, 91, 92],
    },
  ],

  activity: {
    labels: ["5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月", "3月", "4月"],
    series: [4, 5, 6, 6, 7, 8, 9, 10, 10, 11, 11, 12],
  },

  coverage: { percent: 92, label: "保护覆盖率" },

  assetBreakdown: [
    { label: "商标", value: 6 },
    { label: "专利", value: 3 },
    { label: "软著", value: 2 },
    { label: "版权", value: 1 },
  ],

  suggestions: [
    {
      id: "s1",
      title: "商标注册即将到期",
      description: "「晨光科技」商标将于 30 天后到期，建议尽快提交续展申请，避免权利失效。",
      action: { label: "查看台账", href: "/assets" },
      priority: "high",
    },
    {
      id: "s2",
      title: "发现 3 条近似商标告警",
      description: "侵权监控在过去 7 天内检测到 3 条与您商标高度近似的新注册申请。",
      action: { label: "查看详情", href: "/monitoring" },
      priority: "medium",
    },
    {
      id: "s3",
      title: "软著申请材料待完善",
      description: "「数据分析平台 v2.0」软件著作权申请尚缺源代码文档，请补全材料。",
      action: { label: "补全材料", href: "/assets" },
      priority: "medium",
    },
    {
      id: "s4",
      title: "本季度 IP 诊断报告可生成",
      description: "距上次 IP 诊断已超过 90 天，建议重新评估当前知识产权保护状况。",
      action: { label: "立即诊断", href: "/diagnosis" },
      priority: "low",
    },
  ],

  workflows: [
    {
      id: "wf1",
      userId: "user-demo",
      workflowType: "商标注册全流程",
      status: "running",
      context: {},
      currentStepIndex: 2,
      steps: [
        { id: "step-1", workflowId: "wf1", stepType: "diagnosis", stepIndex: 0, status: "completed", inputData: {}, outputData: {}, jobId: null, createdAt: fmt(addDays(now, -3)), updatedAt: fmt(addDays(now, -3)) },
        { id: "step-2", workflowId: "wf1", stepType: "trademark_check", stepIndex: 1, status: "completed", inputData: {}, outputData: {}, jobId: null, createdAt: fmt(addDays(now, -2)), updatedAt: fmt(addDays(now, -2)) },
        { id: "step-3", workflowId: "wf1", stepType: "application_generate", stepIndex: 2, status: "running", inputData: {}, outputData: {}, jobId: null, createdAt: fmt(addDays(now, -1)), updatedAt: fmt(addDays(now, -1)) },
        { id: "step-4", workflowId: "wf1", stepType: "submission_guide", stepIndex: 3, status: "pending", inputData: {}, outputData: {}, jobId: null, createdAt: fmt(now), updatedAt: fmt(now) },
      ],
      createdAt: fmt(addDays(now, -3)),
      updatedAt: fmt(addDays(now, -1)),
    },
    {
      id: "wf2",
      userId: "user-demo",
      workflowType: "合同 IP 审查",
      status: "running",
      context: {},
      currentStepIndex: 1,
      steps: [
        { id: "step-5", workflowId: "wf2", stepType: "contract_review", stepIndex: 0, status: "completed", inputData: {}, outputData: {}, jobId: null, createdAt: fmt(addDays(now, -1)), updatedAt: fmt(addDays(now, -1)) },
        { id: "step-6", workflowId: "wf2", stepType: "patent_assess", stepIndex: 1, status: "running", inputData: {}, outputData: {}, jobId: null, createdAt: fmt(now), updatedAt: fmt(now) },
        { id: "step-7", workflowId: "wf2", stepType: "ledger_write", stepIndex: 2, status: "pending", inputData: {}, outputData: {}, jobId: null, createdAt: fmt(now), updatedAt: fmt(now) },
        { id: "step-8", workflowId: "wf2", stepType: "reminder_create", stepIndex: 3, status: "pending", inputData: {}, outputData: {}, jobId: null, createdAt: fmt(now), updatedAt: fmt(now) },
      ],
      createdAt: fmt(addDays(now, -1)),
      updatedAt: fmt(now),
    },
  ],

  assets: [
    { id: "a1", name: "晨光科技", type: "trademark", registrationNumber: "TM-2021-4829301", status: "active", expiresAt: fmt(addDays(now, 30)), nextMilestone: "续展截止", sourceMode: "mock" },
    { id: "a2", name: "数据分析平台 v2.0", type: "soft-copyright", registrationNumber: "SOFT-2024-112233", status: "pending", sourceMode: "mock" },
    { id: "a3", name: "智能制造方法", type: "patent", registrationNumber: "PAT-2023-987654", status: "active", expiresAt: fmt(addDays(now, 365 * 15)), sourceMode: "mock" },
    { id: "a4", name: "晨光 LOGO 设计", type: "copyright", status: "active", sourceMode: "mock" },
    { id: "a5", name: "供应链优化算法", type: "patent", status: "pending", sourceMode: "mock" },
  ],

  reminders: [
    { id: "r1", assetId: "a1", channel: "email", dueAt: fmt(addDays(now, 1)), status: "queued" },
    { id: "r2", assetId: "a1", channel: "wechat", dueAt: fmt(addDays(now, 7)), status: "queued" },
    { id: "r3", assetId: "a2", channel: "email", dueAt: fmt(addDays(now, -2)), status: "sent" },
    { id: "r4", assetId: "a3", channel: "wecom", dueAt: fmt(addDays(now, -5)), status: "failed" },
  ],
};

export const quickActions = [
  { href: "/diagnosis", title: "IP 规划", description: "全面分析知识产权保护状况", icon: "🔍" },
  { href: "/trademark/check", title: "商标查重", description: "智能检索近似商标", icon: "™" },
  { href: "/trademark/application", title: "申请书生成", description: "一键生成规范申请文档", icon: "📄" },
  { href: "/assets", title: "资产台账", description: "知识产权资产统一管理", icon: "🗂" },
  { href: "/monitoring", title: "侵权监控", description: "实时追踪潜在侵权行为", icon: "👁" },
  { href: "/contracts", title: "合同审查", description: "AI 辅助审查 IP 条款", icon: "📋" },
] as const;
