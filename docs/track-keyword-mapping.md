# 赛道关键词 ↔ A1+ 2.0 能力映射

给评委 / 自己的「关键词雷达表」 —— 每个赛道关键词都能精确定位到代码、UI、数据三个维度。

## 映射总览

| 赛道关键词 | UI 入口 | 后端服务 | 数据模型 | Demo 1 句话 |
|---|---|---|---|---|
| **需求画像** | `/consult` 需求指纹卡 | `profile_engine.build_profile_fingerprint` | `UserProfileTag` | "把用户一句话输入，抽成结构化需求指纹" |
| **智能匹配** | `/match`、`/consult` Top 3 卡 | `matching_engine.run_matching`（规则召回 + LLM 重排） | `MatchingRequest` + `MatchingCandidate` | "两阶段匹配，给你最合适的 Top 3 律师" |
| **场景化推送** | 自动化中心 / Inbox | `automation_engine` 8 套 BUILTIN_RULES | `AutomationRule` + `Notification` | "诊断红灯 → 推律师；资产到期 → 推续展" |
| **精准获客** | `/provider` > 线索池 | `provider_crm.list_leads` + ROI | `ProviderLead` | "AI 基于画像自动派发高温线索" |
| **智能咨询** | `/consult` + FloatingAgent | `chat_service.run_chat_stream` + 4 新工具 | `ConsultationSession` | "AI 首诊；置信度低自动转人工律师" |
| **合规 SaaS** | `/enterprise` 4 个 Tab | `compliance_engine.run_compliance_audit` | `ComplianceProfile` + `ComplianceFinding` | "一键企业 IP 合规体检，风险热力图+整改路径" |
| **服务数字化** | `/orders` + `/provider` 订单 | `order_service`（报价→签约→托管→交付→验收） | `ServiceOrder` | "从委托到验收全流程数字化 + 托管支付" |
| **诉讼智能（新）** | `/litigation` 三栏仪表盘 + Agent `predict_litigation` 工具 | `litigation_service.run_prediction` + `LitigationPredictorPort` | `LitigationCase` + `LitigationPrediction` + `LitigationPrecedent` | "一句案情 → 胜诉率 / 金额 / 周期 + 策略 + 类案 + 实时情景推演" |

## 10 套场景化推送模板（automation_engine.BUILTIN_RULES）

1. `scenario.diagnosis_to_match` — 诊断完成 → 推荐 3 位律师
2. `scenario.trademark_red_flag` — 商标查重红灯 → 咨询律师入口
3. `scenario.asset_expiring_renewal` — 资产到期 90 天 → 续展代办
4. `scenario.monitoring_infringement_hit` — 监控命中侵权 → 一键维权
5. `scenario.policy_hit_compliance` — 政策命中 → 合规建议
6. `scenario.provider_fresh_lead` — 高分线索 → 律师端催办
7. `scenario.compliance_score_low` — 合规评分 <60 → 改善计划
8. `scenario.order_silent_followup` — 订单静默 48h → 双向催办
9. `scenario.litigation_high_risk` — 诉讼胜诉率 < 40% → 推送和解 / 补强证据建议
10. `scenario.litigation_ready_to_file` — 胜诉率 ≥ 70% 且证据分 ≥ 8 → 推送一键委托律师起诉

## 核心端口（adapters/ports）

2.0 新增 4 个 + 诉讼模块新增 1 个端口，每个都具备 real / mock 双适配器：

- `MatchingPort` — 匹配重排（LLM 打分）
- `ComplianceAuditPort` — 合规体检打分
- `PaymentEscrowPort` — 托管支付
- `ESignaturePort` — 电子签约
- `LitigationPredictorPort` — 诉讼胜诉率 / 金额 / 周期 / 策略预测（新）

保留 12 个原有端口：`llm` / `trademark_search` / `monitoring` / `contract_review` / `patent_assist` / `policy_digest` / `due_diligence` / `document_render` / `knowledge_base` / `competitor` / `notification` / `submission_guide`。

## 数据模式透明约束

所有返回均带 `DataSourceEnvelope`:

```json
{
  "mode": "real" | "mock",
  "provider": "matching-llm-real",
  "traceId": "...",
  "retrievedAt": "...",
  "sourceRefs": [{"title": "...", "url": "..."}],
  "disclaimer": "仅供参考，以官方为准",
  "normalizedPayload": { /* 实际数据 */ }
}
```

前端不允许在同一聚合视图中混合 `real` 与 `mock` 数据，Demo 场景统一使用 mock，可切换环境变量启用 real。

## 如何切换 real / mock

`.env`:

```
PROVIDER_MATCHING_MODE=mock
PROVIDER_COMPLIANCE_AUDIT_MODE=mock
PROVIDER_ESIGNATURE_MODE=mock
PROVIDER_PAYMENT_ESCROW_MODE=mock
PROVIDER_LITIGATION_PREDICTOR_MODE=mock
```

改成 `real` 即走真实适配器（目前 real 适配器都会 fallback 到 mock 以保证 demo 稳定）。
