# CHANGELOG

本文件格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循语义化版本。

## [Unreleased]

### Changed

- 仓库结构调整为分层目录：`00-inbox/`（原始资料）、`01-docs/`（项目文档）、`02-code/`（可运行代码）、`04-data/`（静态数据）、`07-archive/`（归档）。见 [ADR-006](adr/ADR-006-repo-layout.md)。
- 待研究词表的导入路径改为可配置项 `VOCABULARY_IMPORT_FILE`，默认指向 `04-data/fixtures/vocabulary copy.txt`。

### Added

- 项目文档：`00-charter.md`、`DECISIONS.md`、`adr/`、`api/endpoints.md`。
- 首页输入时的拼写容错匹配（Dice + Damerau-Levenshtein）与提交前的词库校验（`GET /api/words/lookup`）。
- 单词详情页两栏布局：左侧单词总览固定，右侧义项面板（筛选器固定、单义项滚动）。

## [0.1.0] - 2026-11-15

### Added

- 单词 → 义项两级生成：`word_overview`（基本信息 + 义项清单）与 `sense_study`（概念解释、词义历史、例句、搭配、近反义词）。
- 通用内容单元模型：8 种 `kind` 全部可独立审核。
- 审核状态机：通过 / 驳回（附意见）/ 修改 / 重新分析 / 追问 / 解除通过，`approved` 内容受保护。
- 版本历史：AI 原稿固定为 v1，任何修改都生成新版本，支持并排差异对比。
- 审核中心：跨单词按状态与类型集中处理待办。
- 导出（JSON / Markdown，可按「仅已通过」）、数据库备份与恢复（`VACUUM INTO` 一致快照）。
- 例句联网核实：DeepSeek Search & Fetch + 本地逐字比对，未匹配到原文的例句不写入。
- 设置页：Base URL / API Key / 模型 / temperature / max_tokens / thinking 开关，API Key 加密存储。
- 测试：Vitest，覆盖工具函数、API 全流程（mock 模式）、网络错误翻译、模糊匹配，共 34 项。

### Fixed

- 长文本生成在非流式等待期间被中间设备重置（`CONNRESET`）→ 改用 SSE 流式。
- `better-sqlite3` 在无 Python / MSVC 环境下编译失败 → `npm install --ignore-scripts` + 预编译包脚本。
- 迁移器与 `schema_migrations` 建表语句冲突。
- 单词输入的大小写、空格、引号/破折号差异导致的重复词条。
