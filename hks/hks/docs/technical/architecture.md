# 架构概览

## 系统概述

A1+ IP Coworker 是一个 AI 驱动的知识产权辅助平台，面向中国小微企业创始人。核心定位是文档准备与分析工具，**不代替用户提交任何官方申报**。所有 AI 生成内容均附带免责声明：`仅供参考，以官方为准`。

## Monorepo 结构

```
hks/
├── apps/
│   ├── web/          # Next.js 15 + React 19 + Tailwind 3 前端
│   ├── api/          # FastAPI + SQLAlchemy + Pydantic v2 后端
│   └── worker/       # 异步任务轮询 Worker
├── packages/
│   ├── domain/       # 共享 TS 类型、模块定义、流程定义
│   ├── config/       # 特性开关、Provider 模式、法律声明
│   └── ui/           # 共享 UI 组件（SectionCard, StatusBadge, SourceTag, Metric, NextStepCard, PipelineIndicator）
├── knowledge-base/   # 静态知识内容（P0/P1 优先级）
├── docker-compose.yml
├── Dockerfile.api
├── Dockerfile.web
└── .env.example
```

## 六边形架构（Ports & Adapters）

后端采用六边形架构，将业务逻辑与外部依赖解耦。

### Port 接口层

定义在 `apps/api/app/ports/interfaces.py`，共 14 个抽象 Port：

| Port | 方法 | 用途 |
|------|------|------|
| `TrademarkSearchPort` | `search()` | 商标查重（基于 CNIPA 快照） |
| `EnterpriseLookupPort` | `lookup()` | 企业信息查询 |
| `PublicWebSearchPort` | `search()` | 公开网页搜索 |
| `KnowledgeBasePort` | `retrieve()` | 本地知识库检索 |
| `LLMPort` | `diagnose()`, `summarize_application()`, `analyze_text()` | AI 分析引擎 |
| `DocumentRenderPort` | `render_application()` | DOCX/PDF 文档生成 |
| `NotificationPort` | `send_email()` | 邮件通知发送 |
| `MonitoringPort` | `scan()`, `get_alerts()` | 侵权监控扫描 |
| `CompetitorPort` | `track()`, `compare()` | 竞品 IP 追踪与对比 |
| `ContractReviewPort` | `review()` | 合同 IP 条款审查 |
| `PatentAssistPort` | `assess()` | 专利/软著评估 |
| `PolicyDigestPort` | `digest()` | 行业政策摘要 |
| `DueDiligencePort` | `investigate()` | 融资 IP 尽调 |
| `SubmissionGuidePort` | `guide()` | CNIPA 提交引导 |

### Adapter 实现层

- **Real 适配器**：`apps/api/app/adapters/real/` — 调用真实 API/LLM
- **Mock 适配器**：`apps/api/app/adapters/mock/providers.py` — 返回测试数据

### ProviderRegistry

`apps/api/app/adapters/registry.py` 中的 `ProviderRegistry` 根据环境变量 `PROVIDER_*_MODE` 解析每个 Port 到对应的 real 或 mock 适配器。

```python
registry = ProviderRegistry()
provider = registry.get("trademarkSearch")  # 根据 PROVIDER_TRADEMARK_SEARCH_MODE 返回 real 或 mock
available, reason = provider.availability()
```

## BFF 代理模式

前端通过 Next.js BFF（Backend For Frontend）层与后端通信，浏览器不直接访问 FastAPI。

```
浏览器 → /api/backend/[...path] (BFF) → http://localhost:8000/[path] (FastAPI)
浏览器 → /api/auth/login (BFF)        → http://localhost:8000/auth/login
```

BFF 路由位于 `apps/web/src/app/api/backend/[...path]/route.ts`：
- 读取 `a1plus-session` cookie，转换为 `Authorization: Bearer <token>` 头
- 支持 GET/POST/PUT/DELETE 方法代理
- 文档下载路径（`/documents/`）返回原始二进制流

## 认证流程

1. **注册**：`POST /auth/register` → 创建用户 → 返回 JWT
2. **登录**：`POST /auth/login` → 验证密码 → 返回 JWT
3. BFF 拦截响应，设置 `httpOnly`, `sameSite=lax` cookie `a1plus-session`
4. 前端中间件 `src/middleware.ts` 强制认证：未登录重定向到 `/login`，已登录重定向到 `/dashboard`

API 层使用 `HTTPBearer` + `get_current_user` 依赖验证 JWT 并加载 User 对象。

## 异步任务系统

### Job 类型

系统共支持 10 种 Job 类型：

| Job 类型 | 用途 |
|---------|------|
| `diagnosis.report` | IP 诊断报告生成 |
| `trademark.application` | 商标申请书生成（DOCX + PDF） |
| `reminder.dispatch` | 提醒邮件发送 |
| `monitoring.scan` | 侵权监控扫描 |
| `competitor.track` | 竞品 IP 追踪 |
| `competitor.compare` | 竞品 IP 对比 |
| `contract.review` | 合同 IP 条款审查 |
| `patent.assess` | 专利/软著评估 |
| `policy.digest` | 行业政策摘要 |
| `due-diligence.investigate` | 融资 IP 尽调 |

### Job 生命周期

```
queued → processing → completed
                   → failed → (重试) → processing → ...
                   → dead_letter（达到最大重试次数 3 次）
```

### 幂等性

Job 通过 SHA-256 哈希（job_type + payload）生成 `idempotency_key`，防止重复提交。

### Worker

`apps/worker/main.py` 以可配置间隔（`WORKER_POLL_INTERVAL`，默认 5 秒）轮询数据库，处理状态为 `queued` 或 `failed` 的 Job。

## 工作流引擎

`apps/api/app/services/workflow_engine.py` 提供多步骤工作流编排：

- **工作流模板**：当前支持 `trademark-registration`（商标注册全流程），包含 5 个步骤：IP 诊断 → 商标查重 → 申请书生成 → 提交引导 → 入台账
- **工作流状态**：`pending` → `running` → `completed` / `failed`
- **步骤状态**：`pending` → `running` → `completed` / `failed` / `skipped`
- **上下文传递**：每个步骤的输出通过深合并（deep merge）写入工作流上下文，供后续步骤使用
- **智能建议**：`get_suggestions()` 根据用户当前状态（进行中的工作流、已完成的诊断、即将到期的资产）生成个性化操作建议

## 数据模型

`apps/api/app/db/models.py` 定义 8 个 SQLAlchemy 模型：

| 模型 | 表名 | 用途 |
|------|------|------|
| `User` | `users` | 用户账户 |
| `JobRecord` | `job_records` | 异步任务队列 |
| `IpAsset` | `ip_assets` | IP 资产台账 |
| `ReminderTask` | `reminder_tasks` | 到期提醒任务 |
| `DocumentRecord` | `document_records` | 生成的文档记录 |
| `WorkflowInstance` | `workflow_instances` | 工作流实例 |
| `WorkflowStep` | `workflow_steps` | 工作流步骤 |
| `ModuleResult` | `module_results` | 模块结果存储 |

关键关系：
- `IpAsset` → 一对多 → `ReminderTask`
- `WorkflowInstance` → 一对多 → `WorkflowStep`
- `WorkflowStep` → 可选关联 → `JobRecord`

## 响应包装（DataSourceEnvelope）

所有 Provider 响应统一包装在 `DataSourceEnvelope[T]` 中：

```json
{
  "mode": "real",
  "provider": "cnipa-snapshot",
  "traceId": "abc123",
  "retrievedAt": "2026-04-09T12:00:00Z",
  "sourceRefs": [{ "title": "CNIPA 商标快照", "url": null, "note": null }],
  "disclaimer": "仅供参考，以官方为准。...",
  "normalizedPayload": { ... }
}
```

`mode` 字段始终为 `real` 或 `mock`，不混合使用。Pydantic 使用 `to_camel` 别名生成器，Python snake_case 字段序列化为 camelCase JSON。

## 错误处理

`apps/api/app/core/error_handler.py` 定义统一的错误层次：

```
APIError (基类)
├── ValidationError    → 422
├── NotFoundError      → 404
├── AuthError          → 401
├── BusinessError      → 400
├── SystemError        → 500
└── 通用 Exception     → 500 (UnknownError)
```

每个错误包含：`errorType`, `message`, `errorLocation`, `requestId`, `timestamp`。

前端 `apps/web/src/lib/errors.ts` 提供对应的 `ApplicationError` 类和 `parseErrorResponse()` 解析器。

## 特性开关系统

8 个特性开关控制模块可见性，定义在 `apps/api/app/core/config.py`：

| 环境变量 | 控制模块 |
|---------|---------|
| `FEATURE_MONITORING_PUBLIC_SEARCH` | 侵权监控（公开搜索渠道） |
| `FEATURE_MONITORING_AUTHORIZED_API` | 侵权监控（授权 API 渠道） |
| `FEATURE_MONITORING_AUTHORIZED_SCRAPE` | 侵权监控（授权抓取渠道） |
| `FEATURE_COMPETITORS` | 竞争对手追踪 |
| `FEATURE_CONTRACT_REVIEW` | 合同 IP 条款审查 |
| `FEATURE_PATENT_ASSIST` | 专利 / 软著辅助 |
| `FEATURE_POLICY_DIGEST` | 行业政策摘要 |
| `FEATURE_DUE_DILIGENCE` | 融资 IP 尽调 |

前端 5 个核心模块（工作台、诊断、商标、资产、提醒）始终可用，无特性开关。

## 知识库

```
knowledge-base/
├── metadata/
│   ├── catalog.json     # 文档目录索引
│   └── schema.json      # 文档 JSON Schema
├── snapshots/
│   └── trademark_snapshot.json  # 商标快照数据（查重用）
└── sources/
    ├── p0/              # 优先级 0：商标分类指南、商标法、申请书填写规范
    └── p1/              # 优先级 1：专利申请模板、软著登记指南
```

索引脚本：`apps/api/scripts/index_knowledge.py`

## 前端模块

11 个功能模块全部标记为 `core`，分布在 `apps/web/src/app/(workspace)/` 下：

| 路由 | 组件文件 | 功能 |
|------|---------|------|
| `/dashboard` | `workspace.tsx` (DashboardPanel) | 工作台 |
| `/diagnosis` | `workspace.tsx` (DiagnosisWorkspace) | IP 诊断 |
| `/trademark/check` | `workspace.tsx` (TrademarkCheckWorkspace) | 商标查重 |
| `/trademark/application` | `workspace.tsx` (ApplicationWorkspace) | 申请书生成 |
| `/trademark/submit` | `workspace.tsx` (SubmitGuideWorkspace) | 提交引导 |
| `/assets` | `workspace.tsx` (AssetLedgerPanel) | 资产台账 |
| `/reminders` | `workspace.tsx` (ReminderPanel) | 提醒中心 |
| `/monitoring` | `monitoring.tsx` (MonitoringWorkspace) | 侵权监控 |
| `/competitors` | `competitor.tsx` (CompetitorWorkspace) | 竞品追踪 |
| `/contracts` | `modules.tsx` (ContractWorkspace) | 合同审查 |
| `/patents` | `modules.tsx` (PatentWorkspace) | 专利/软著 |
| `/policies` | `modules.tsx` (PolicyWorkspace) | 行业政策 |
| `/due-diligence` | `modules.tsx` (DueDiligenceWorkspace) | 融资尽调 |

全局布局由 `apps/web/src/components/app-shell.tsx` 提供，包含侧边栏导航和工作流进度指示器。
