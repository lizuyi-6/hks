export type RiskLevel = "green" | "yellow" | "red";
export type DataMode = "real" | "mock";

export type BusinessProfile = {
  businessName?: string;
  businessDescription: string;
  industry?: string;
  stage?: string;
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
    description: "预留公开搜索、授权 API 与授权抓取通道。",
    href: "/monitoring",
    status: "skeleton"
  },
  {
    key: "competitors",
    title: "竞争对手追踪",
    description: "跟踪竞品商标动态和类别变化。",
    href: "/competitors",
    status: "skeleton"
  },
  {
    key: "contracts",
    title: "合同 IP 条款审查",
    description: "抽取归属、保密、责任等条款并给出修改建议。",
    href: "/contracts",
    status: "skeleton"
  },
  {
    key: "patents",
    title: "专利 / 软著辅助",
    description: "为专利技术交底书和软著登记预留流程骨架。",
    href: "/patents",
    status: "skeleton"
  },
  {
    key: "policies",
    title: "行业政策日报",
    description: "沉淀知识产权政策与通知摘要。",
    href: "/policies",
    status: "skeleton"
  },
  {
    key: "due-diligence",
    title: "融资 IP 尽调",
    description: "汇总资产、风险与缺口，为融资尽调预留出入口。",
    href: "/due-diligence",
    status: "skeleton"
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
