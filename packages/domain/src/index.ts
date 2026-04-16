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
    | "due-diligence";
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
    key: "dashboard",
    title: "工作台",
    description: "查看核心指标、流程入口与 provider 健康状态。",
    href: "/dashboard",
    status: "core"
  },
  {
    key: "diagnosis",
    title: "IP 诊断",
    description: "根据业务描述生成保护建议，并引导进入后续模块。",
    href: "/diagnosis",
    status: "core"
  },
  {
    key: "trademark",
    title: "商标工作流",
    description: "完成查重、风险判断、申请书生成与提交引导。",
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
    key: "reminders",
    title: "提醒中心",
    description: "查看到期提醒、任务状态与重试入口。",
    href: "/reminders",
    status: "core"
  },
  {
    key: "monitoring",
    title: "侵权监控雷达",
    description: "基于公开搜索的商标侵权监控与告警。",
    href: "/monitoring",
    status: "core"
  },
  {
    key: "competitors",
    title: "竞争对手追踪",
    description: "跟踪竞品 IP 动态，评估竞争态势。",
    href: "/competitors",
    status: "core"
  },
  {
    key: "contracts",
    title: "合同 IP 条款审查",
    description: "AI 辅助审查合同中的知识产权相关条款。",
    href: "/contracts",
    status: "core"
  },
  {
    key: "patents",
    title: "专利 / 软著辅助",
    description: "评估技术方案，推荐专利或软著保护策略。",
    href: "/patents",
    status: "core"
  },
  {
    key: "policies",
    title: "行业政策摘要",
    description: "AI 整理行业知识产权政策与合规提醒。",
    href: "/policies",
    status: "core"
  },
  {
    key: "due-diligence",
    title: "融资 IP 尽调",
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
