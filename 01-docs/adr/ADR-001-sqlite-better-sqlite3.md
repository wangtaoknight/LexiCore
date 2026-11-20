# ADR-001：单文件 SQLite + better-sqlite3，不引入 ORM

- 状态：Accepted
- 日期：2026-11
- 决策者：项目负责人

## 背景

这是一个**本地单用户**的词汇研究工具：一个进程、一个用户、数据量在万级行以内，核心诉求是「内容可逐条审核 + 版本永不丢失」。需要事务、外键、JSON 存储与稳定的备份能力，但不需要连接池、多写者或水平扩展。

## 决策

使用 **better-sqlite3** 直接操作单文件 SQLite（`data/app.db`），全部查询手写在 `server/repositories/*.ts`。

- WAL 模式、`foreign_keys=ON`、`busy_timeout=5000`（见 `server/db/index.ts`）。
- 迁移脚本为纯 SQL（`server/db/migrations/*.sql`），启动时按 `schema_migrations` 补齐。
- 备份用 `VACUUM INTO` 生成一致快照。

## 备选方案

| 方案 | 放弃原因 |
| --- | --- |
| Prisma / Drizzle ORM | 引入代码生成与 schema 双份真相；本地单文件场景收益低于维护成本 |
| 直接 `sqlite3` 驱动 | 异步回调风格，事务写法繁琐，本项目大量使用同步事务写多表 |
| 独立数据库服务（Postgres 等） | 需要外部进程，违背「本地即开即用」 |

## 后果

- **正面**：零外部依赖、事务简洁（`db.transaction()` 同步执行）、类型靠手写映射完全可控。
- **负面**：SQL 与行映射需手写；`better-sqlite3` 是原生模块，跨 Node ABI 需要预编译包（见 `scripts/ensure-sqlite-prebuild.js`）。
- **约束**：若未来改为多用户/远程部署，本决策需重新评估（见 `DECISIONS.md` 待决策项）。
