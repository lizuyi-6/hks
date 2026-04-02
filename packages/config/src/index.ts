import type { DataMode } from "@a1plus/domain";

export type FeatureFlagKey =
  | "monitoringPublicSearch"
  | "monitoringAuthorizedApi"
  | "monitoringAuthorizedScrape"
  | "competitors"
  | "contractReview"
  | "patentAssist"
  | "policyDigest"
  | "dueDiligence";

export type ProviderKey =
  | "trademarkSearch"
  | "enterpriseLookup"
  | "publicWebSearch"
  | "knowledgeBase"
  | "llm"
  | "documentRender"
  | "notification"
  | "monitoring"
  | "submissionGuide";

export type FeatureFlags = Record<FeatureFlagKey, boolean>;
export type ProviderModes = Record<ProviderKey, DataMode>;

export const defaultFeatureFlags: FeatureFlags = {
  monitoringPublicSearch: false,
  monitoringAuthorizedApi: false,
  monitoringAuthorizedScrape: false,
  competitors: false,
  contractReview: false,
  patentAssist: false,
  policyDigest: false,
  dueDiligence: false
};

export const defaultProviderModes: ProviderModes = {
  trademarkSearch: "real",
  enterpriseLookup: "real",
  publicWebSearch: "real",
  knowledgeBase: "real",
  llm: "real",
  documentRender: "real",
  notification: "real",
  monitoring: "real",
  submissionGuide: "real"
};

export const providerDisplayNames: Record<ProviderKey, string> = {
  trademarkSearch: "商标查询",
  enterpriseLookup: "企业查询",
  publicWebSearch: "公开网页检索",
  knowledgeBase: "知识库",
  llm: "分析引擎",
  documentRender: "文档渲染",
  notification: "通知发送",
  monitoring: "监控采集",
  submissionGuide: "提交流程指引"
};

export const legalBoundaryNotice =
  "仅供参考，以官方为准。A1+ 仅提供文件准备与提交流程指引，不代替用户提交任何官方申报。";

export function parseBooleanFlag(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

