# DECISIONS（决策时间线速查）

按时间顺序记录影响架构或长期维护成本的决策。细节见 `adr/` 下对应文档。

| 编号 | 日期 | 决策 | 状态 | 详情 |
| --- | --- | --- | --- | --- |
| D-001 | 2026-11 | 单文件 SQLite + better-sqlite3，不引入 ORM | Accepted | [ADR-001](adr/ADR-001-sqlite-better-sqlite3.md) |
| D-002 | 2026-11 | 所有内容统一进 `items` 表（kind + JSON payload），不按品类分表 | Accepted | [ADR-002](adr/ADR-002-unified-items-table.md) |
| D-003 | 2026-11 | AI 输出必须过 Zod 校验，失败先「修复调用」再失败，绝不写未校验数据 | Accepted | [ADR-003](adr/ADR-003-zod-structured-output.md) |
| D-004 | 2026-11 | 长文本生成一律走 SSE 流式，避免空闲连接被重置 | Accepted | [ADR-004](adr/ADR-004-sse-streaming.md) |
| D-005 | 2026-11 | API Key 以 AES-256-GCM 加密入库，接口只返回掩码 | Accepted | [ADR-005](adr/ADR-005-api-key-at-rest.md) |
| D-006 | 2026-11 | 仓库按「资料 / 文档 / 代码 / 数据 / 归档」分层，代码整体作为单个 npm 包放在 `02-code/` | Accepted | [ADR-006](adr/ADR-006-repo-layout.md) |

## 待决策（Open）

| 议题 | 现状 | 备注 |
| --- | --- | --- |
| 单用户本地工具 → 多用户/远程部署 | 未决定 | 需要先解决身份认证与 Key 隔离，当前服务只监听 `127.0.0.1` |
| 义项目录顺序 | 界面按「频率 → 六级重要性 → seq」重排 | 与 AI 返回的 `senseNo` 顺序可能不一致，是否改为以人工排序为准待定 |
| `evidenceType` 的自证问题 | 由模型自我标注 | 系统未做外部核验，审核时需人工把关；是否引入词典/语料校验待定 |
| 背单词 / 间隔复习 | 数据库已预留 `learning_meta` | v1 明确不做 |
