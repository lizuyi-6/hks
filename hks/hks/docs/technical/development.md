# 开发指南

## 本地环境搭建

### 前置条件

- Node.js 24+
- Python 3.12+
- Git

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/lizuyi-6/hks.git
cd hks

# 安装前端依赖
npm install

# 安装后端依赖
pip install -r apps/api/requirements.txt

# 复制环境配置（使用 SQLite 默认值即可开始开发）
cp .env.example .env
```

### 启动开发服务

```bash
# 终端 1：启动后端 API
uvicorn apps.api.main:app --reload --port 8000

# 终端 2：启动 Worker（可选，处理异步任务）
python -m apps.worker.main

# 终端 3：启动前端
npm run dev:web
```

访问 http://localhost:3000 即可使用。

### 全 Mock 模式

无需配置任何外部 API Key，所有 Provider 使用 mock 模式：

```bash
# 在 .env 中设置
PROVIDER_TRADEMARK_SEARCH_MODE=mock
PROVIDER_LLM_MODE=mock
PROVIDER_NOTIFICATION_MODE=mock
PROVIDER_DOCUMENT_RENDER_MODE=mock
PROVIDER_MONITORING_MODE=mock
# ...
```

---

## 项目约定

### Python 后端

- **Pydantic v2**：使用 `ApiModel` 基类，自动应用 camelCase 别名
  - Python 代码使用 snake_case
  - JSON 序列化输出 camelCase
- **类型注解**：使用 `from __future__ import annotations` 延迟解析
- **响应包装**：所有 Provider 响应必须包装在 `DataSourceEnvelope[T]` 中
- **错误处理**：使用 `error_handler.py` 中的错误类（`BusinessError`, `SystemError` 等）

### TypeScript 前端

- **Next.js App Router**：页面位于 `src/app/` 下
- **路径别名**：`@/` → `src/`
- **中文文本**：所有用户可见文本使用简体中文
- **法律声明**：AI 生成内容必须显示 `legalBoundaryNotice`

### 通用约定

- 所有用户可见输出附带免责声明
- 产品**不得**代替用户向官方系统提交申报
- 数据模式（real/mock）始终明确标注

---

## 测试

### 前端测试（Vitest）

```bash
# 运行全部前端测试
npm run test:web

# 运行单个测试文件
npx vitest run src/path/to/test.ts

# 监听模式
npx vitest src/path/to/test.ts
```

前端测试位于 `apps/web/src/` 下与源文件同级或 `__tests__/` 目录中。

### 后端测试（pytest）

```bash
# 运行全部后端测试
python -m pytest apps/api/tests apps/worker/tests

# 运行单个测试文件
python -m pytest apps/api/tests/test_api_workflow.py

# 运行指定测试
python -m pytest apps/api/tests/test_api_workflow.py -k "test_name"

# 显示详细输出
python -m pytest apps/api/tests -v
```

### 运行全部测试

```bash
npm run test
```

### CI

GitHub Actions 在每次 push/PR 时自动运行（`.github/workflows/ci.yml`）：
- Web 作业：Node 24，lint + test
- API 作业：Python 3.12，pytest

---

## 知识库管理

### 目录结构

```
knowledge-base/
├── metadata/
│   ├── catalog.json     # 文档目录（标题、优先级、路径、主题）
│   └── schema.json      # A1PlusKnowledgeDocument JSON Schema
├── snapshots/
│   └── trademark_snapshot.json  # 商标数据快照（查重用）
└── sources/
    ├── p0/  # 优先级 0：商标分类指南、商标法、申请书规范
    └── p1/  # 优先级 1：专利模板、软著指南
```

### 添加新文档

1. 将 Markdown 文件放入 `sources/p0/` 或 `sources/p1/`
2. 在 `metadata/catalog.json` 中添加条目，遵循 `schema.json` 格式
3. 运行索引脚本更新目录：`python -m apps.api.scripts.index_knowledge`

### catalog.json 条目格式

```json
{
  "title": "商标分类指南（45类）",
  "kind": "markdown",
  "priority": "P0",
  "path": "sources/p0/商标分类指南（45类）.md",
  "topics": ["trademark", "classification"],
  "source_url": null
}
```

---

## 调试技巧

### 查看 Provider 状态

访问 `GET /system/health` 查看所有 Provider 的可用性和模式。

### 切换 Provider 模式

在 `.env` 中修改 `PROVIDER_*_MODE` 为 `mock` 即可离线开发，无需真实 API。

### 查看浏览器 localStorage

前端将诊断结果、查重结果、申请书数据等持久化在 localStorage 中，可在 DevTools → Application → Local Storage 中查看。

### Worker 日志

Worker 运行时直接在终端输出日志，包括任务处理结果和错误信息。

### 错误排查

前端错误显示组件（`ErrorDisplay`）提供详细的错误信息：
- 错误类型（BusinessError, SystemError 等）
- 错误位置
- 请求 ID
- 可展开查看详情

每个 API 错误响应包含 `requestId`，可用于追踪具体请求。
