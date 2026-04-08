-- MySQL 初始化脚本
-- 此脚本在 MySQL 容器首次启动时自动执行

-- 设置字符集
ALTER DATABASE a1plus CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建应用用户（如果不存在）
-- 注意：用户已在 docker-compose.yml 中通过 MYSQL_USER 创建

-- 可选：添加其他初始化语句
-- 例如：创建额外的索引、设置时区等
