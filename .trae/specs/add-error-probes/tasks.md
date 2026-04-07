# Tasks

## 前端错误探针实现

- [x] Task 1: 创建统一错误处理工具类
  - [x] SubTask 1.1: 创建 ApplicationError 类
  - [x] SubTask 1.2: 创建错误类型枚举
  - [x] SubTask 1.3: 创建 request 错误解析函数

- [x] Task 2: 修改 workspace.tsx request 函数
  - [x] SubTask 2.1: 导入错误处理工具
  - [x] SubTask 2.2: 解析后端错误响应
  - [x] SubTask 2.3: 抛出 ApplicationError

- [x] Task 3: 修改 modules.tsx request 函数
  - [x] SubTask 3.1: 导入错误处理工具
  - [x] SubTask 3.2: 解析后端错误响应
  - [x] SubTask 3.3: 抛出 ApplicationError

- [x] Task 4: 修改 monitoring.tsx request 函数
  - [x] SubTask 4.1: 导入错误处理工具
  - [x] SubTask 4.2: 解析后端错误响应

- [x] Task 5: 修改 competitor.tsx request 函数
  - [x] SubTask 5.1: 导入错误处理工具
  - [x] SubTask 5.2: 解析后端错误响应

## 前端错误展示增强

- [x] Task 6: 增强 DashboardPanel 错误展示
  - [x] SubTask 6.1: 解析 ApplicationError
  - [x] SubTask 6.2: 根据 errorType 显示不同样式
  - [x] SubTask 6.3: 添加"查看详情"展开功能

## 后端错误上下文实现

- [x] Task 7: 创建统一错误处理模块
  - [x] SubTask 7.1: 创建 APIError 异常类
  - [x] SubTask 7.2: 创建全局异常处理器
  - [x] SubTask 7.3: 注册到 FastAPI 应用

- [x] Task 8: 修改后端 API 路由使用统一错误
  - [x] SubTask 8.1: 修改 placeholders.py 使用 APIError
  - [x] SubTask 8.2: 修改 trademarks.py 使用 APIError
  - [x] SubTask 8.3: 修改 diagnosis.py 使用 APIError

## 验证

- [x] Task 9: 验证前后端错误链路
  - [x] SubTask 9.1: 前端编译通过
  - [x] SubTask 9.2: 后端启动成功
  - [ ] SubTask 9.3: 需人工测试 API 错误展示

# Task Dependencies
- Task 2-5 依赖 Task 1 ✅
- Task 6 依赖 Task 1 ✅
- Task 9 依赖 Task 2-8 ✅
