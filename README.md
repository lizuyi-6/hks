<div align="center">

# A1+ IP Coworker

**面向中国小微创业者的 AI 知识产权协作平台**

为创业者与服务商（OPC）准备文件、分析 IP 局势、引导提交 —— 不替你提交，所有 AI 输出都附"仅供参考，以官方为准"。

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python%203.11-009688)](https://fastapi.tiangolo.com/)
[![Tailwind](https://img.shields.io/badge/Tailwind-3-38bdf8)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/license-Private-lightgrey)](#)

[快速开始](#-快速开始) · [架构](#-架构) · [七支柱](#-竞赛叙事ai--知识产权法律服务-7-支柱) · [文档](#-文档) · [产品边界](#-产品边界)

</div>

---

## ✨ 项目概览

A1+ IP Coworker 是一套围绕"诊断 → 匹配 → 推送 → 获客 → 咨询 → 合规 → 服务化"完整闭环构建的 AI IP 协作产品。它由三个进程组成：

- **Web (`apps/web`)** — Next.js 15 + React 19，自带 BFF 代理层
- **API (`apps/api`)** — FastAPI + 六边形架构（Ports & Adapters）
- **Worker (`apps/worker`)** — 轮询数据库的异步任务执行器

LLM 默认走豆包 Doubao-Seed-2.0-pro（火山方舟），所有响应统一封装在 `DataSourceEnvelope[T]`（带 `traceId`、`sourceRefs`、`disclaimer`），错误统一为 `APIError` 类型层级。

---

## 🏆 竞赛叙事：AI + 知识产权法律服务 7 支柱

每个支柱都带"子能力（自助工具）"作为画像输入器或服务触发器，工具产出会回灌到所属支柱：

| # | 支柱 | 定位 | 支柱入口 | 子能力入口 | 核心后端 |
|---|---|---|---|---|---|
| 1 | 🧭 需求画像 | 一句话说需求 → AI 抽取意图/紧迫度/预算/地域 | `/my-profile` | `/diagnosis` | `services/profile_engine.py` |
| 2 | 🎯 智能匹配 | 标签召回 + 向量召回双路 RRF 合并，可解释排序 | `/match` | — | `services/matching_engine.py` · `adapters/real/matching*.py` |
| 3 | 📣 场景化推送 | 12+ 规则的场景引擎：政策雷达 / 监控告警 / 续展提醒 / 红旗预警 | `/push-center` | `/monitoring` | `services/automation_engine.py` |
| 4 | 🎣 精准获客 | 律所工作台 + 5 阶段获客漏斗 + 组内分配 | `/provider` | — | `services/provider_crm.py` |
| 5 | 💬 智能咨询 | AI 多工具 Agent 首诊 + 置信度评估 + 一键转人工 | `/consult` | `/litigation`、`/due-diligence` | `services/chat_service.py` · `order_service.py` |
| 6 | 🛡 合规 SaaS | 企业体检 / 订阅分层 / 政策订阅 + 合同审查条款扫描 | `/enterprise` | `/contracts`、`/policies` | `services/compliance_engine.py` |
| 7 | 📄 服务数字化 | 里程碑时间轴 + 托管支付 + 电子签 + 商标办理全流程 | `/orders` | `/trademark/check`、`/assets` | `services/order_service.py` · `adapters/real/escrow.py` |

> 前端侧栏会把"子能力入口"以缩进标签呈现在所属支柱之下，每个工具页顶部还有"归属支柱"徽章。
>
> 路演入口：`http://localhost:3000/pitch`

---

## 🚀 快速开始

### 前置依赖

- **Node.js** ≥ 20
- **Python** ≥ 3.11
- **Docker**（可选，推荐用于一键起完整栈）

### 一键启动（推荐）

```bash
cp .env.example .env
docker compose up --build
```

服务就绪后访问：
- Web: <http://localhost:3000>
- API: <http://localhost:8000/docs>

### 本地开发模式

```bash
# 1. 安装依赖
npm install
python -m pip install -r apps/api/requirements.txt

# 2. 复制默认环境（默认 SQLite，无需数据库）
cp .env.example .env

# 3. 分别启动三个进程（开三个终端）
npm run dev:web                                   # Web → http://localhost:3000
uvicorn apps.api.main:app --reload --port 8000    # API → http://localhost:8000
python -m apps.worker.main                        # Worker（异步任务）
```

### 测试与质量

```bash
npm run lint:web         # ESLint
npm run test:web         # Vitest（前端）
npm run test:api         # pytest（API + Worker）
npm run test             # 全量
```

跑单个测试：

```bash
# 前端
cd apps/web && npx vitest run src/path/to/test.ts

# 后端
python -m pytest apps/api/tests/path/test_file.py -k "test_name"
```

---

## 🧱 架构

### Monorepo 结构

```
apps/
  web/        Next.js 15 + React 19 + Tailwind 3，含 BFF 代理层
  api/        FastAPI + SQLAlchemy + Pydantic v2，六边形架构
  worker/     异步任务轮询器，10 种 Job 类型，三次重试 → 死信队列
packages/
  domain/     共享领域类型、模块清单、核心工作流定义
  config/     特性开关、provider 模式、`legalBoundaryNotice`
  ui/         共享原子组件（SectionCard / SourceTag / StatusBadge ...）
knowledge-base/
  sources/p0/ P0 知识（商标法、分类指南、申请规则）
  sources/p1/ P1 知识（专利模板、软著指南）
  metadata/   schema 与目录
docs/         产品 / 用户 / 技术三类文档
```

### 后端：六边形（Ports & Adapters）

```
app/
  ports/interfaces.py        端口接口（TrademarkSearchPort、LLMPort ...）
  adapters/real/             生产适配器，每个端口一个文件
  adapters/registry.py       ProviderRegistry 把端口接到真实适配器
  api/routes/                27 个路由模块（auth、diagnosis、jobs、stream ...）
  services/                  领域服务（profile_engine、workflow_engine ...）
  core/streaming.py          SSE 流式响应封装
  core/error_handler.py      APIError 类型层级 → 统一 JSON 错误响应
  db/models.py               UUID 主键 + JSON 列的 SQLAlchemy 模型
```

**关键约定：**

- **无 Mock 模式**：前端 BFF mock 分支与后端 mock 适配器都已移除，所有请求落到真实 FastAPI
- **统一响应封装**：所有 API 返回 `DataSourceEnvelope[T]`（`mode` / `traceId` / `sourceRefs` / `disclaimer`）
- **camelCase 序列化**：Pydantic 模型用 `to_camel` alias generator，Python snake_case 自动转 JSON camelCase
- **错误体系**：后端抛 `ValidationError` / `NotFoundError` / `AuthError` / `BusinessError` / `SystemError`，前端用 `lib/errors.ts` 解析为 `ApplicationError`
- **LLM 失败 = 用户可见错误**：豆包不可达或返回不合法时直接抛 `SystemError`（HTTP 500），SSE 端会发 `error` 事件后结束
- **搜索三级链**：监控适配器依次尝试 Bing API → DuckDuckGo（自定义 SSL 上下文）→ 静态知识库规则

### 前端：BFF + SSE

- `src/app/api/backend/[...path]/route.ts` — 把 `/api/backend/*` 透传到 FastAPI
- `src/app/api/auth/*` — 登录成功后写入 `httpOnly` 的 `a1plus-session` cookie
- `src/lib/sse.ts` — `fetchSSE<T>()` 消费后端流式端点（诊断、合同审查、专利评估、政策摘要、尽调等）
- 路由分组：`(auth)` 登录注册、`(workspace)` 已认证页面
- 路径别名：`@/` → `src/`

### Worker：10 种 Job 类型

```
diagnosis.report · trademark.application · monitoring.scan
competitor.track · competitor.compare · contract.review
patent.assess · policy.digest · due-diligence.investigate · reminder.dispatch
```

生命周期：`queued → processing → completed | failed → retry(≤3) → dead_letter`，`enqueue_job()` 用 payload 的 SHA-256 作为幂等键。

---

## ⚙️ 关键环境变量

完整列表见 `.env.example` 与 [`docs/technical/configuration.md`](docs/technical/configuration.md)。

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | DB 连接（默认 SQLite，Docker 用 PostgreSQL） |
| `REDIS_URL` | Redis 连接 |
| `APP_SECRET_KEY` | JWT 签名密钥 |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT 过期时间（默认 120） |
| `NEXT_PRIVATE_API_BASE_URL` | BFF → FastAPI 的服务端 URL |
| `NEXT_PUBLIC_API_PROXY_BASE` | BFF 代理路径前缀（默认 `/api/backend`） |
| `WORKER_POLL_INTERVAL` | Worker 轮询间隔秒数（默认 5） |
| `PROFILE_MATCHING_MODE` | `rules`（默认）或 `embedding`，影响匹配引擎重排策略 |
| `FEATURE_*` | 模块特性开关，关闭后返回 `PlaceholderResponse` |
| `BING_SEARCH_API_KEY` | Bing 网页搜索 API（监控用） |
| `TIANAYANCHA_API_KEY` | 天眼查企业查询 API |
| `SMTP_*` | 邮件通知配置 |

> ⚠️ 豆包 LLM 凭据（`DOUBAO_API_KEY` / `DOUBAO_BASE_URL` / `DOUBAO_MODEL`）已硬编码在 `apps/api/app/adapters/real/llm.py`，不再从环境变量读取。

---

## 📦 Docker

`docker-compose.yml` 启动 5 个服务：PostgreSQL、Redis、API、Worker、Web。

- API 与 Worker 共用 `Dockerfile.api`，Worker 只是改了入口（`python -m apps.worker.main`）
- Web 使用 Next.js `output: "standalone"`
- 镜像默认走 `hub.rat.dev` 国内镜像源，可通过 `--build-arg` 覆盖

---

## 🚦 产品边界

> **A1+ 是协作工具，不是申报代理。**

- ✅ 准备文件、分析局势、引导提交流程
- ❌ **不**代用户向 CNIPA / 任何官方系统提交申报
- 📌 所有 AI 输出附 `legalBoundaryNotice`：**仅供参考，以官方为准**
- 🔒 用户对最终提交内容承担全部责任

---

## 📚 文档

完整文档位于 [`docs/`](docs/README.md)：

| 类别 | 入口 |
|---|---|
| **产品介绍** | [产品介绍](docs/A1+_IP_Coworker_产品介绍.md) |
| **用户手册** | [快速入门](docs/user-manual/getting-started.md) · [核心流程](docs/user-manual/workflow-overview.md) · [常见问题](docs/user-manual/faq.md) · [法律边界](docs/user-manual/legal-notice.md) |
| **技术文档** | [架构概览](docs/technical/architecture.md) · [API 参考](docs/technical/api-reference.md) · [配置](docs/technical/configuration.md) · [部署](docs/technical/deployment.md) · [开发](docs/technical/development.md) · [扩展](docs/technical/extension-guide.md) |

---

## 🤝 贡献

CI 流水线见 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)：lint+build-web → test-api → test-worker → docker-build；推送到 `develop` 部署 staging，推送到 `main` 部署 production。

提 PR 前请先在本地跑通 `npm run test`。

---

<div align="center">
<sub>Built with FastAPI · Next.js · Doubao · ❤️ for Chinese SMB founders</sub>
</div>
