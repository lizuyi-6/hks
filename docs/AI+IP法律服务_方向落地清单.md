# AI + 知识产权法律服务 — 七大方向在本项目中的落地清单

> 本文用来回答一个问题：赛道描述里的 7 个关键词，在 A1+ IP Coworker 这套仓库里**具体是哪一段代码、哪个页面、哪张表在实现**？
> 全部引用都指向 `apps/api`（FastAPI 后端）、`apps/web`（Next.js 前端）和 `packages/`（共享 TS 包）里的真实文件，是现存实现，不是规划。
>
> 本文与 `docs/track-keyword-mapping.md` 互补：那张表是「关键词雷达」，这份是每个方向的**工作原理 + 数据流 + 可点进的功能点**。

---

## 目录

1. 需求画像（Profile Fingerprint）
2. 智能匹配（Intelligent Matching）
3. 场景化推送（Scenario-based Push）
4. 精准获客（Precision Lead Acquisition）
5. 智能咨询（Intelligent Consultation）
6. 合规 SaaS（Compliance SaaS）
7. 服务数字化（Service Digitalization）

每一节的结构统一为：

- **定位**：这个方向在产品里解决什么问题
- **核心实现文件**：后端 / 前端 / 数据表
- **功能表现**：用户/律师在 UI 里能实际点到的功能
- **数据流**：一次典型调用从哪来到哪去

---

## 1. 需求画像（Profile Fingerprint）

### 定位
把用户一句话自然语言需求 + 静态档案（行业、阶段、申请人类型）+ 行为信号（最近用过哪些工具、有哪些资产、哪些资产快到期）融合成一张结构化「需求指纹」，作为后续匹配 / 推送 / 咨询的统一输入。

### 核心实现
- 后端引擎：`apps/api/app/services/profile_engine.py`
  - `detect_intent_category` / `detect_urgency` / `detect_budget` / `detect_region` — 关键词规则抽取
  - `_llm_extract` — 规则置信度不足时用 `LLMPort.analyze_text`（Doubao）兜底抽取
  - `_static_tags` — 从 `User` 表读行业 / 阶段 / 申请人类型 / 是否已有商标专利
  - `_behavior_tags` — 从 `ModuleResult` / `IpAsset` / `JobRecord` 读最近 90 天行为
  - `build_profile_fingerprint` — 合并以上三路，写入 `UserProfileTag`，返回 fingerprint dict
- 后端路由：`apps/api/app/api/routes/profile.py`
  - `GET  /profile/tags` — 按 tag_type 分组返回画像标签
  - `GET  /profile/fingerprint` — 返回最近一次画像指纹（来自 `MatchingRequest` 或实时合成）
  - `POST /profile/fingerprint/preview` — 不落库预览（给 onboarding 的"一句话说需求 → 画像确认"使用）
  - `GET  /profile/activity` — 最近 20 条画像行为事件流
- 前端入口：
  - `apps/web/src/app/(workspace)/my-profile/page.tsx` → `apps/web/src/components/workspace/profile-view.tsx` —「我的画像」页
  - `apps/web/src/components/onboarding-wizard.tsx` — 新人引导里的「一句话说需求 → 画像确认」
  - `apps/web/src/components/workspace/consult.tsx` 顶部的**需求指纹卡**（intent / urgency / budget / region / tags）
- 数据表：`UserProfileTag`（tag_type / tag_value / confidence / source / evidence）、`MatchingRequest.profile_snapshot` + `MatchingRequest.profile_vector`

### 功能表现
- 首次进入 `/consult` 或 onboarding 时，用户输入一句话 → 页面顶部出现一张画像卡：**意图分类、紧急度、预算区间、地域、标签云**
- `/my-profile` 里可以看到所有历史画像标签（按类型 industry / stage / intent / urgency / budget / asset / behavior 分组），每条标签都显示置信度和来源（query / profile / behavior）
- 标签有 30 天过期机制（`build_profile_fingerprint` 里 `cutoff = now - 30d`），保证画像新鲜

### 数据流
```
用户输入 raw_query
   │
   ▼
profile_engine.build_profile_fingerprint
   ├─ 关键词规则抽取 (intent / urgency / budget / region)
   ├─ LLM 兜底（Doubao analyze_text，当关键词置信度低时才调用）
   ├─ 读 User 静态字段 → 静态标签
   ├─ 读 ModuleResult / IpAsset / JobRecord → 行为标签
   └─ 合并去重，写入 UserProfileTag，返回 fingerprint
   │
   ▼
 MatchingEngine / AutomationEngine / ChatService 都以 fingerprint 为入参
```

---

## 2. 智能匹配（Intelligent Matching）

### 定位
基于画像指纹，给用户返回 Top 3-5 位最合适的律师 / 代理机构，并把同一结果**同时**写成律师端的新线索（驱动方向 4）。

### 核心实现
- 后端引擎：`apps/api/app/services/matching_engine.py`
  - 双路召回：
    1. `_recall_by_tags` — 按 intent / region 硬过滤 + `rating*10+orders` 排序（领域相关保底）
    2. `_recall_by_embedding` — bag-of-tags 余弦相似度召回（跨领域补集；向量存在 `legal_service_providers.tag_vec` 列）
  - `_rrf_merge` — Reciprocal Rank Fusion 合并两路，`k=60`
  - 重排：通过 `MatchingPort.rank`（`adapters/real/matching.py`，LLM 打分）输出最终 Top K
  - 结果落库：写 `MatchingRequest` + `MatchingCandidate`，并对 score ≥ 30 的候选自动生成 `ProviderLead`（驱动精准获客）
- 后端端口：`apps/api/app/ports/interfaces.py::MatchingPort`，真实适配器 `apps/api/app/adapters/real/matching.py`（LLM 打分重排）、向量构建在 `apps/api/app/adapters/real/matching_embedding.py`
- 后端路由：`apps/api/app/api/routes/matching.py`
  - `POST /matching/run` — 一次完整匹配（画像 → 召回 → 重排 → 落库 → 回放）
  - `POST /matching/fingerprint` — 仅画像不匹配
  - `GET  /matching` — 历史匹配请求列表
  - `GET  /matching/{request_id}` — 匹配详情（画像 + 候选 + 产品 + reasons）
- 后端路由：`apps/api/app/api/routes/providers.py`
  - `GET /providers/depth` — 律师「深耕度」（L1/L2/L3 徽章），由订单量 + 评分 + 胜诉率加权
- 前端入口：
  - `apps/web/src/app/(workspace)/match/page.tsx` → `apps/web/src/components/workspace/match.tsx` —「匹配历史」+「候选详情」双栏
  - `apps/web/src/components/workspace/consult.tsx` 的 Top 3 候选卡片 —「咨询 → 匹配 → 订单」闭环
- 数据表：`MatchingRequest`、`MatchingCandidate`、`LegalServiceProvider`（含 `practice_areas` / `regions` / `featured_tags` / `tag_vec`）、`ServiceProduct`

### 功能表现
- `/consult` / `/match` 输入一句话 → 右侧出现 3-5 张律师卡，每张卡显示：姓名、评分、接单数、响应 SLA、执业领域徽章、深耕等级 `L3 深耕专家` / `L2 活跃服务` / `L1 新锐`、**匹配 score 与命中原因**（reasons 数组，来源于 LLM 打分解释）、推荐服务产品（含价格、交付天数）
- 候选卡片支持「发起咨询」「请求报价」两个动作，直接衔接方向 5（咨询）和方向 7（订单）

### 数据流
```
raw_query → build_profile_fingerprint
          │
          ▼
          双路召回（tag 硬过滤 + 向量召回）
          │
          ▼
          RRF 合并 → top_n=15
          │
          ▼
          MatchingPort.rank (LLM 打分重排) → top_k=5
          │
          ├─→ 写 MatchingRequest + MatchingCandidate (给 C 端看)
          └─→ 写 ProviderLead (给 B 端看，score≥30)
                │
                └─→ emit_event(PROVIDER_LEAD_CREATED)
                      │
                      └─→ automation_engine 触发 scenario.provider_fresh_lead 推送
```

---

## 3. 场景化推送（Scenario-based Push）

### 定位
把「在合适的时间把合适的下一步动作推给合适的人」做成可配置的规则引擎，覆盖 C 端（个人 / 企业）和 B 端（律师）两侧。

### 核心实现
- 规则引擎：`apps/api/app/services/automation_engine.py`
  - `BUILTIN_RULES` — 内置 10+ 条规则（cron 定时 + event 事件触发）
  - `_safe_eval_expression` — 对 `condition_expr` 做 AST 白名单沙箱化执行（禁止 `__class__` / `__mro__` 等反射）
  - `execute_action` — 支持 4 种动作：`enqueue_job` / `advance_workflow` / `create_notification` / `create_scenario_push`
- 事件总线：`apps/api/app/services/event_bus.py` + `apps/api/app/services/event_types.py`（如 `JOB_COMPLETED` / `PROVIDER_LEAD_CREATED` / `ASSET_EXPIRING_SOON` / `MONITORING_ALERT` / `POLICY_DIGEST_READY`）
- Worker：`apps/worker/event_processor.py` 消费事件，匹配 `AutomationRule` → 调用 `execute_action`
- 后端路由：`apps/api/app/api/routes/automation.py`
  - `GET  /automation/rules` / `POST /automation/rules` / `PUT /automation/rules/{id}` — 规则 CRUD
  - `POST /automation/rules/{id}/fire` — 手动触发一条规则
  - `GET  /automation/event-types` — 可订阅的事件类型目录（给"新建规则向导"用）
  - `GET  /automation/templates` — 内置场景模板（所有 `create_scenario_push` 规则）
  - `GET  /automation/timeline` — 最近 50 条已触发的站内推送
- 前端入口：
  - `apps/web/src/app/(workspace)/push-center/page.tsx` → `apps/web/src/components/workspace/push-center.tsx` —「场景推送中心」
  - `apps/web/src/components/inbox.tsx` — 站内信视图（读取 `Notification`）
- 数据表：`AutomationRule`、`SystemEvent`、`Notification`

### 功能表现（内置 10 条场景规则）

| 规则 Key | 触发条件 | 推送效果 |
|---|---|---|
| `scenario.diagnosis_to_match` | 诊断完成 | 推送「为你推荐 3 位擅长此领域的律师」→ 跳 `/consult?prefill=diagnosis` |
| `scenario.trademark_red_flag` | 商标查重命中红灯 | 高优先级「建议咨询专业律师」 |
| `scenario.asset_expiring_renewal` | 资产距到期 ≤ 90 天 | 「是否交由律师代办续展？」 |
| `scenario.monitoring_infringement_hit` | 监控命中高危侵权（`high_count > 0`） | 「一键委托律师维权」 |
| `scenario.policy_hit_compliance` | 政策雷达出刊且 `impact_high=true` | 给订阅企业推送合规建议 |
| `scenario.provider_fresh_lead` | 新线索 score ≥ 70 | **律师端**「新线索匹配分 ≥ 70，建议 3 小时内响应」 |
| `scenario.compliance_score_low` | 合规评分 < 60 | 企业端「建议启动改善计划」 |
| `scenario.order_silent_followup` | cron 每 6h 扫描静默超 48h 的订单 | 双向催办（用户和律师同时推送） |
| `scenario.litigation_high_risk` | 诉讼胜诉率 < 40% | 「建议先行和解或补强证据」 |
| `scenario.litigation_ready_to_file` | 诉讼胜诉率 ≥ 75% | 「一键匹配诉讼律师」→ 跳 `/match?intent=litigation` |

前端 `/push-center` 页面可以：
- 看到每条规则的启停状态、最近触发时间、触发次数
- 启停任意规则、手动 `fire_rule` 演示
- 从"新建规则向导"里选择 event 类型 + 填 `condition_expr` + 填 `title/body/action_url` 自建规则
- 时间线 tab 按时间倒序展示所有触发过的 `Notification`，按 category / priority 分色

### 数据流
```
业务事件发生 (diagnosis.completed / monitoring.alert / ...)
   │
   ▼
 event_bus.emit_event → 写 SystemEvent
   │
   ▼
 worker event_processor 轮询未处理 SystemEvent
   │
   ▼
 automation_engine 匹配规则 → 评估 condition_expr (沙箱 AST)
   │
   ▼
 execute_action
   ├─ create_scenario_push → 写 Notification + 可选发邮件
   ├─ enqueue_job → 写 JobRecord
   └─ advance_workflow → 推进 WorkflowInstance 下一步
   │
   ▼
 前端 /inbox + /push-center 实时读取
```

---

## 4. 精准获客（Precision Lead Acquisition）

### 定位
B 端（律师 / 代理机构）的主阵地：把 C 端匹配请求转成打了分、分了温度、可以认领、可以派给团队成员、可以算 ROI 的**线索池**。

### 核心实现
- 后端引擎：`apps/api/app/services/provider_crm.py`
  - `compute_lead_temperature` / `recompute_lead_temperature` — 基于 match score + 紧急度 + 预算信号 + 时效衰减 + 客户活跃度，输出 `hot/warm/cool/cold` 四档温度；完整分值分解写入 `lead.snapshot.temperature_signals`（供 UI 透明化展示）
  - `list_leads` — 律师查看自己的线索池，支持按 status / temperature 过滤
  - `claim_lead` / `mark_lead_status` — 认领 / 状态流转（new → claimed → contacted → quoted → won/lost）
  - `get_acquisition_funnel` — 5 段获客漏斗：匹配分发 → 律师查看 → 线索认领 → 报价签单 → 成交
  - `client_profile` — 客户 360°：画像标签 + 历史匹配记录 + 订单轨迹
  - `roi_report` / `roi_attribution` — ROI 总表 + 细分归因（按 intent / temperature / region / source / category 切片 + Top 客户榜）
- 后端路由：`apps/api/app/api/routes/leads.py`
  - `GET  /provider-leads` — 我的线索池（支持 status / temperature 过滤）
  - `POST /provider-leads/{id}/view` — 幂等记录首次查看时间（驱动漏斗"律师查看"阶段）
  - `POST /provider-leads/{id}/claim` — 认领线索
  - `POST /provider-leads/{id}/status` — 更新线索状态
  - `POST /provider-leads/{id}/assign` — 把线索派给律所成员（`FirmMember`）
  - `GET  /provider-leads/clients/{user_id}` — 客户画像 360°
  - `GET  /provider-leads/roi` + `GET /provider-leads/roi/attribution` — ROI 报表
  - `GET  /provider-leads/funnel` — 5 段漏斗 + 温度分布 + 意图分布 + 平均认领时长
  - `POST /provider-leads/temperature-recompute` — 手动触发温度重算（D5 日批的 ad-hoc 版）
  - `GET  /provider-leads/firm-members` / `POST /provider-leads/firm-members` — 律所多账号协作
- 前端入口：
  - `apps/web/src/app/(workspace)/provider/page.tsx` → `apps/web/src/components/workspace/provider.tsx` —「律师工作台」
  - Tab：`dashboard` / `leads`（线索池） / `funnel`（获客漏斗图） / `team`（律所成员与派单） / `products`（服务产品） / `orders`（订单） / `crm`（客户画像）
- 定时规则：`automation_engine.BUILTIN_RULES` 里的 `sys.daily_lead_temperature_recompute`（每日 02:30 自动重算 6h 内未更新的线索温度）
- 数据表：`ProviderLead`、`FirmMember`、`LegalServiceProvider`、`ServiceProduct`、`ServiceOrder`

### 功能表现
- **线索池**：按温度 🔥hot / ☀️warm / ❄️cool / 🧊cold 分栏，每张线索卡显示客户画像摘要（行业 / 阶段 / 意图 / 预算 / 地域 / 标签）+ match score + 温度分值分解（紧急度×、预算×、时效×、活跃度×）
- **获客漏斗**：五阶段柱状图 + 转化率，侧边显示"匹配分发 → 律师查看"平均时长、温度分布饼图、意图分布条形图
- **客户 360°**：点进一条线索 → 看到这个客户过去所有匹配请求、画像标签、订单轨迹、评分记录
- **ROI 报表**：近 30 天收入 / 成单数 / 平均单价 + 按意图/温度/地域/来源/类目 5 个维度的 attribution 分布 + Top 10 客户榜
- **律所多账号**：律所 owner 可以添加 Associate，把线索 `assign` 给特定成员，成员 `activeLeads` / `closedLeads` 自动累加
- **场景推送联动**：高分线索（score ≥ 70）自动触发 `scenario.provider_fresh_lead` 规则 → 律师 App 内推送"3 小时内响应"提醒

### 数据流
```
C 端 matching.run_matching
   │
   └─→ 对每个 score ≥ 30 的候选写 ProviderLead
          │
          ├─ recompute_lead_temperature (score + 紧急度 + 预算 + 时效 + 活跃度)
          │  → 写 hot/warm/cool/cold + snapshot.temperature_signals
          │
          └─ emit PROVIDER_LEAD_CREATED 事件
                │
                └─→ scenario.provider_fresh_lead (若 score ≥ 70)
                       → 写 Notification(target=律师)

律师操作：
   view → last_viewed_at (驱动漏斗)
   claim → status=claimed, claimed_at, 更新 FirmMember.active_leads
   assign → 派单给团队成员
   quote → 创建 ServiceOrder (进入方向 7)
```

---

## 5. 智能咨询（Intelligent Consultation）

### 定位
AI 先做一轮"法务首诊"，置信度够就直接给答案 + 执行工具；置信度不够或检测到高风险关键词（诉讼 / 维权 / 竞业 / 对方律师函）就自动转人工律师。所有对话历史、置信度曲线、转人工原因都可回放。

### 核心实现
- 后端核心：`apps/api/app/services/chat_service.py` — 3W+ 字的 Agent 主循环
  - 系统提示词里定义了 Agent 身份「A1+ 法务大脑」+ 12 个工具调用能力
  - 工具集（`CHAT_TOOLS`）：
    - **即时工具**：`trademark_check` / `ip_diagnosis` / `trademark_application` / `contract_review` / `patent_assess` / `policy_digest`
    - **服务匹配工具**：`find_lawyer`（调 MatchingEngine）/ `request_quote`（创建 ServiceOrder）/ `start_consultation`（创建 ConsultationSession）/ `compliance_scan`（触发合规体检）
    - **诉讼智能工具**：`predict_litigation`（调 LitigationPredictorPort，返回胜诉率、赔偿区间、策略、类案）
  - `needs_human_handoff` — 关键词扫描（"起诉/应诉/律师函/竞业纠纷/融资/估价/赔偿"等），命中即自动降置信度、切换到 `awaiting_provider`
  - `run_chat_stream` — SSE 流式主循环，逐 token 输出 + `action_start` / `action_result` / `done` 事件
- 后端路由：
  - `POST /chat/stream` — 主入口（SSE）；定义在 `apps/api/app/api/routes/chat.py`
  - `apps/api/app/api/routes/consultations.py`：
    - `POST /consultations` — 创建咨询会话（channel 可选 ai / human / handoff）
    - `GET  /consultations` / `GET /consultations/{id}` — 历史列表与详情
    - `POST /consultations/{id}/messages` — 追加消息，同时重算 `ai_confidence`
    - `POST /consultations/{id}/handoff` — 用户主动转人工（强制切到 `awaiting_provider`，`ai_confidence` ≤ 0.4）
    - `POST /consultations/{id}/close` — 结束会话并评分
- 前端入口：
  - `apps/web/src/app/(workspace)/consult/page.tsx` → `apps/web/src/components/workspace/consult.tsx` — 主咨询页
  - `apps/web/src/components/agent/*` — FloatingAgent 全局浮窗（跨页面可用）
  - CLI REPL：`apps/cli/repl.py` + `python -m apps.cli repl` — 终端里也能跑（Claude Code 风格）
- 数据表：`ConsultationSession`（status / channel / ai_confidence / handoff_reason / ai_handoff_at / transcript / rating）、`LegalServiceProvider`

### 功能表现
- **AI 首诊 UI**：左边对话流（SSE 逐字吐）+ 右边工具调用面板（Agent 调用了哪个工具、参数、返回值都可视化）+ 顶部需求指纹卡（来自方向 1）
- **置信度环**：对话顶部一个 Donut Ring 实时显示 `ai_confidence`，低于阈值时变红、弹出"建议发起人工咨询"横幅
- **自动转人工**：系统提示词规定"用户说想找律师 / 需要人工 → 立即调用 `start_consultation`"，前端 UI 会把 AI 回复中夹带的律师卡渲染出来
- **Top 3 律师卡**：Agent 调用 `find_lawyer` 工具时，前端把返回的候选渲染成卡片，直接可以"发起咨询"或"请求报价"（跳方向 7）
- **会话回放**：`/consult` 左侧列出历史会话，每条显示 status（`ai_live` / `awaiting_provider` / `in_provider` / `closed`）、置信度、转人工原因、评分
- **CLI 版本**：`python -m apps.cli repl` 打开终端 REPL，同一套 SSE 流 + 工具调用面板用 Rich 渲染；支持 `/diagnose` `/trademark-check` `/assets` 等 slash 命令

### 数据流
```
用户消息 → POST /chat/stream (SSE)
   │
   ▼
 chat_service.run_chat_stream
   ├─ 注入 system prompt (含用户资产台账、画像)
   ├─ 调 LLMPort.chat_stream (Doubao tool-calling)
   ├─ LLM 决定调哪个工具 → 执行工具 → 把返回塞回对话
   ├─ 计算 ai_confidence (基于有没有命中 handoff 关键词、工具返回的 risk_level)
   └─ 实时 emit SSE (token / action_start / action_result / done)
   │
   ▼
 前端 fetchSSE 逐字渲染 + 工具面板展示
   │
   ▼
 若 ai_confidence < 阈值 → create_consultation_session(channel='handoff')
                         → status='awaiting_provider'
                         → 律师端 /provider/leads 可见 (驱动方向 4)
```

---

## 6. 合规 SaaS（Compliance SaaS）

### 定位
面向企业的订阅制产品：一键跑 IP 合规体检 → 生成评分 + 热力图 + 发现项 + 整改路径 + 推荐配套服务产品；可订阅政策雷达 + 多格式导出报告。

### 核心实现
- 后端引擎：`apps/api/app/services/compliance_engine.py`
  - `run_compliance_audit` — 核心体检流程：
    1. 查询用户所有 `IpAsset` → 资产画像
    2. 调 `ComplianceAuditPort.audit` 得到评分 / 分类 breakdown / 热力图
    3. 跑 sub-audit 插件（`adapters/real/compliance_subaudits.py`）补充领域专项发现（数据合规、劳动合同、股权代持…）
    4. 写 `ComplianceProfile` + 每条 `ComplianceFinding`（含 severity / remediation / recommendedProducts）
  - `policy_radar` — 调 `PolicyDigestPort` + 按订阅行业过滤，返回最近政策摘要
  - **订阅配额校验**：`ComplianceQuotaExceeded`（免费版月 3 次 / 专业版月 30 次 / 企业版无限）→ 路由层返回 402 + 升级 CTA
  - `create_policy_subscription` / `toggle_policy_subscription` / `upgrade_subscription` — 订阅管理
  - `build_audit_markdown` — 生成多格式可下载报告的 Markdown 源
- 后端路由：`apps/api/app/api/routes/compliance.py`
  - `POST /compliance/audit` — 跑体检（校验配额）
  - `GET  /compliance/profile` / `GET /compliance/profile/{id}` — 读档案
  - `GET  /compliance/profile/{id}/report.{md|docx|pdf}` — 多格式下载报告（通过 `core/md_renderer.py`）
  - `GET  /compliance/policy-radar` — 政策雷达
  - `GET  /compliance/policy-subscriptions` / `POST` / `POST /{id}/toggle` — 订阅 CRUD
  - `GET  /compliance/subscription/tiers` / `GET /compliance/subscription` / `POST /compliance/subscription/upgrade` — 订阅套餐
  - `GET  /compliance/sub-audits` — 查看已注册的子体检插件清单
- 前端入口：
  - `apps/web/src/app/(workspace)/enterprise/page.tsx` → `apps/web/src/components/workspace/enterprise.tsx` —「企业 IP 合规工作台」
  - 4 个 Tab：`overview`（评分仪表盘）/ `audit`（体检详情）/ `policy`（政策雷达）/ `subscription`（订阅管理）
- 定时规则：`sys.weekly_asset_scan`（每周一扫侵权）、`sys.daily_expiry_check`（每日查到期）、`scenario.compliance_score_low`（评分 < 60 推改善计划）
- 数据表：`ComplianceProfile`、`ComplianceFinding`、`PolicySubscription`、`IpAsset`

### 功能表现
- **评分仪表盘**：0-100 分总评 + 5 个维度的 DonutRing（资产登记度 / 合同覆盖度 / 监控覆盖度 / 政策响应度 / 诉讼风险）+ 行业热力图
- **发现项列表**：按 severity（critical / high / medium / low）分色，每条 Finding 附「整改路径」和「推荐服务产品」（直接点到律师产品详情页）
- **政策雷达**：按行业订阅 → 命中新政策时 Tab 上出现红点 + 站内推送（走方向 3）+ 报告里出现 key_changes / action_items / compliance_notes
- **多格式下载**：同一 Markdown 源 → Word / PDF / Markdown 三种格式，文件名自动带企业名前缀
- **订阅配额**：免费版耗尽配额时后端返回结构化 402，前端直接弹"升级到专业版"按钮；企业版解锁律所多账号（与方向 4 联动）+ 企业微信推送 + VIP 律师 1 小时响应
- **子体检插件**：`/compliance/sub-audits` 可查看所有已注册插件（可通过 `COMPLIANCE_SUBAUDITS_DISABLED` 环境变量禁用某些插件）

### 数据流
```
企业用户点"立即体检" → POST /compliance/audit
   │
   ▼
 compliance_engine.run_compliance_audit
   ├─ 配额校验 (ComplianceQuotaExceeded → 402 + 升级 CTA)
   ├─ 读 IpAsset 聚合资产画像
   ├─ ComplianceAuditPort.audit → 评分 + 热力图 + breakdown
   ├─ 逐个跑 sub-audit 插件 → 累加 Finding
   └─ 写 ComplianceProfile + ComplianceFinding
   │
   ▼
 emit COMPLIANCE_AUDIT_COMPLETED
   │
   ├─→ 若评分 < 60 → scenario.compliance_score_low → 推送改善计划
   └─→ 更新订阅 usage (auditsThisMonth +1)
```

---

## 7. 服务数字化（Service Digitalization）

### 定位
把传统"找律师 → 报价 → 签合同 → 打款 → 交付 → 验收"的线下流程，改造成平台托管的 7 段状态机，全程留痕、托管支付、电子签约、双向评分。

### 核心实现
- 后端编排：`apps/api/app/services/order_service.py`
  - 状态机 `ALLOWED_TRANSITIONS`：`pending_quote → quoted → signed → paying → in_delivery → delivered → closed`（+ `cancelled` 支线）
  - 每个订单自动生成里程碑 `milestones`（报价 → 签约 → 支付 → 交付 → 验收），商标类加"协助提交至商标局"，诉讼类加"案件卷宗整理"
  - `issue_quote` / `sign_contract` / `escrow_hold` / `begin_delivery` / `complete_delivery` / `accept_and_release` — 每次状态流转都通过 port 调外部服务
- 外部能力端口：
  - `ESignaturePort` — 电子签约（`adapters/real/esignature.py`）
  - `PaymentEscrowPort` — 托管支付（`adapters/real/payment_escrow.py`），支持 escrow_hold / release / refund
- 工作流引擎：`apps/api/app/services/workflow_engine.py`
  - `WORKFLOW_TEMPLATES` — 目前已上线 `trademark-registration`（诊断 → 查重 → 申请书 → 提交引导 → 入台账 5 步全流程）
  - 步骤上下文 deep-merge，支持 `auto_enqueue`（自动派任务）与 `requires_user_review`（卡点人工审核）
- 工作台 / 订单路由：
  - `apps/api/app/api/routes/orders.py` — 订单 CRUD + 状态流转（`/orders/{id}/quote|sign|pay|deliver|accept`）
  - `apps/api/app/api/routes/workflows.py` — 工作流实例 CRUD + 步骤推进
  - `apps/api/app/api/routes/workflows.py` + `automation_engine.sys.workflow_auto_advance` 联动：任务完成事件自动推进下一步
- 前端入口：
  - `apps/web/src/app/(workspace)/orders/page.tsx` → `apps/web/src/components/workspace/orders.tsx` — C 端订单中心
  - `apps/web/src/components/workspace/provider.tsx` 的 `orders` tab — B 端订单面板
  - `apps/web/src/app/(workspace)/dashboard/page.tsx` — 总览（活跃工作流 / 待办里程碑 / 最近交付物）
  - `apps/web/src/components/workspace/trademark.tsx` + `application.tsx` + `submit-guide.tsx` + `assets.tsx` — 商标注册工作流的五个步骤 UI
- 数据表：`ServiceOrder`（user_rating / provider_rating / milestones / escrow_status）、`WorkflowInstance`、`WorkflowStep`、`DocumentRecord`

### 功能表现
- **订单全生命周期**：订单详情页显示状态机时间线 + 里程碑进度条 + 双方评分控件 + 交付物列表（DOCX / PDF 下载）+ 托管支付收据
- **自动生成交付物**：商标申请书（`POST /trademarks/application`）、合规报告（方向 6 的 docx/pdf）、合同审查摘要等都通过 `core/md_renderer.py` 渲染并挂到订单的 `deliverables`
- **电子签约**：`POST /orders/{id}/sign` 调 `ESignaturePort.create_envelope`，前端跳到签约页（真实适配器挂钩第三方签约，demo 里走 mock 但接口是真的）
- **托管支付**：`POST /orders/{id}/pay` 调 `PaymentEscrowPort.hold`，资金进入托管；`accept_and_release` 时释放给律师；支持 `refund` 分支
- **工作流自动推进**：当用户跑完"诊断报告"任务（`job.completed` 事件），`sys.workflow_auto_advance` 规则自动把商标注册工作流推进到下一步"商标查重"
- **订单静默催办**：cron 每 6 小时扫一次，`scenario.order_silent_followup` 规则对超过 48 小时没动过的订单同时推送给用户和律师
- **双向评分**：`user_rating` 和 `provider_rating` 都落到 `ServiceOrder`，影响律师的 `rating_avg`（反哺方向 2 的匹配排序）与方向 4 的 ROI 报表

### 数据流
```
方向 2 / 5 产出律师候选
   │
   ▼
 POST /orders  (create_order_from_match)
   │
   ▼
 ServiceOrder.status = pending_quote, milestones 初始化
   │
   ▼
 律师 POST /orders/{id}/quote → status=quoted
   │
   ▼
 用户 POST /orders/{id}/sign → ESignaturePort → status=signed
   │
   ▼
 用户 POST /orders/{id}/pay → PaymentEscrowPort.hold → status=paying → in_delivery
   │
   ▼
 律师 POST /orders/{id}/deliver → 交付物挂载 → status=delivered
   │
   ▼
 用户 POST /orders/{id}/accept → PaymentEscrowPort.release → status=closed + 评分
   │
   ▼
 评分回写 provider.rating_avg / provider.orders_count
   (下一次 matching 时，此律师权重更高 → 闭环)
```

---

## 全局闭环：7 个方向是怎么连起来的？

```
        ┌─────────────────┐
        │ 1. 需求画像       │ ← 一句话 raw_query + 静态档案 + 行为信号
        └────────┬────────┘
                 │ fingerprint
                 ▼
        ┌─────────────────┐
        │ 2. 智能匹配       │ ── Top 3-5 律师 ──┐
        └────────┬────────┘                      │
                 │ score ≥ 30                   │
                 ▼                              │
        ┌─────────────────┐              ┌─────▼──────┐
        │ 4. 精准获客       │              │ 5. 智能咨询  │
        │   (ProviderLead) │              │ (AI 首诊→人工)│
        └────────┬────────┘              └─────┬──────┘
                 │ 报价 → 签约              AI 推到咨询
                 └──────────┬───────────────┘
                            ▼
                  ┌─────────────────┐
                  │ 7. 服务数字化     │ ── 交付物回写 ──┐
                  │  (ServiceOrder) │                │
                  └────────┬────────┘                │
                           │ 关键事件 emit             │
                           ▼                         │
                  ┌─────────────────┐                │
                  │ 3. 场景化推送     │ ← 10 条规则     │
                  │ (AutomationRule)│                │
                  └────────┬────────┘                │
                           │                         │
                           ▼                         │
                  ┌─────────────────┐                │
                  │ 6. 合规 SaaS     │ ── 触发体检 ─────┘
                  │(ComplianceProfile)│
                  └─────────────────┘
```

**关键连接点**：

1. **画像 → 匹配**：`profile_engine.build_profile_fingerprint` 是 `matching_engine.run_matching` 的第一行
2. **匹配 → 获客**：`run_matching` 里对 score ≥ 30 的候选**同时**写 `MatchingCandidate`（给 C 端）和 `ProviderLead`（给 B 端）
3. **匹配 / 咨询 → 订单**：`order_service.create_order_from_match` 支持同时关联 `matching_request_id` 和 `consultation_id`
4. **咨询 → 匹配**：`chat_service` 里的 `find_lawyer` 工具直接调 MatchingEngine
5. **任何业务事件 → 推送**：整条链路都通过 `emit_event` + `AutomationRule` 串联，`BUILTIN_RULES` 里每一条都能定位到触发源
6. **合规 ← 画像**：`ComplianceProfile.industry` 与画像标签保持一致；评分 < 60 事件反向触发推送 → 匹配 → 咨询链路
7. **订单评分 → 匹配排序**：`accept_and_release` 更新 `provider.rating_avg`，下一次 `matching_engine._recall_by_tags` 的排序里就吃到这个信号，完成自学习闭环

---

## 相关参考文档

- `docs/track-keyword-mapping.md` — 本文的"关键词雷达"简版（4K 字）
- `docs/A1+_2.0_AI_Legal_OS.md` — 2.0 产品整体定位与演进路线
- `docs/demo-script.md` — 10 分钟 Demo 演示脚本，按方向走一遍
- `docs/product/PRD.md` — 每个模块的需求细节
- `docs/technical/architecture.md` — 端口 / 适配器 / 事件总线整体架构
- `CLAUDE.md` — 代码层面的仓库说明（此文件为工程师入门入口）
