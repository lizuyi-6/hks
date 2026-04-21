# 部署指南

## 前置条件

### Docker Compose 部署（推荐）
- Docker 24+
- Docker Compose V2

### 手动部署
- Node.js 24+
- Python 3.12+
- PostgreSQL 16+ 或 MySQL 8.0+
- Redis 7+（可选）

---

## Docker Compose 部署

### 服务架构

Docker Compose 定义 5 个服务：

| 服务 | 镜像 | 端口 | 依赖 |
|------|------|------|------|
| `postgres` | `postgres:16` | 5432 | 无 |
| `mysql` | `mysql:8.0` | 3306 | 无 |
| `redis` | `redis:7-alpine` | 6379 | 无 |
| `api` | 自定义 Dockerfile.api | 8000 | postgres, redis |
| `worker` | 自定义 Dockerfile.api | 无 | postgres, redis |
| `web` | 自定义 Dockerfile.web | 3000 | api |

所有服务包含健康检查，依赖关系使用 `condition: service_healthy` 确保 启动顺序。

### 部署步骤

```bash
# 1. 克隆仓库
git clone https://github.com/lizuyi-6/hks.git
cd hks

# 2. 创建环境配置
cp .env.example .env

# 3. 编辑 .env（至少修改以下项）
# APP_SECRET_KEY=your-secure-secret
# DATABASE_URL=postgresql+psycopg://postgres:postgres@postgres:5432/a1plus
# REDIS_URL=redis://redis:6379/0

# 4. 启动所有服务
docker compose up --build

# 5. 验证服务状态
curl http://localhost:8000/system/health
# 浏览器打开 http://localhost:3000
```

### 持久化

Docker Compose 定义两个命名卷：
- `postgres_data` — PostgreSQL 数据
- `mysql_data` — MySQL 数据

---

## 手动部署

### 后端

```bash
# 安装依赖
pip install -r apps/api/requirements.txt

# 配置数据库（默认使用 SQLite，无需额外配置）
# 如使用 PostgreSQL：
export DATABASE_URL="postgresql+psycopg://user:pass@localhost:5432/a1plus"

# 启动 API 服务
uvicorn apps.api.main:app --reload --port 8000
```

### Worker

```bash
# Worker 使用与 API 相同的依赖和配置
python -m apps.worker.main
```

### 前端

```bash
# 安装依赖
npm install

# 开发模式
npm run dev:web

# 生产构建
npm run build:web
npm run start
```

---

## 生产环境注意事项

### 必须修改的配置

| 配置项 | 说明 |
|--------|------|
| `APP_SECRET_KEY` | JWT 签名密钥，使用强随机字符串 |
| `APP_ENV` | 设为 `production` |
| `DATABASE_URL` | 使用 PostgreSQL，不要使用 SQLite |

### 建议配置

| 配置项 | 建议 |
|--------|------|
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 根据安全需求设置合理值 |
| SMTP 配置 | 配置真实 SMTP 服务以启用邮件提醒 |
| `PROVIDER_LLM_MODE` | 设为 `real` 并配置 LLM API |
| 特性开关 | 仅启用需要的模块 |

### 数据库

- 生产环境**不要**使用 SQLite
- PostgreSQL 推荐版本 16+
- 确保定期备份

### 网络安全

- API 服务不要直接暴露到公网（通过 BFF 代理访问）
- 修改所有默认密码
- 启用 HTTPS

---

## 健康检查

### API 健康检查

```bash
curl http://localhost:8000/system/health
```

返回所有 14 个 Provider 的可用性状态。

### Docker 健康检查

所有服务在 `docker-compose.yml` 中配置了健康检查：

| 服务 | 检查方式 |
|------|---------|
| postgres | `pg_isready` |
| mysql | `mysqladmin ping` |
| redis | `redis-cli ping` |
| api | HTTP GET `/system/health` |
| web | HTTP GET `/` |

---

## 常见问题

### 端口冲突

修改 `.env` 中的 `WEB_PORT` 和 `API_PORT`，以及 `docker-compose.yml` 中的端口映射。

### 数据库连接失败

检查 `DATABASE_URL` 格式：
- PostgreSQL：`postgresql+psycopg://user:pass@host:5432/dbname`
- 确保 PostgreSQL 服务已启动且可访问

### 前端无法连接后端

检查 `NEXT_PRIVATE_API_BASE_URL` 是否指向正确的后端地址。Docker Compose 环境中应使用服务名：`http://api:8000`。
