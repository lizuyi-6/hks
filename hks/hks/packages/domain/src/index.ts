export type RiskLevel = "green" | "yellow" | "red";
export type DataMode = "real" | "mock";

export type BusinessProfile = {
  businessName?: string;
  businessDescription: string;
  industry?: string;
  stage?: string;
};

export type UserProfile = {
  id: string;
  email: string;
  fullName: string;
  businessName?: string;
  businessDescription?: string;
  industry?: string;
  stage?: string;
  applicantType?: "individual" | "company";
  applicantName?: string;
  hasTrademark?: boolean;
  hasPatent?: boolean;
  ipFocus?: string;
  profileComplete: boolean;
  createdAt: string;
};

export type TrademarkCheckRequest = {
  trademarkName: string;
  businessDescription: string;
  applicantName: string;
  applicantType: "individual" | "company";
  categories: string[];
};

export type TrademarkFinding = {
  name: string;
  category: string;
  similarityScore: number;
  status: "registered" | "pending" | "expired";
  note: string;
};

export type TrademarkCheckResult = {
  riskLevel: RiskLevel;
  summary: string;
  recommendation: string;
  suggestedCategories: string[];
  findings: TrademarkFinding[];
  alternatives: string[];
};

export type ApplicationDraft = {
  draftId: string;
  trademarkName: string;
  applicantName: string;
  categories: string[];
  riskLevel: RiskLevel;
  sourceMode: DataMode;
  provider: string;
  documentLabels: string[];
  downloadEndpoints: {
    docx: string;
    pdf: string;
  };
};

export type SubmissionGuide = {
  title: string;
  steps: string[];
  officialUrl: string;
  warning: string;
};

export type IpAsset = {
  id: string;
  name: string;
  type: "trademark" | "patent" | "copyright" | "soft-copyright";
  registrationNumber?: string;
  status: "active" | "pending" | "expired" | "renewed";
  expiresAt?: string;
  nextMilestone?: string;
  sourceMode: DataMode;
};

export type ReminderTask = {
  id: string;
  assetId: string;
  channel: "email" | "wechat" | "wecom";
  dueAt: string;
  status: "queued" | "processing" | "sent" | "failed" | "dead_letter";
};

export type MonitoringTarget = {
  id: string;
  query: string;
  channel: "public-search" | "authorized-api" | "authorized-scrape";
  enabled: boolean;
};

export type MonitoringAlert = {
  id: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  createdAt: string;
};

export type CompetitorProfile = {
  id: string;
  name: string;
  industries: string[];
  status: "placeholder" | "active";
};

export type ContractReviewRequest = {
  text: string;
  fileName?: string;
};

export type ContractReviewResult = {
  ownership: string;
  confidentiality: string;
  liability: string;
  suggestions: string[];
};

export type DueDiligenceReport = {
  id: string;
  summary: string;
  sections: string[];
  status: "placeholder" | "queued" | "ready";
};

export type Pillar =
  | "profile"
  | "matching"
  | "push"
  | "acquisition"
  | "consult"
  | "compliance"
  | "digital"
  | "ops";

export const pillarMeta: Record<Pillar, { label: string; short: string; description: string }> = {
  profile: {
    label: "需求画像",
    short: "Profile",
    description: "LLM + 行为信号构建可解释的用户需求画像。",
  },
  matching: {
    label: "智能匹配",
    short: "Matching",
    description: "两阶段召回+重排，将画像精准映射到律师/代理。",
  },
  push: {
    label: "场景化推送",
    short: "Push",
    description: "基于事件与画像的场景规则引擎触达。",
  },
  acquisition: {
    label: "精准获客",
    short: "Acquisition",
    description: "线索温度分级 + 漏斗分析 + ROI 报表。",
  },
  consult: {
    label: "智能咨询",
    short: "Consult",
    description: "多工具 AI Agent 首诊，低置信度自动转人工。",
  },
  compliance: {
    label: "合规 SaaS",
    short: "Compliance",
    description: "企业 IP 合规体检、政策雷达与订阅。",
  },
  digital: {
    label: "服务数字化",
    short: "Digital",
    description: "电子签 + 托管支付 + 里程碑交付全链路数字化。",
  },
  ops: {
    label: "通用工具",
    short: "Ops",
    description: "工作台、收件箱、自助工具等辅助入口。",
  },
};

export type ModuleDefinition = {
  key:
    | "dashboard"
    | "consult"
    | "match"
    | "orders"
    | "diagnosis"
    | "trademark"
    | "assets"
    | "reminders"
    | "monitoring"
    | "competitors"
    | "contracts"
    | "patents"
    | "policies"
    | "due-diligence"
    | "inbox"
    | "automation"
    | "provider"
    | "enterprise"
    | "litigation"
    | "my-profile"
    | "push-center";
  title: string;
  description: string;
  href: string;
  status: "core" | "skeleton" | "tool" | "pillar";
  pillar: Pillar;
  /**
   * 当 `pillar === "ops"`（即 tool）时，显式声明其服务的业务支柱。
   * 侧栏会把带 `parentPillar` 的工具作为"支柱子能力"渲染到对应支柱分组下，
   * 而不是扔到「工作区 · 工具」。
   */
  parentPillar?: Exclude<Pillar, "ops">;
};

export type WorkflowInstance = {
  id: string;
  userId: string;
  workflowType: string;
  status: "pending" | "running" | "completed" | "failed";
  context: Record<string, unknown>;
  currentStepIndex: number;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowStep = {
  id: string;
  workflowId: string;
  stepType: string;
  stepIndex: number;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  jobId?: string | null;
  inputData: Record<string, unknown>;
  outputData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ModuleResultItem = {
  id: string;
  userId: string;
  workflowId?: string | null;
  moduleType: string;
  jobId?: string | null;
  resultData: Record<string, unknown>;
  createdAt: string;
};

export type Suggestion = {
  id: string;
  title: string;
  description: string;
  action: {
    label: string;
    href: string;
    prefilledData?: Record<string, unknown>;
  };
  priority: "high" | "medium" | "low";
};

export type NotificationCategory =
  | "workflow"
  | "monitoring"
  | "policy"
  | "competitor"
  | "reminder"
  | "system";

export type NotificationPriority = "high" | "medium" | "low";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  body?: string;
  actionUrl?: string;
  actionLabel?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  readAt?: string;
  dismissedAt?: string;
  createdAt: string;
}

export interface AutomationRule {
  id: string;
  ruleKey: string;
  enabled: boolean;
  triggerType: "cron" | "event";
  triggerConfig: Record<string, unknown>;
  actionType: string;
  actionConfig: Record<string, unknown>;
  description?: string;
  lastFiredAt?: string;
  createdAt: string;
}

export const coreWorkflow = [
  "注册 / 登录",
  "IP 诊断",
  "商标查重",
  "申请书生成",
  "提交引导",
  "自动入台账",
  "提醒任务"
] as const;

export const modules: ModuleDefinition[] = [
  // ----- 支柱 1：需求画像 -----
  {
    key: "my-profile",
    title: "我的画像",
    description: "AI 基于一句话需求+行为信号构建的标签画像（透明可解释）。",
    href: "/my-profile",
    status: "pillar",
    pillar: "profile"
  },
  // ----- 支柱 2：智能匹配 -----
  {
    key: "match",
    title: "智能匹配",
    description: "查看律师 / 代理匹配结果与需求画像。",
    href: "/match",
    status: "pillar",
    pillar: "matching"
  },
  // ----- 支柱 3：场景化推送 -----
  {
    key: "push-center",
    title: "场景推送中心",
    description: "查看 12+ 场景规则、触发时间线、一键模拟推送。",
    href: "/push-center",
    status: "pillar",
    pillar: "push"
  },
  // ----- 支柱 4：精准获客（B 端）-----
  {
    key: "provider",
    title: "律师工作台",
    description: "B 端：线索池、获客漏斗、产品、订单与客户 CRM。",
    href: "/provider",
    status: "pillar",
    pillar: "acquisition"
  },
  // ----- 支柱 5：智能咨询 -----
  {
    key: "consult",
    title: "AI 咨询",
    description: "把需求告诉 AI 法务大脑 —— 首诊、匹配律师、一键委托。",
    href: "/consult",
    status: "pillar",
    pillar: "consult"
  },
  {
    key: "litigation",
    title: "诉讼预测",
    description: "AI 预测胜诉率、赔偿区间与最优策略，拖滑杆即时推演。",
    href: "/litigation",
    status: "pillar",
    pillar: "consult"
  },
  // ----- 支柱 6：合规 SaaS -----
  {
    key: "enterprise",
    title: "合规中心",
    description: "企业 IP 合规体检、政策雷达与订阅。",
    href: "/enterprise",
    status: "pillar",
    pillar: "compliance"
  },
  // ----- 支柱 7：服务数字化 -----
  {
    key: "orders",
    title: "我的委托",
    description: "电子签 + 托管支付 + 里程碑交付全链路数字化。",
    href: "/orders",
    status: "pillar",
    pillar: "digital"
  },
  // ----- 通用工具 -----
  {
    key: "inbox",
    title: "收件箱",
    description: "查看任务状态、待审批事项、提醒通知和巡检结果。",
    href: "/inbox",
    status: "core",
    pillar: "ops"
  },
  {
    key: "dashboard",
    title: "工作台",
    description: "核心指标、流程入口、provider 状态与自动化配置。",
    href: "/dashboard",
    status: "core",
    pillar: "ops"
  },
  // ----- AI 自助工具（每个 tool 显式归属一个业务支柱，侧栏作为子能力渲染）-----
  {
    key: "diagnosis",
    title: "IP 规划",
    description: "IP 诊断、专利/软著评估与保护策略建议。",
    href: "/diagnosis",
    status: "tool",
    pillar: "ops",
    parentPillar: "profile" // 诊断产出的意图/行业标签回写到画像
  },
  {
    key: "trademark",
    title: "商标工作流",
    description: "查重、风险判断、申请书生成与提交引导。",
    href: "/trademark/check",
    status: "tool",
    pillar: "ops",
    parentPillar: "digital" // 商标办理全流程是服务数字化的典型场景
  },
  {
    key: "assets",
    title: "IP 资产台账",
    description: "管理商标、专利、软著与版权资产。",
    href: "/assets",
    status: "tool",
    pillar: "ops",
    parentPillar: "digital" // 资产台账是订单交付物仓库
  },
  {
    key: "monitoring",
    title: "IP 监控",
    description: "侵权监控、竞品追踪与风险告警。",
    href: "/monitoring",
    status: "tool",
    pillar: "ops",
    parentPillar: "push" // 监控告警直接喂给场景推送时间轴
  },
  {
    key: "contracts",
    title: "合同审查",
    description: "AI 辅助审查合同中的知识产权条款。",
    href: "/contracts",
    status: "tool",
    pillar: "ops",
    parentPillar: "compliance" // 合同审查属于合规 SaaS 能力
  },
  {
    key: "policies",
    title: "政策速递",
    description: "行业知识产权政策与合规提醒。",
    href: "/policies",
    status: "tool",
    pillar: "ops",
    parentPillar: "compliance" // 政策雷达是合规订阅的内容源
  },
  {
    key: "due-diligence",
    title: "融资尽调",
    description: "汇总目标公司 IP 资产、风险与估值因素。",
    href: "/due-diligence",
    status: "tool",
    pillar: "ops",
    parentPillar: "consult" // 尽调是咨询场景的深度输出
  }
];

export const pillarOrder: Pillar[] = [
  "profile",
  "matching",
  "push",
  "acquisition",
  "consult",
  "compliance",
  "digital",
  "ops"
];

/**
 * 按支柱归组模块。带 `parentPillar` 的 tool（即 `pillar === "ops"` 的子能力）
 * 会被附到对应业务支柱的末尾，而不是只出现在 ops 分组。ops 分组本身只保留
 * 没有声明 `parentPillar` 的"纯通用工具"（如 dashboard / inbox）。
 */
export function modulesByPillar(): Array<{ pillar: Pillar; meta: typeof pillarMeta[Pillar]; items: ModuleDefinition[] }> {
  return pillarOrder.map((p) => {
    if (p === "ops") {
      return {
        pillar: p,
        meta: pillarMeta[p],
        items: modules.filter((m) => m.pillar === "ops" && !m.parentPillar)
      };
    }
    const primary = modules.filter((m) => m.pillar === p);
    const subordinates = modules.filter((m) => m.pillar === "ops" && m.parentPillar === p);
    return {
      pillar: p,
      meta: pillarMeta[p],
      items: [...primary, ...subordinates]
    };
  });
}

/**
 * 给定任意 module，返回它在叙事层面的归属支柱：
 * - pillar module 返回自身 pillar
 * - tool module 返回 `parentPillar`（若无则回落到 "ops"）
 */
export function resolveParentPillar(mod: ModuleDefinition): Pillar {
  if (mod.pillar !== "ops") return mod.pillar;
  return mod.parentPillar ?? "ops";
}

export const riskLevelMeta: Record<
  RiskLevel,
  { label: string; className: string; description: string }
> = {
  green: {
    label: "可用",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    description: "未发现直接冲突，可进入申请书生成。"
  },
  yellow: {
    label: "近似",
    className: "bg-amber-100 text-amber-800 border-amber-200",
    description: "存在近似项，需查看建议后再决定是否申请。"
  },
  red: {
    label: "冲突",
    className: "bg-rose-100 text-rose-800 border-rose-200",
    description: "存在明显冲突，建议先调整命名方案。"
  }
};

export const stepTypeNames: Record<string, string> = {
  diagnosis: "IP 诊断",
  trademark_check: "商标查重",
  application_generate: "申请书生成",
  submission_guide: "提交引导",
  ledger_write: "入台账",
  reminder_create: "创建提醒",
  monitoring_scan: "侵权监控",
  competitor_track: "竞争对手追踪",
  contract_review: "合同审查",
  patent_assess: "专利评估",
  policy_digest: "政策速递",
  due_diligence: "尽调报告"
};
