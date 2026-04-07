# Checklist

## 数据库模型
- [x] WorkflowInstance 模型已创建，包含 id, user_id, workflow_type, status, context, current_step_index 字段
- [x] WorkflowStep 模型已创建，包含 id, workflow_id, step_type, step_index, status, job_id, input_data, output_data 字段
- [x] ModuleResult 模型已创建，包含 id, user_id, workflow_id, module_type, job_id, result_data 字段
- [x] packages/domain 中新增了 WorkflowInstance, WorkflowStep, ModuleResult, Suggestion TypeScript 类型

## WorkflowEngine
- [x] WORKFLOW_TEMPLATES 注册表已定义，包含 trademark-registration 模板
- [x] create_workflow 能正确创建工作流实例及所有步骤
- [x] advance_workflow 能完成当前步骤、合并 context、推进到下一步
- [x] get_suggestions 能根据用户状态返回合理的推荐列表

## Job 系统扩展
- [x] process_job 支持 monitoring.scan, competitor.track, competitor.compare, contract.review, patent.assess, policy.digest, due-diligence.investigate 等 7 个新 job_type
- [x] 每个新 job_type 执行后将结果保存到 ModuleResult 表
- [x] 每个 job_type 执行后如有关联 workflow_id 则自动推进工作流步骤

## API 路由
- [x] POST /workflows — 创建工作流实例
- [x] GET /workflows — 列出当前用户的工作流
- [x] GET /workflows/{id} — 获取工作流详情（含步骤列表和各步骤结果）
- [x] POST /workflows/{id}/advance — 手动推进工作流步骤
- [x] GET /suggestions — 返回当前用户的推荐操作列表
- [x] GET /module-results — 返回模块历史执行结果（支持按 module_type 过滤）
- [x] 扩展模块 POST 端点已改为入队 Job 模式（返回 job_id）
- [x] 新路由已注册到 server.py

## 前端组件
- [x] PipelineIndicator UI 组件已创建（步骤进度条）
- [x] NextStepCard UI 组件已创建（推荐下一步卡片）
- [x] 侧边栏展示当前活跃工作流进度

## Dashboard 改造
- [x] Dashboard 展示"待办建议"区域，内容来自 GET /suggestions
- [x] Dashboard 展示"活跃工作流"区域，展示进行中的工作流进度
- [x] Dashboard 展示"最近模块结果"区域

## 模块改造
- [x] DiagnosisWorkspace 完成后展示 NextStepCard 推荐商标查重
- [x] TrademarkCheckWorkspace 完成后根据 riskLevel 展示推荐
- [x] ApplicationWorkspace 完成后展示 NextStepCard 推荐提交引导
- [x] 所有 6 个扩展模块改为入队 Job + 轮询结果模式
- [x] 所有扩展模块完成后展示 NextStepCard

## localStorage 消除
- [x] DiagnosisWorkspace 不再使用 localStorage 传递诊断结果
- [x] TrademarkCheckWorkspace 从后端 API 获取上一步数据
- [x] ApplicationWorkspace 从后端 API 获取查重结果
- [x] workspace.tsx 中 persist/restore 的 localStorage 调用已清理
