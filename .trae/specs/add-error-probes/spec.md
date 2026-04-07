# 错误探针与诊断增强 Spec

## Why
当前程序发生错误时，很难定位错误的来源和具体原因。需要在前端关键节点增加错误探针，返回结构化的错误信息，便于快速定位和修复问题。

## What Changes
- 前端 API 请求层增加统一错误探针
- 后端 API 增加错误上下文信息
- 前后端统一错误响应格式
- Dashboard 错误展示增强

## Impact
- Affected specs: build-workflow-pipeline
- Affected code: apps/web/src/components/workspace.tsx, apps/api/app/api/routes/*.py

## ADDED Requirements

### Requirement: 前端错误探针
前端 `request` 函数 SHALL 返回结构化错误信息，包含：
- `errorSource`: 错误来源模块
- `errorContext`: 发生错误时的上下文数据
- `timestamp`: 错误发生时间
- `stackTrace`: 错误堆栈（仅开发环境）

#### Scenario: API 请求失败
- **WHEN** 前端发起 API 请求收到错误响应
- **THEN** 显示结构化错误信息，包含错误来源和上下文

### Requirement: 后端错误上下文
后端所有 API 端点 SHALL 在发生错误时返回：
- `errorType`: 错误类型（ValidationError、NotFoundError、AuthError 等）
- `errorLocation`: 错误发生的位置
- `requestId`: 请求唯一标识
- `details`: 错误详情

#### Scenario: 后端验证失败
- **WHEN** 后端收到无效请求参数
- **THEN** 返回 422 状态码，包含字段级错误信息

### Requirement: 浏览器控制台增强日志
浏览器控制台 SHALL 输出可读的错误日志，包含：
- 模块名称
- 函数名称
- 关键变量值（脱敏后）
- 错误链路追踪

## MODIFIED Requirements

### Requirement: request 函数错误处理
**Current**: `throw new Error(await response.text())`
**Modified**: 解析后端错误响应，提取 errorType、errorLocation 等字段，生成结构化错误对象。

### Requirement: DashboardPanel 错误展示
**Current**: 直接显示 `error` 字符串
**Modified**: 解析错误对象，分类显示（网络错误、业务错误、系统错误），并提供"查看详情"展开功能。

## REMOVED Requirements
无

## 技术方案

### 前端修改
```
// apps/web/src/lib/request.ts (新建或修改)
type ProbeError = {
  errorType: string;
  errorLocation: string;
  message: string;
  requestId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
  stack?: string;
};

class ApplicationError extends Error {
  constructor(
    message: string,
    public errorType: string,
    public errorLocation: string,
    public requestId?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
```

### 后端修改
```python
# apps/api/app/core/error_handler.py (新建)
from fastapi import Request
import uuid
import traceback
from typing import Any

class APIError(Exception):
    def __init__(self, error_type: str, message: str, details: dict = None):
        self.error_type = error_type
        self.message = message
        self.details = details or {}
        self.request_id = str(uuid.uuid4())[:8]

    def to_dict(self) -> dict:
        return {
            "errorType": self.error_type,
            "message": self.message,
            "details": self.details,
            "requestId": self.request_id,
            "timestamp": datetime.utcnow().isoformat(),
        }
```

### 错误类型枚举
| errorType | 说明 |
|-----------|------|
| ValidationError | 请求参数验证失败 |
| NotFoundError | 资源不存在 |
| AuthError | 认证/授权失败 |
| BusinessError | 业务逻辑错误 |
| SystemError | 系统内部错误 |
| NetworkError | 网络通信错误 |
| TimeoutError | 请求超时 |
| UnknownError | 未知错误 |
