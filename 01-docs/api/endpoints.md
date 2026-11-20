# HTTP 接口契约（v0.1.0）

- 全部接口挂在 `/api` 前缀下（见 `server/app.ts`）。
- 请求/响应均为 JSON（`express.json({ limit: '4mb' })`），`/api/restore` 例外：请求体是备份数据库的原始二进制。
- 错误统一格式：

```json
{ "error": { "code": "bad_request | not_found | conflict | upstream_error", "message": "给人看的说明", "details": {} } }
```

常用状态码：`201` 新建单词、`202` 任务已受理、`400` 参数非法、`404` 不存在、`409` 状态冲突（如已通过的内容不能直接重新分析）、`502` 上游 AI 异常。

## 健康检查

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 存活探针，返回服务与版本信息 |

## 设置

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/settings` | 返回公共配置（API Key 只给掩码） |
| PUT | `/api/settings` | 更新配置：`apiBaseUrl`、`apiKey`、`clearApiKey`、`model`、`temperature`、`maxTokens`、`thinking`、`searchBaseUrl`、`enableSourceVerification` |
| POST | `/api/settings/test` | 真实打一次极小模型调用，返回 `{ ok, latencyMs, model, reply }` |

## 单词

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/words` | 单词列表 + 全局统计（含音标、词性、义项摘要） |
| GET | `/api/stats` | 仅全局统计 |
| POST | `/api/words` | `{ word }`；不存在则建词并异步启动 `word_overview`，返回 `{ word, created, hasOverview, job }`（`201` 新建 / `200` 已存在） |
| GET | `/api/words/lookup?word=` | 归一化后做**精确**存在性校验：`{ valid, word, existing }` |
| GET | `/api/words/:id` | 单词详情：`{ word, items, stats, runningJob }` |
| DELETE | `/api/words/:id` | 删除单词及其全部内容（级联） |
| GET | `/api/words/:id/tasks` | 该词的 AI 调用记录（不含原始请求/响应正文） |

## 内容条目与审核

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/review/queue` | 审核队列，支持按 `status` / `kind` / `wordId` 过滤 |
| GET | `/api/items/:id` | 单条内容：`{ item }` |
| PATCH | `/api/items/:id` | 人工修改，`{ payload }`，生成新版本并回到 `pending` |
| POST | `/api/items/:id/approve` | 通过（进入正式知识库） |
| POST | `/api/items/:id/reject` | 驳回，`{ comment }`，意见永久保存 |
| POST | `/api/items/:id/unpublish` | 解除通过，回到 `pending` |
| GET | `/api/items/:id/versions` | 版本历史（v1 = AI 原稿） |
| GET | `/api/items/:id/events` | 审核事件流水 |
| POST | `/api/items/:id/study` | 对「义项」异步启动 `sense_study`（`202` + `job`） |
| POST | `/api/items/:id/reanalyze` | 异步重新分析单条内容，`{ comment }`（`202` + `job`） |
| POST | `/api/items/:id/sources` | 异步联网核实/抓取带来源例句，需先开启该功能（`202` + `job`） |
| POST | `/api/items/:id/explain` | 就单条内容追问，`{ question }`，回答不写库 |

## 任务（异步生成）

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/jobs/:id` | 任务快照 `{ id, type, status, progress[], result, error }` |
| GET | `/api/jobs/:id/stream` | SSE（`text/event-stream`），每 500ms 推一次任务快照，`status !== 'running'` 时关闭 |

任务保存在内存 Map 中，完成后保留 30 分钟；进度行为中文短语，直接用于界面展示。

## 数据与备份

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/export?scope=approved\|all&format=json\|md` | 导出知识库，作为附件下载 |
| GET | `/api/backups` | 备份列表 |
| POST | `/api/backup` | 生成备份（`VACUUM INTO`） |
| GET | `/api/backup/download?file=` | 下载指定备份 |
| POST | `/api/restore` | 上传备份库文件恢复（恢复前自动留一份 `pre-restore-*.db`） |
| POST | `/api/backlog/import` | 从 `VOCABULARY_IMPORT_FILE`（默认 `04-data/fixtures/vocabulary copy.txt`）导入待研究单词，不调用 AI |

## 前端约定

- 任务进度统一通过 `EventSource` 订阅 `/api/jobs/:id/stream`，结束时前端重新拉取 `GET /api/words/:id`。
- 单词页的义项排序在前端完成（频率 → 六级重要性 → `seq`），后端只保证返回全部条目。
