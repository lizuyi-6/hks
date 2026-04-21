# 配置指南

## 环境变量总表

通过 `.env` 文件或环境变量配置，模板见项目根目录 `.env.example`。

### Web 端配置

| 变量名 | 默认值 | 说明 |
|--------|-------|------|
| `WEB_PORT` | `3000` | Web 服务端口 |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | 应用公网 URL |
| `NEXT_PUBLIC_API_PROXY_BASE` | `/api/backend` | BFF 代理路径前缀 |
| `NEXT_PUBLIC_DEFAULT_DATA_MODE` | `real` | 默认数据模式 |
| `NEXT_PUBLIC_API_MODE` | `mock` | API 模式 |
| `NEXT_PRIVATE_API_BASE_URL` | `http://localhost:8000` | 后端 API 地址（服务端使用） |

### API 核心配置

| 变量名 | 默认值 | 说明 |
|--------|-------|------|
| `APP_ENV` | `development` | 运行环境（development/production） |
| `APP_SECRET_KEY` | `change-me` | JWT 签名密钥（**生产环境必须更改**） |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `120` | JWT Token 有效期（分钟） |

### 数据库配置

| 变量名 | 默认值 | 说明 |
|--------|-------|------|
| `DATABASE_URL` | `sqlite:///apps/api/test.db` | 数据库连接字符串 |

支持的数据库：
- **SQLite**（开发默认）：`sqlite:///apps/api/test.db`
- **PostgreSQL**：`postgresql+psycopg://postgres:postgres@localhost:5432/a1plus`
- **MySQL**：`mysql+pymysql://a1plus_user:a1plus_password@localhost:3306/a1plus`

### Redis 配置

| 变量名 | 默认值 | 说明 |
|--------|-------|------|
| `REDIS_URL` | `redis://localhost:6379/0` | Redis 连接地址 |

### SMTP 邮件配置

| 变量名 | 默认值 | 说明 |
|--------|-------|------|
| `SMTP_HOST` | （空） | SMTP 服务器地址 |
| `SMTP_PORT` | `587` | SMTP 端口 |
| `SMTP_USERNAME` | （空） | SMTP 用户名 |
| `SMTP_PASSWORD` | （空） | SMTP 密码 |
| `SMTP_FROM` | `noreply@a1plus.local` | 发件人地址 |
| `SMTP_USE_TLS` | `true` | 是否使用 TLS |

### LLM 配置

| 变量名 | 默认值 | 说明 |
|--------|-------|------|
| `LLM_PROVIDER` | （空） | LLM 提供商（如 `openai`） |
| `LLM_API_KEY` | （空） | LLM API Key |
| `LLM_MODEL` | （空） | 模型名称 |
| `LLM_BASE_URL` | （空） | LLM API 基础 URL |

### 外部 API 配置

| 变量名 | 默认值 | 说明 |
|--------|-------|------|
| `TIANAYANCHA_API_KEY` | （空） | 天眼查 API Key（企业查询） |
| `BING_SEARCH_API_KEY` | （空） | Bing 搜索 API Key |
| `BING_SEARCH_ENDPOINT` | `https://api.bing.microsoft.com/v7.0/search` | Bing 搜索端点 |

### Worker 配置

| 变量名 | 默认值 | 说明 |
|--------|-------|------|
| `WORKER_POLL_INTERVAL` | `5` | Worker 轮询间隔（秒） |

### 文件路径配置

| 变量名 | 默认值 | 说明 |
|--------|-------|------|
| `GENERATED_DIR` | `apps/api/.generated` | 生成文档输出目录 |
| `KNOWLEDGE_BASE_DIR` | `knowledge-base/` | 知识库根目录 |

---

## 特性开关

所有特性开关默认 `false`，在 `.env` 中设置 `true` 启用。

| 变量名 | 控制模块 | 说明 |
|--------|---------|------|
| `FEATURE_MONITORING_PUBLIC_SEARCH` | 侵权监控 | 公开搜索监控渠道 |
| `FEATURE_MONITORING_AUTHORIZED_API` | 侵权监控 | 授权 API 监控渠道 |
| `FEATURE_MONITORING_AUTHORIZED_SCRAPE` | 侵权监控 | 授权网页抓取渠道 |
| `FEATURE_COMPETITORS` | 竞争对手追踪 | 竞品 IP 动态追踪 |
| `FEATURE_CONTRACT_REVIEW` | 合同审查 | AI 辅助合同 IP 条款审查 |
| `FEATURE_PATENT_ASSIST` | 专利/软著辅助 | 评估技术方案 |
| `FEATURE_POLICY_DIGEST` | 行业政策摘要 | 行业知识产权政策整理 |
| `FEATURE_DUE_DILIGENCE` | 融资尽调 | 目标公司 IP 尽调 |

5 个核心模块（工作台、IP 诊断、商标工作流、资产台账、提醒中心）无特性开关，始终可用。

---

## Provider 模式

每个 Provider 有 `real` 和 `mock` 两种模式。设置为 `mock` 可在不接入真实 API 的情况下运行系统。

| 变量名 | Real 适配器 | 用途 |
|--------|------------|------|
| `PROVIDER_TRADEMARK_SEARCH_MODE` | `cnipa-snapshot` | 商标查重（基于本地快照） |
| `PROVIDER_ENTERPRISE_LOOKUP_MODE` | `enterprise-snapshot` | 企业信息查询 |
| `PROVIDER_PUBLIC_WEB_SEARCH_MODE` | `public-search-snapshot` | 公开网页搜索 |
| `PROVIDER_KNOWLEDGE_BASE_MODE` | `official-kb-snapshot` | 知识库检索 |
| `PROVIDER_LLM_MODE` | `rules-engine` / 真实 LLM | AI 分析引擎 |
| `PROVIDER_DOCUMENT_RENDER_MODE` | `docx-reportlab` | 文档生成（python-docx + ReportLab） |
| `PROVIDER_NOTIFICATION_MODE` | `smtp` | 邮件通知 |
| `PROVIDER_MONITORING_MODE` | `public-search-placeholder` | 侵权监控 |
| `PROVIDER_SUBMISSION_GUIDE_MODE` | `cnipa-guide` | CNIPA 提交引导 |

### Mock 模式使用场景

- **本地开发**：无需配置真实 API Key 即可运行全流程
- **自动化测试**：使用确定性返回数据
- **演示**：展示完整功能流程

```bash
# 全部使用 mock 模式
PROVIDER_TRADEMARK_SEARCH_MODE=mock
PROVIDER_LLM_MODE=mock
PROVIDER_NOTIFICATION_MODE=mock
# ...
```

### 切换到 Real 模式注意事项

- LLM 模式需要配置 `LLM_PROVIDER`、`LLM_API_KEY`、`LLM_MODEL`
- 通知模式需要配置 SMTP 参数
- 商标查重 Real 模式使用本地快照数据，无需外部 API
