# Checklist

## 前端错误探针实现

- [x] workspace.tsx request 函数返回结构化错误信息
- [x] modules.tsx request 函数返回结构化错误信息
- [x] monitoring.tsx request 函数返回结构化错误信息
- [x] competitor.tsx request 函数返回结构化错误信息
- [x] ApplicationError 类正确实现

## 前端错误展示增强

- [x] DashboardPanel 解析 ApplicationError
- [x] 根据 errorType 显示不同颜色（红色=系统错误，黄色=业务错误，蓝色=网络错误）
- [x] "查看详情"按钮正常展开/收起
- [x] 错误信息包含 errorLocation 和 timestamp

## 后端错误上下文实现

- [x] APIError 异常类正确实现
- [x] 全局异常处理器正确注册
- [x] placeholders.py 所有端点使用 APIError
- [x] trademarks.py 所有端点使用 APIError
- [x] diagnosis.py 所有端点使用 APIError
- [x] 错误响应包含 errorType、message、requestId

## 验证

- [x] 前端编译通过，无 TypeScript 错误
- [x] 后端启动成功
- [ ] 模拟 API 错误时前端正确显示（需人工测试）
- [ ] 浏览器控制台输出可读的错误日志（需人工测试）
- [ ] 错误堆栈包含有用信息（开发环境，仅在"详情"中显示）
- [x] 生产环境不暴露敏感堆栈信息（代码中已做判断）
