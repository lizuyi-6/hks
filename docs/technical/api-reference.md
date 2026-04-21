# API 参考手册

## 概述

- 基础 URL：`http://localhost:8000`
- 认证方式：JWT Bearer Token（通过 BFF cookie 自动注入）
- 所有响应使用 camelCase JSON 序列化
- 需认证的端点需在 Header 中携带 `Authorization: Bearer <token>`

---

## 1. 认证接口 `/auth`

### POST /auth/register

注册新用户。

**请求体：**
```json
{
  "email": "user@example.com",
  "fullName": "张三",
  "password": "your-password"
}
```

**成功响应 `200`：**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "bearer"
}
```

**错误响应 `400`：** 邮箱已注册

---

### POST /auth/login

用户登录。

**请求体：**
```json
{
  "email": "user@example.com",
  "password": "your-password"
}
```

**成功响应 `200`：**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "tokenType": "bearer"
}
```

**错误响应 `401`：** 凭证无效

---

## 2. IP 诊断接口 `/diagnosis`

### POST /diagnosis/jobs

创建 IP 诊断任务（需认证）。

**请求体：**
```json
{
  "businessName": "我的公司",
  "businessDescription": "跨境电商 SaaS 平台，主要面向欧美市场...",
  "industry": "跨境电商",
  "stage": "初创"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| businessName | string | 否 | 公司/项目名 |
| businessDescription | string | 是 | 业务描述 |
| industry | string | 否 | 所属行业 |
| stage | string | 否 | 企业阶段 |

**成功响应 `200`：** JobResponse
```json
{
  "id": "uuid-of-job",
  "jobType": "diagnosis.report",
  "status": "queued",
  "idempotencyKey": "diagnosis.report:sha256hash",
  "errorMessage": null,
  "result": null
}
```

通过 `GET /jobs/{id}` 轮询获取结果。

**诊断结果结构：**
```json
{
  "summary": "您的业务涉及跨境电商 SaaS...",
  "priorityAssets": ["品牌商标", "软件著作权"],
  "risks": ["未注册商标可能被抢注"],
  "nextActions": ["立即注册核心商标类别 35 和 42"],
  "recommendedTrack": "trademark",
  "recommendedTrademarkCategories": ["35", "42"]
}
```

---

## 3. 商标接口 `/trademarks`

### POST /trademarks/check

商标查重（需认证，实时）。

**请求体：**
```json
{
  "trademarkName": "TestBrand",
  "businessDescription": "跨境电商平台",
  "applicantName": "我的公司",
  "applicantType": "company",
  "categories": ["35", "42"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| trademarkName | string | 是 | 商标名称 |
| businessDescription | string | 是 | 业务描述 |
| applicantName | string | 是 | 申请人名称 |
| applicantType | `"individual"` \| `"company"` | 是 | 申请人类型 |
| categories | string[] | 是 | 商标类别 |

**成功响应 `200`：** `DataSourceEnvelope<TrademarkCheckResult>`
```json
{
  "mode": "real",
  "provider": "cnipa-snapshot",
  "traceId": "...",
  "retrievedAt": "...",
  "sourceRefs": [],
  "disclaimer": "仅供参考，以官方为准。...",
  "normalizedPayload": {
    "riskLevel": "green",
    "summary": "未发现直接冲突",
    "recommendation": "可进入申请书生成",
    "suggestedCategories": ["35", "42"],
    "findings": [],
    "alternatives": ["TestBrandX", "TestBrandY"]
  }
}
```

**riskLevel 值：** `green`（可用）、`yellow`（近似）、`red`（冲突）

---

### POST /trademarks/application/jobs

创建商标申请书生成任务（需认证）。

**请求体：**
```json
{
  "trademarkName": "TestBrand",
  "applicantName": "我的公司",
  "applicantType": "company",
  "businessDescription": "跨境电商平台",
  "categories": ["35", "42"],
  "riskLevel": "green"
}
```

**成功响应 `200`：** JobResponse（通过轮询获取结果）

**申请书生成结果结构：**
```json
{
  "draftId": "document-record-id",
  "trademarkName": "TestBrand",
  "applicantName": "我的公司",
  "categories": ["35", "42"],
  "riskLevel": "green",
  "sourceMode": "real",
  "provider": "docx-reportlab",
  "documentLabels": ["Application Form", "Category Advice", "Risk Notes", "Submission Guide"],
  "downloadEndpoints": {
    "docx": "/trademarks/documents/{draftId}.docx",
    "pdf": "/trademarks/documents/{draftId}.pdf"
  }
}
```

---

### GET /trademarks/drafts/{draftId}

获取申请书 + 提交引导组合数据（需认证）。

**成功响应 `200`：** 包含 draft 和 guide 的 DataSourceEnvelope

---

### GET /trademarks/documents/{draftId}.{extension}

下载生成的文档（需认证）。

| 参数 | 值 |
|------|---|
| extension | `docx` 或 `pdf` |

**成功响应：** 二进制文件下载（Content-Type: application/octet-stream）

---

## 4. IP 资产接口 `/assets`

### GET /assets

列出所有 IP 资产（需认证，按创建时间倒序）。

**成功响应 `200`：**
```json
[
  {
    "id": "uuid",
    "name": "TestBrand",
    "type": "trademark",
    "registrationNumber": "PENDING-XXXXXXXX",
    "status": "pending",
    "expiresAt": "2036-04-09T00:00:00Z",
    "nextMilestone": "Awaiting official review",
    "sourceMode": "real"
  }
]
```

---

### POST /assets

手动创建 IP 资产（需认证），同时自动创建 90/60/30/7 天提醒。

**请求体：**
```json
{
  "name": "我的商标",
  "type": "trademark",
  "registrationNumber": "12345678",
  "expiresAt": "2030-12-31T00:00:00Z"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 资产名称 |
| type | `"trademark"` \| `"patent"` \| `"copyright"` \| `"soft-copyright"` | 是 | 资产类型 |
| registrationNumber | string | 否 | 注册号 |
| expiresAt | string (ISO 8601) | 否 | 到期日期 |

---

### DELETE /assets/{assetId}

删除 IP 资产（需认证）。

**成功响应 `200`：** `{"ok": true}`

---

## 5. 提醒接口 `/reminders`

### GET /reminders

列出所有提醒任务（需认证，按到期时间排序）。

**成功响应 `200`：**
```json
[
  {
    "id": "uuid",
    "assetId": "asset-uuid",
    "channel": "email",
    "dueAt": "2036-01-09T00:00:00Z",
    "status": "queued"
  }
]
```

---

## 6. 任务管理接口 `/jobs`

### GET /jobs/{jobId}

获取任务状态和结果（需认证）。

**成功响应 `200`：**
```json
{
  "id": "uuid",
  "jobType": "diagnosis.report",
  "status": "completed",
  "idempotencyKey": "...",
  "errorMessage": null,
  "result": { ... }
}
```

**status 值：** `queued` | `processing` | `completed` | `failed` | `dead_letter`

---

### POST /jobs/{identifier}/rerun

重新执行失败或已完成的任务（需认证）。

identifier 可以是 Job ID 或 Reminder Task ID。

**成功响应 `200`：** JobResponse

---

## 7. 工作流接口 `/workflows`

### POST /workflows

创建工作流实例（需认证）。

**请求体：**
```json
{
  "workflow_type": "trademark-registration",
  "initial_context": {
    "businessDescription": "跨境电商平台"
  }
}
```

支持的工作流类型：`trademark-registration`（商标注册全流程）

**成功响应 `200`：**
```json
{
  "id": "uuid",
  "userId": "user-uuid",
  "workflowType": "trademark-registration",
  "status": "running",
  "context": { "businessDescription": "跨境电商平台" },
  "currentStepIndex": 0,
  "createdAt": "...",
  "updatedAt": "...",
  "steps": [
    {
      "id": "step-uuid",
      "stepType": "diagnosis",
      "stepIndex": 0,
      "status": "running",
      "jobId": "job-uuid",
      "inputData": {},
      "outputData": {},
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

### GET /workflows

列出当前用户的工作流（需认证）。

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| status | string | 否 | 过滤状态（`pending`/`running`/`completed`/`failed`） |

---

### GET /workflows/{workflowId}

获取工作流详情（需认证）。

---

### POST /workflows/{workflowId}/advance

推进工作流到下一步（需认证）。

**请求体：**
```json
{
  "step_output": {
    "diagnosisResult": { ... }
  }
}
```

---

## 8. 建议接口 `/suggestions`

### GET /suggestions

获取个性化操作建议（需认证）。

根据用户当前状态（进行中的工作流、已完成的诊断、即将到期的资产）生成建议列表。

**成功响应 `200`：**
```json
[
  {
    "id": "start-diagnosis",
    "title": "开始 IP 诊断",
    "description": "您还没有进行过 IP 诊断",
    "action": {
      "label": "开始诊断",
      "href": "/diagnosis"
    },
    "priority": 30
  }
]
```

---

## 9. 模块结果接口 `/module-results`

### GET /module-results

列出模块执行结果（需认证）。

**查询参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| moduleType | string | 否 | 过滤模块类型 |

**成功响应 `200`：**
```json
[
  {
    "id": "uuid",
    "userId": "user-uuid",
    "workflowId": null,
    "moduleType": "monitoring",
    "jobId": "job-uuid",
    "resultData": { ... },
    "createdAt": "..."
  }
]
```

---

## 10. 模块操作接口

以下端点位于 `apps/api/app/api/routes/placeholders.py`，均需认证。

### 监控模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/monitoring/status` | 获取模块状态 |
| POST | `/monitoring/scan` | 执行侵权扫描 |

**扫描请求：** `{"query": "商标名称或关键词"}`

---

### 竞品模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/competitors/status` | 获取模块状态 |
| POST | `/competitors/track` | 追踪竞争对手 |
| POST | `/competitors/compare` | 竞品对比 |

**追踪请求：** `{"company_name": "竞品公司名"}`

---

### 合同审查模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/contracts/status` | 获取模块状态 |
| POST | `/contracts/review` | 审查合同文本 |

**审查请求：** `{"contract_text": "合同全文..."}`

---

### 专利/软著模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/patents/status` | 获取模块状态 |
| POST | `/patents/assess` | 评估技术方案 |

**评估请求：** `{"description": "技术方案描述..."}`

---

### 行业政策模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/policies/status` | 获取模块状态 |
| POST | `/policies/digest` | 获取行业政策摘要 |

**摘要请求：** `{"industry": "跨境电商"}`

---

### 融资尽调模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/due-diligence/status` | 获取模块状态 |
| POST | `/due-diligence/investigate` | 执行 IP 尽调 |

**尽调请求：** `{"company_name": "目标公司名"}`

---

## 11. 分析接口 `/analytics`

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/analytics/events` | 否 | 接收前端埋点事件 |
| GET | `/analytics/events` | 否 | 查询事件列表（支持 page, event_type, limit, offset 参数） |
| GET | `/analytics/stats` | 否 | 获取事件统计 |
| DELETE | `/analytics/events` | 否 | 清除所有事件 |

---

## 12. 系统接口 `/system`

### GET /system/health

检查所有 Provider 的健康状态（无需认证）。

**成功响应 `200`：**
```json
{
  "providers": [
    {
      "port": "trademarkSearch",
      "mode": "real",
      "provider": "cnipa-snapshot",
      "available": true,
      "reason": null
    }
  ]
}
```

---

## 通用错误响应格式

```json
{
  "errorType": "BusinessError",
  "message": "错误描述",
  "errorLocation": "/path/to/endpoint",
  "requestId": "abc12345",
  "timestamp": "2026-04-09T12:00:00",
  "details": {}
}
```

| errorType | HTTP 状态码 |
|-----------|------------|
| ValidationError | 422 |
| NotFoundError | 404 |
| AuthError | 401 |
| BusinessError | 400 |
| SystemError | 500 |
| NetworkError | 502 |
| TimeoutError | 504 |
| UnknownError | 500 |
