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

export type ModuleDefinition = {
  key:
    | "dashboard"
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
    | "automation";
  title: string;
  description: string;
  href: string;
  status: "core" | "skeleton";
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
  {
    key: "inbox",
    title: "收件箱",
    description: "查看任务状态、待审批事项、提醒通知和巡检结果。",
    href: "/inbox",
    status: "core"
  },
  {
    key: "dashboard",
    title: "工作台",
    description: "核心指标、流程入口、provider 状态与自动化配置。",
    href: "/dashboard",
    status: "core"
  },
  {
    key: "diagnosis",
    title: "IP 规划",
    description: "IP 诊断、专利/软著评估与保护策略建议。",
    href: "/diagnosis",
    status: "core"
  },
  {
    key: "trademark",
    title: "商标工作流",
    description: "查重、风险判断、申请书生成与提交引导。",
    href: "/trademark/check",
    status: "core"
  },
  {
    key: "assets",
    title: "IP 资产台账",
    description: "管理商标、专利、软著与版权资产。",
    href: "/assets",
    status: "core"
  },
  {
    key: "monitoring",
    title: "IP 监控",
    description: "侵权监控、竞品追踪与风险告警。",
    href: "/monitoring",
    status: "core"
  },
  {
    key: "contracts",
    title: "合同审查",
    description: "AI 辅助审查合同中的知识产权条款。",
    href: "/contracts",
    status: "core"
  },
  {
    key: "policies",
    title: "政策速递",
    description: "行业知识产权政策与合规提醒。",
    href: "/policies",
    status: "core"
  },
  {
    key: "due-diligence",
    title: "融资尽调",
    description: "汇总目标公司 IP 资产、风险与估值因素。",
    href: "/due-diligence",
    status: "core"
  }
];

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
