# ADR-006：仓库分层目录，代码整体作为单个 npm 包放在 `02-code/`

- 状态：Accepted
- 日期：2026-11-20

## 背景

项目早期是「构想验证」：所有材料（白皮书、思路草稿、参考资料、词表、代码）平铺在仓库根目录。随着功能稳定（34 项测试、可运行的完整前后端），需要把「资料 / 文档 / 代码 / 数据」分开，否则根目录既看不清主线，也无法判断哪些是可用资产。

## 决策

仓库采用编号分层，**不用 monorepo 工具**：

```
00-inbox/   未处理的原始资料（暂存，不参与构建）
01-docs/    已完成的项目文档（charter / requirements / design / adr / api / CHANGELOG / DECISIONS）
02-code/    可运行的代码（单个 npm 包：server + client + scripts + 配置 + 运行时 data/ 与 dist/）
04-data/    静态数据（raw 只读原始数据、fixtures 导入用样本）
07-archive/ 归档（旧格式副本、废弃方案）
README.md   项目入口
.gitignore  仓库级忽略规则，保持在根目录
```

关键取舍：**代码不拆成 `src/ tests/ config/` 的子目录重排**，而是整个 npm 包搬进 `02-code/`。原因是运行链路里有多处相对 `process.cwd()` 的路径（提示词目录、`data/app.db`、`dist/client`、`vocabulary copy.txt`），重新分层会同时改动 8 处路径且收益有限；而「包整体平移」只需保证所有命令都在 `02-code/` 下执行。

## 备选方案

| 方案 | 放弃原因 |
| --- | --- |
| 代码拆成 `02-code/src/{server,client}` | 需改 package.json / tsconfig / vite / vitest / 3 处 cwd 路径，风险高、收益低 |
| pnpm workspace 多包 | 单应用无需多包，增加工具链复杂度 |
| 不迁移，仅整理文档 | 根目录仍混着代码与资料，长期会再次退化 |

## 后果

- **正面**：根目录一眼看清主线；资料与文档可以自由增删而不影响运行；`data/`、`dist/`、`node_modules/` 都在包内，`.gitignore` 的未锚定规则继续生效。
- **负面**：所有命令需先 `cd 02-code`（README 已更新）；外部脚本若硬编码根目录路径需同步调整。
- **约束**：`04-data/fixtures/vocabulary copy.txt` 通过 `VOCABULARY_IMPORT_FILE` 引用，代码内不再出现仓库级相对路径猜测（保留一处有注释的候选路径解析）。
