# 扩展指南

## 添加新模块

以一个完整的模块为例，展示从类型定义到前端页面的全流程。

### Step 1：定义领域类型

在 `packages/domain/src/index.ts` 中添加类型定义：

```typescript
export type MyModuleResult = {
  id: string;
  // ... 模块结果字段
};
```

在 `modules` 数组中添加模块定义：

```typescript
{
  key: "my-module",
  title: "我的模块",
  description: "模块功能描述",
  href: "/my-module",
  status: "core",  // 或 "skeleton"
}
```

### Step 2：定义后端 Port 接口

在 `apps/api/app/ports/interfaces.py` 中添加 Port：

```python
class MyModulePort(BasePortAdapter, ABC):
    @abstractmethod
    def execute(self, input_data: str, trace_id: str) -> DataSourceEnvelope[dict[str, Any]]:
        raise NotImplementedError
```

### Step 3：创建 Real 和 Mock 适配器

**Real 适配器** `apps/api/app/adapters/real/my_module.py`：

```python
from apps.api.app.ports.interfaces import MyModulePort
from apps.api.app.schemas.common import DataSourceEnvelope

class RealMyModuleAdapter(MyModulePort):
    port_name = "myModule"
    provider_name = "my-module-real"
    mode = "real"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def execute(self, input_data: str, trace_id: str) -> DataSourceEnvelope[dict]:
        # 调用真实 API 或执行真实逻辑
        return DataSourceEnvelope(...)
```

**Mock 适配器** 在 `apps/api/app/adapters/mock/providers.py` 中添加：

```python
class MockMyModuleAdapter(MyModulePort):
    port_name = "myModule"
    provider_name = "my-module-mock"
    mode = "mock"

    def availability(self) -> tuple[bool, str | None]:
        return True, None

    def execute(self, input_data: str, trace_id: str) -> DataSourceEnvelope[dict]:
        return DataSourceEnvelope(...)
```

### Step 4：注册到 ProviderRegistry

在 `apps/api/app/adapters/registry.py` 中：

1. 导入适配器类
2. 在 `__init__` 的 `self.providers` 字典中添加：

```python
"myModule": {
    "real": RealMyModuleAdapter(),
    "mock": MockMyModuleAdapter(),
},
```

3. 在 `mode_for` 方法的 mapping 中添加：

```python
"myModule": self.settings.provider_my_module_mode,
```

### Step 5：添加配置

在 `apps/api/app/core/config.py` 的 `Settings` 类中：

```python
feature_my_module: bool = False
provider_my_module_mode: str = "real"
```

在 `.env.example` 中添加：

```bash
FEATURE_MY_MODULE=false
PROVIDER_MY_MODULE_MODE=real
```

### Step 6：创建 API 路由

在 `apps/api/app/api/routes/` 中创建路由文件：

```python
# apps/api/app/api/routes/my_module.py
from fastapi import APIRouter, Depends
from apps.api.app.core.database import get_db
from apps.api.app.services.dependencies import get_current_user
from apps.api.app.services.jobs import enqueue_job, process_job

router = APIRouter(prefix="/my-module", tags=["my-module"])

@router.post("/execute")
def execute(body: dict, db=Depends(get_db), user=Depends(get_current_user)):
    payload = dict(body)
    payload["_user_id"] = user.id
    job = enqueue_job(db, "my_module.execute", payload)
    process_job(db, job)
    db.refresh(job)
    return {"job_id": job.id, "status": job.status, "result": job.result}
```

在 `apps/api/app/server.py` 中注册路由：

```python
from apps.api.app.api.routes import my_module
app.include_router(my_module.router)
```

### Step 7：添加 Job 处理逻辑

在 `apps/api/app/services/jobs.py` 的 `process_job` 函数中添加分支：

```python
elif job.job_type == "my_module.execute":
    provider = provider_registry.get("myModule")
    result = provider.execute(job.payload.get("input", ""), trace_id=job.id)
    result_dict = result.model_dump(mode="json", by_alias=True) if hasattr(result, "model_dump") else result
    job.result = result_dict
    _save_module_result(db, job, "my_module", result_dict)
```

### Step 8：创建前端页面

在 `apps/web/src/app/(workspace)/my-module/page.tsx`：

```tsx
import { MyModuleWorkspace } from "@/components/my-module";

export default function MyModulePage() {
  return <MyModuleWorkspace />;
}
```

在 `apps/web/src/components/my-module.tsx` 中实现组件，参考现有模块组件的模式。

---

## 添加新 Provider

如果不需要新模块，只需要为现有模块添加新的外部服务集成：

1. 在 `apps/api/app/ports/interfaces.py` 定义 Port（如不存在）
2. 创建 Real 适配器在 `apps/api/app/adapters/real/`
3. 创建 Mock 适配器在 `apps/api/app/adapters/mock/providers.py`
4. 在 `apps/api/app/adapters/registry.py` 注册
5. 在 `apps/api/app/core/config.py` 添加模式配置
6. 更新 `.env.example`
7. 如需在前端显示，更新 `packages/config/src/index.ts`

---

## 添加新 Job 类型

1. 在 `apps/api/app/services/jobs.py` 的 `process_job` 函数中添加新的 `elif` 分支
2. 在对应的路由文件中创建 `enqueue_job` 调用
3. 如需保存结果到模块结果表，调用 `_save_module_result(db, job, module_type, result_dict)`

---

## 添加新工作流

在 `apps/api/app/services/workflow_engine.py` 的 `WORKFLOW_TEMPLATES` 中添加模板：

```python
"my-workflow": {
    "name": "我的工作流",
    "steps": [
        {"step_type": "step1", "job_type": "my_module.execute", "name": "第一步"},
        {"step_type": "step2", "job_type": None, "name": "第二步"},
    ],
}
```

工作流引擎会自动处理步骤推进、上下文传递和 Job 调度。

---

## 参考示例

项目中已有完整的实现可作为参考：

- **商标查重**：Port + Real 适配器（本地快照 + difflib 相似度）+ 路由 + 前端组件
- **申请书生成**：异步 Job + 文档生成 + 自动入台账 + 提醒调度
- **侵权监控**：Port + Real 适配器 + Job 处理 + 前端组件（monitoring.tsx）
- **竞争对手追踪**：Port + 两个方法（track/compare）+ 前端组件（competitor.tsx）
- **合同审查**：Port + Job + 前端组件（modules.tsx ContractWorkspace）
