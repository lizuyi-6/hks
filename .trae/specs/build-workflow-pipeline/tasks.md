# Tasks

- [x] Task 1: 新增数据库模型 — WorkflowInstance、WorkflowStep、ModuleResult
  - [x] 1.1 在 `apps/api/app/db/models.py` 中新增 `WorkflowInstance` 模型：id, user_id(FK->users), workflow_type(str), status(str: pending/running/completed/failed), context(JSON), current_step_index(int), created_at, updated_at
  - [x] 1.2 新增 `WorkflowStep` 模型：id, workflow_id(FK->workflow_instances), step_type(str), step_index(int), status(str: pending/running/completed/failed/skipped), job_id(FK->job_records, nullable), input_data(JSON), output_data(JSON), created_at, updated_at
  - [x] 1.3 新增 `ModuleResult` 模型：id, user_id(FK->users), workflow_id(FK->workflow_instances, nullable), module_type(str), job_id(FK->job_records, nullable), result_data(JSON), created_at
  - [x] 1.4 在 `packages/domain/src/index.ts` 中新增对应的 TypeScript 类型定义：WorkflowInstance, WorkflowStep, ModuleResult, Suggestion

- [x] Task 2: 构建 WorkflowEngine 核心引擎
  - [x] 2.1 创建 `apps/api/app/services/workflow_engine.py`，实现 WorkflowEngine 类
  - [x] 2.2 定义工作流模板注册表 `WORKFLOW_TEMPLATES`，包含 `trademark-registration` 模板（步骤：diagnosis → trademark-check → application → submit-guide → ledger）
  - [x] 2.3 实现 `create_workflow(db, user_id, workflow_type, initial_context)` — 创建工作流实例及所有步骤
  - [x] 2.4 实现 `advance_workflow(db, workflow_id, step_output)` — 完成当前步骤、将输出合并到 context、推进到下一步、自动触发下一步的 Job
  - [x] 2.5 实现 `get_suggestions(db, user_id)` — 基于用户当前状态（无工作流→推荐开始诊断、诊断完成→推荐查重、查重绿色→推荐生成申请书、有即将到期资产→提醒查看）返回建议列表

- [x] Task 3: 扩展 Job 系统 — 将 6 个扩展模块 Job 化
  - [x] 3.1 在 `apps/api/app/services/jobs.py` 的 `process_job` 函数中新增 6 个 job_type 分支：monitoring.scan, competitor.track, competitor.compare, contract.review, patent.assess, policy.digest, due-diligence.investigate
  - [x] 3.2 每个 job_type 分支：调用对应 Provider → 将结果保存到 ModuleResult 表 → 调用 `advance_workflow` 推进工作流（如有关联的 workflow_id）
  - [x] 3.3 在 `apps/api/app/schemas/` 中为新增 job_type 创建请求/响应 schema

- [x] Task 4: 新增后端 API 路由
  - [x] 4.1 创建 `apps/api/app/api/routes/workflows.py`：POST /workflows（创建工作流）、GET /workflows（列表）、GET /workflows/{id}（详情含步骤）、POST /workflows/{id}/advance（手动推进步骤）
  - [x] 4.2 创建 `apps/api/app/api/routes/suggestions.py`：GET /suggestions（获取当前用户的推荐操作列表）
  - [x] 4.3 创建 `apps/api/app/api/routes/module_results.py`：GET /module-results（按 module_type 过滤的历史结果列表）
  - [x] 4.4 改造 `apps/api/app/api/routes/placeholders.py`：将 6 个扩展模块的 POST 端点从同步直调改为入队 Job + 返回 job_id
  - [x] 4.5 在 `apps/api/app/server.py` 中注册新路由

- [x] Task 5: 前端工作流进度可视化
  - [x] 5.1 在 `packages/ui/src/index.tsx` 中新增 `PipelineIndicator` 组件：展示步骤进度条（已完成/当前/待执行），接受 steps 数组和 currentStepIndex
  - [x] 5.2 新增 `NextStepCard` 组件：展示推荐下一步操作的卡片，包含操作标题、描述、一键跳转按钮
  - [x] 5.3 改造 `apps/web/src/components/app-shell.tsx` 侧边栏：在侧边栏顶部展示当前活跃工作流的 PipelineIndicator

- [x] Task 6: 改造 DashboardPanel — 新增待办建议和活跃工作流
  - [x] 6.1 DashboardPanel 新增"待办建议"区域：调用 GET /suggestions 获取推荐列表，使用 NextStepCard 渲染
  - [x] 6.2 DashboardPanel 新增"活跃工作流"区域：调用 GET /workflows?status=running 获取活跃工作流，使用 PipelineIndicator 展示进度
  - [x] 6.3 DashboardPanel 新增"最近模块结果"区域：调用 GET /module-results 获取最近 5 条模块执行记录

- [x] Task 7: 改造各模块 Workspace — 添加"推荐下一步"和 Job 化
  - [x] 7.1 改造 DiagnosisWorkspace：诊断完成后展示 NextStepCard 推荐商标查重，点击跳转并自动传递 categories 和 description
  - [x] 7.2 改造 TrademarkCheckWorkspace：查重完成后根据 riskLevel 展示 NextStepCard（green→推荐生成申请书，yellow→提示风险，red→建议调整名称）
  - [x] 7.3 改造 ApplicationWorkspace：申请书生成完成后展示 NextStepCard 推荐查看提交引导
  - [x] 7.4 改造 MonitoringWorkspace：改为入队 Job + 轮询结果，完成后展示 NextStepCard
  - [x] 7.5 改造 CompetitorWorkspace：改为入队 Job + 轮询结果，完成后展示 NextStepCard
  - [x] 7.6 改造 ContractWorkspace、PatentWorkspace、PolicyWorkspace、DueDiligenceWorkspace：全部改为入队 Job + 轮询结果，完成后展示 NextStepCard

- [x] Task 8: 消除 localStorage 跨页面传参
  - [x] 8.1 DiagnosisWorkspace：诊断结果不再 persist 到 localStorage，改为保存到后端 ModuleResult 或 WorkflowInstance.context
  - [x] 8.2 TrademarkCheckWorkspace：从后端 API 获取上一步的诊断结果作为默认输入，而非从 localStorage restore
  - [x] 8.3 ApplicationWorkspace：从后端 API 获取查重结果，而非从 localStorage restore
  - [x] 8.4 删除 workspace.tsx 中 persist/restore 相关的 localStorage 调用

# Task Dependencies

- [Task 2] depends on [Task 1] — WorkflowEngine 需要数据库模型
- [Task 3] depends on [Task 1] — 扩展 Job 需要 ModuleResult 模型
- [Task 4] depends on [Task 2, Task 3] — API 路由需要引擎和 Job 支持
- [Task 5] depends on [Task 1] — 前端组件需要 domain 类型定义
- [Task 6] depends on [Task 4, Task 5] — Dashboard 需要 API 和 UI 组件
- [Task 7] depends on [Task 4, Task 5] — 模块改造需要 API 和 UI 组件
- [Task 8] depends on [Task 4, Task 7] — 消除 localStorage 需要后端 API 替代方案就绪
