# ADR-002：所有内容统一进 `items` 表（kind + JSON payload）

- 状态：Accepted
- 日期：2026-11

## 背景

系统需要保存 8 类内容：`word_basic`、`sense`、`sense_concept`、`sense_history`、`example`、`collocation`、`synonym`、`antonym`。它们的字段差异很大（例句有来源链接，近义词有可替换性判断），但**审核、版本、重新分析、导出**等行为的处理方式完全一致。

## 决策

用一张 `items` 表承载全部内容：

```
items(id, word_id, parent_id, kind, seq, pos, payload TEXT, status,
      evidence_type, origin, current_version, created_at, updated_at)
```

- 结构化差异放进 `payload`（JSON 文本），形状由 `server/ai/schemas.ts` 的 Zod schema 定义，**代码是形状的唯一真相**。
- 层级用 `parent_id` 表达：单词 → 义项 → 子内容。
- 审核状态、证据等级、来源（AI/人工）、当前版本号是所有品类共享的列。

## 备选方案

| 方案 | 放弃原因 |
| --- | --- |
| 每种内容一张表 | 审核/版本/导出逻辑要写 8 份，或做大量抽象；新增品类要改表结构 |
| 完全 EAV（一行一个字段） | 读取一条内容要聚合十几行，渲染成本高 |

## 后果

- **正面**：审核中心、版本对比、导出、重新分析都只处理一种数据结构；新增品类接近零成本。
- **负面**：payload 无法用 SQL 直接过滤/聚合，字段完整性只能靠应用层 Zod 保证；需要 `parseItemPayload()` 等显式解析。
- **约束**：改字段形状必须同步改 `schemas.ts`，并对历史版本做兼容（旧 payload 读取时宽松处理）。
