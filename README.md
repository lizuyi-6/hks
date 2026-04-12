# A1+ IP Coworker

面向中国小微创业者和 OPC 的 AI IP 主动协作产品脚手架。

## Monorepo 结构

- `apps/web`: Next.js Web 客户端与 BFF。
- `apps/api`: FastAPI API、领域服务、端口适配层。
- `apps/worker`: 异步任务 worker、重试与提醒处理。
- `packages/domain`: 前端共享领域类型与流程定义。
- `packages/config`: 特性开关、provider 模式与导航配置。
- `packages/ui`: 前端共享 UI 原子组件。
- `knowledge-base`: P0/P1 知识库原始内容、元数据 schema、静态快照。

## 快速开始

### 1. Web

```bash
npm install
npm run dev:web
```

### 2. API / Worker

```bash
python -m pip install -r apps/api/requirements.txt
uvicorn apps.api.main:app --reload --port 8000
python -m apps.worker.main
```

### 3. Docker Compose

```bash
docker compose up --build
```

## 产品边界

- 只做文件准备、分析与提交引导。
- 不代替用户向官方系统提交申报。
- 所有 AI 输出均附带“仅供参考，以官方为准”提示。
- `real` 与 `mock` 数据源显式隔离，默认不聚合。

## 文档

所有文档位于 [`docs/`](docs/README.md) 目录。

- **产品介绍**：[产品介绍](docs/A1+_IP_Coworker_产品介绍.md) — 面向非技术人员，了解产品是什么、能做什么、怎么用
- **用户手册**：[快速入门](docs/user-manual/getting-started.md) | [核心流程](docs/user-manual/workflow-overview.md) | [常见问题](docs/user-manual/faq.md) | [法律边界说明](docs/user-manual/legal-notice.md)
- **技术文档**：[架构概览](docs/technical/architecture.md) | [API 参考](docs/technical/api-reference.md) | [配置指南](docs/technical/configuration.md) | [部署指南](docs/technical/deployment.md) | [开发指南](docs/technical/development.md) | [扩展指南](docs/technical/extension-guide.md)

