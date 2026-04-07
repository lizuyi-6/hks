# 自动化工作流管线（Automated Workflow Pipeline）规格文档

## Why

当前系统是一堆独立模块的堆砌：6 个扩展模块（监控、竞品、合同、专利、政策、尽调）各自孤立运行，结果不持久化、不关联、不传递。用户必须手动逐个操作每个模块，系统无法主动推荐下一步行动，也无法根据上下文自动串联跨模块流程。本改造将系统从"被动工具箱"升级为"主动自动化生产线"——系统能感知用户上下文、自动推荐下一步、串联执行多步骤流程、持久化所有结果。

## What Changes

### 后端改造

- **新增 WorkflowEngine**：基于现有 JobRecord 的可配置步骤链引擎，替代 `process_job` 中的硬编码 if/elif
- **新增 WorkflowInstance / WorkflowStep 模型**：持久化工作流实例状态和各步骤执行结果
- **新增 ModuleResult 模型**：统一存储所有扩展模块（监控/合同/专利/政策/尽调/竞品）的执行结果
- **扩展 Job 类型**：将 6 个扩展模块从同步直调 Provider 改为通过 Job 系统异步执行，支持重试和结果持久化
- **新增 /workflows API**：管理工作流实例的创建、查询、推进
- **新增 /suggestions API**：基于当前上下文主动推荐下一步操作
- **改造 /modules-results API**：统一查询所有模块的历史执行结果
- **事件钩子**：Job 完成后自动触发下游动作（如诊断完成 → 推荐进入商标查重）

### 前端改造

- **新增 PipelineStatus 全局组件**：在 Dashboard 展示当前活跃工作流管线进度（步骤指示器 + 当前状态）
- **改造 DashboardPanel**：展示"下一步建议"卡片，根据用户当前进度主动推荐操作
- **改造各模块 Workspace**：执行完成后展示"推荐下一步"操作按钮，一键跳转到下游模块并自动填充上下文
- **新增 工作流历史页**：查看所有工作流实例的执行记录和结果
- **消除 localStorage 传参**：改为从后端 API 获取上下文数据

## Impact

- Affected code:
  - `apps/api/app/services/jobs.py` — 核心重构，引入 WorkflowEngine
  - `apps/api/app/db/models.py` — 新增 WorkflowInstance、WorkflowStep、ModuleResult 模型
  - `apps/api/app/api/routes/placeholders.py` — 改造为异步 Job 模式
  - `apps/api/app/api/routes/` — 新增 workflows、suggestions、module-results 路由
  - `apps/api/app/server.py` — 注册新路由
  - `apps/web/src/components/workspace.tsx` — Dashboard 改造 + 下一步推荐
  - `apps/web/src/components/modules.tsx` — 扩展模块改造 + 推荐下一步
  - `apps/web/src/components/monitoring.tsx` — 监控模块改造
  - `apps/web/src/components/competitor.tsx` — 竞品模块改造
  - `apps/web/src/app/(workspace)/` — 新增工作流历史页面路由
  - `packages/domain/src/index.ts` — 新增工作流相关类型定义

---

## ADDED Requirements

### Requirement: WorkflowEngine 工作流引擎

系统 SHALL 提供一个基于现有 JobRecord 的工作流引擎，支持定义多步骤工作流，每个步骤可配置为调用特定 Provider 并传递上一步的结果作为输入。

#### Scenario: 执行完整的商标注册工作流
- **WHEN** 用户在 IP 诊断页面完成诊断并获得 `recommendedTrack = "trademark"` 的结果
- **THEN** 系统自动创建一个 `trademark-registration` 工作流实例，包含步骤：商标查重 → 申请书生成 → 提交引导 → 入台账
- **AND** 每个步骤完成后自动推进到下一步
- **AND** 用户可在 Dashboard 看到当前工作流进度（第几步 / 共几步）

#### Scenario: 工作流步骤失败自动重试
- **WHEN** 工作流中某个步骤执行失败
- **THEN** 系统按现有 Job 的重试机制（最多 3 次）自动重试
- **AND** 若重试全部失败，工作流状态变为 `failed`，前端展示错误信息并提供"重试此步骤"按钮

### Requirement: WorkflowInstance / WorkflowStep 持久化

系统 SHALL 提供两个新的数据库模型来持久化工作流实例和步骤状态。

#### Scenario: 查询用户的工作流历史
- **WHEN** 用户访问工作流历史页面
- **THEN** 系统返回该用户所有工作流实例（包含状态、创建时间、步骤列表及各步骤结果）

### Requirement: ModuleResult 模块结果持久化

系统 SHALL 为所有扩展模块（监控、竞品、合同、专利、政策、尽调）提供统一的结果持久化。

#### Scenario: 合同审查结果持久化
- **WHEN** 用户执行合同审查
- **THEN** 系统将审查结果保存到 ModuleResult 表
- **AND** 用户刷新页面后仍可查看历史审查结果
- **AND** 结果与当前工作流实例关联（如在工作流上下文中执行）

### Requirement: 主动推荐下一步（Suggestions）

系统 SHALL 根据用户当前上下文（已完成的操作、工作流进度、资产状态）主动推荐下一步操作。

#### Scenario: 诊断完成后推荐商标查重
- **WHEN** 用户完成 IP 诊断，结果为 `recommendedTrack = "trademark"`
- **THEN** 系统在诊断结果下方展示推荐卡片："→ 建议下一步：商标查重"，附带一键跳转按钮
- **AND** 点击后跳转到商标查重页面，自动填充诊断结果中的 recommendedTrademarkCategories

#### Scenario: 商标查重结果为绿色推荐生成申请书
- **WHEN** 商标查重结果为 `riskLevel = "green"`
- **THEN** 系统展示推荐卡片："→ 商标名称可用，建议下一步：生成申请书"，一键跳转到申请书生成

#### Scenario: Dashboard 展示个性化推荐
- **WHEN** 用户进入 Dashboard
- **THEN** 系统展示"待办建议"区域，列出基于当前状态的推荐操作（如"您有 2 个资产即将到期，建议查看提醒设置"或"您尚未完成 IP 诊断，建议开始诊断"）

### Requirement: 扩展模块 Job 化

系统 SHALL 将 6 个扩展模块（监控、竞品、合同、专利、政策、尽调）从同步直调 Provider 改为通过 Job 系统异步执行。

#### Scenario: 合同审查异步执行
- **WHEN** 用户提交合同审查请求
- **THEN** 系统创建 `contract.review` 类型的 Job，前端展示 loading 状态并轮询结果
- **AND** 结果持久化到 ModuleResult 表

### Requirement: 跨模块上下文传递

系统 SHALL 在工作流步骤之间自动传递上下文数据，不再依赖前端 localStorage。

#### Scenario: 诊断结果传递到商标查重
- **WHEN** 工作流从"IP 诊断"步骤推进到"商标查重"步骤
- **THEN** 系统自动将诊断结果中的 `recommendedTrademarkCategories` 和 `businessDescription` 传递给商标查重作为默认输入
- **AND** 前端无需通过 localStorage 传递数据

### Requirement: 前端工作流进度可视化

系统 SHALL 在前端提供工作流进度可视化组件。

#### Scenario: 查看当前工作流进度
- **WHEN** 用户在工作区内任何页面
- **THEN** 侧边栏或顶部展示当前活跃工作流的进度指示器（如"第 2 步 / 共 5 步：商标查重"）
- **AND** 已完成步骤显示绿色勾，当前步骤显示加载动画，未完成步骤显示灰色

## MODIFIED Requirements

### Requirement: process_job 函数（现有 Job 处理）

将现有 `process_job` 中硬编码的 if/elif 分发逻辑重构为基于 WorkflowEngine 的可配置步骤执行。新增的 job_type 包括：
- `monitoring.scan` — 侵权监控扫描
- `competitor.track` — 竞品追踪
- `competitor.compare` — 竞品对比
- `contract.review` — 合同审查
- `patent.assess` — 专利评估
- `policy.digest` — 政策摘要
- `due-diligence.investigate` — 融资尽调

### Requirement: DashboardPanel 组件

改造 Dashboard 面板，新增"待办建议"区域，展示基于用户当前状态的主动推荐操作。新增"活跃工作流"区域，展示当前进行中的工作流进度。

### Requirement: 扩展模块前端组件

所有扩展模块组件（MonitoringWorkspace、CompetitorWorkspace、ContractWorkspace、PatentWorkspace、PolicyWorkspace、DueDiligenceWorkspace）在执行完成后，展示"推荐下一步"操作卡片。
