## 计划：英语词汇概念研究与审阅系统 v1

单仓库全栈应用：Express + better-sqlite3 负责数据与 AI 调用，React + Vite 负责研究/审核界面。核心是通用内容单元（items）+ 版本表 + 审核事件表三件套——每个义项、每条例句、每个搭配、每个近义词都是独立的可审核对象，AI 原稿永久保留为 version 1，只有人工通过的内容进入「正式知识库」视图。第一版只验证一件事：AI 能否在你逐条驳回、修改、重新分析的参与下，把一个具体义项讲到你满意。

**Steps**

### 阶段 0 · 骨架与数据库（无依赖）
1. 初始化单包项目：package.json（server+client 共用依赖与脚本：dev/build/start/db:migrate/db:backup/test）、tsconfig.base.json、.env.example、.gitignore（忽略 data/、.env）。
2. server/config.ts：读取 HOST（默认 127.0.0.1）、PORT、DB_PATH、APP_SECRET、AI_MODE；启动即校验缺失项并给出可读报错。
3. server/db/index.ts：better-sqlite3 单例，开启 WAL 与 foreign_keys=ON，示例查询全部走参数化绑定。
4. server/db/migrate.ts + migrations/001_init.sql：建 words、items、item_versions、review_events、ai_tasks、settings、learning_meta、schema_migrations，并对 word_id、parent_id、status、kind 建索引。
5. server/app.ts + /api/health；生产模式由 Express 托管 dist/client。

### 阶段 1 · 配置与 AI 客户端（依赖 0）
6. server/utils/crypto.ts：API Key 用 AES-256-GCM 加密落库，密钥来自 APP_SECRET 或自动生成的 data/secret.key。
7. server/repositories/settings.ts + 路由：GET /api/settings 只返回 apiKeyMasked，PUT 传空值表示「保持原 key」，POST /api/settings/test 做一次最小 chat 调用验证连通性。
8. server/ai/client.ts：OpenAI 兼容 /chat/completions，统一超时、可重试错误码（429/5xx）、usage 记录、请求头脱敏后写 ai_tasks。
9. server/ai/schemas.ts：每个 item kind 的 Zod schema 单一来源；parseJsonLoose（剥离代码围栏）→ 校验 → 失败则发起一次「修复为合法 JSON」调用 → 再失败即任务失败并保留原始响应，绝不落库未校验数据。
10. AI_MODE=mock：内置 suspend/spoil 的固定 fixture，使全流程可离线开发与测试。
11. 前端 /settings 页：Base URL / 模型 / Key / 温度 / 测试连接 / 备份下载。

### 阶段 2 · 单词概览（依赖 1）
12. server/ai/prompts/word_overview.md：由 AI提示词.md 提炼为服务端模板，明确 JSON 契约；核心意义允许为 null 并附「不得强行归纳」说明。
13. server/services/analysisService.ts + jobRunner：POST /api/words 建词条并投递任务，GET /api/jobs/:id 轮询、/api/jobs/:id/stream SSE 推送进度（调用模型 → 校验 → 写库）。
14. 首页：输入框、统计（已研究词数 / 待审核数）、词表（按状态筛选）、30 词导入为「待研究队列」。
15. 单词页骨架：基本信息卡（音标/词性/词源/历史/核心意义）+ 义项列表（编号/词性/中文译法/英文释义/频率/六级重要度）。

### 阶段 3 · 审核内核（依赖 2）
16. server/services/reviewService.ts：approve、reject(意见)、edit(新 payload → 新版本 + 回到 pending)、unpublish、reanalyze；每次动作同时写 item_versions 与 review_events。
17. server/utils/diff.ts：按 payload 字段生成 old/new 对照，供前端并排显示。
18. 前端通用组件：ItemCard（状态徽标/证据徽标/AI 或人工来源/操作按钮）、ReviewActions、EditForm（按 kind 渲染字段）、VersionDiff 弹窗。
19. 审核中心 /review：跨单词待审核队列，支持按词、kind、词性筛选，可直接通过/驳回并跳回词条。

### 阶段 4 · 义项深入研究（依赖 3）
20. server/ai/prompts/sense_study.md：一次调用产出该义项的概念解释（含适用范围、边界、易误解、中英对照、语法结构、典型场景）、词义历史、3–5 条例句、3–5 个搭配、3–4 个近义词、2–3 个反义词；每个子项带 evidence_type。
21. POST /api/items/:id/study（仅待研究义项可触发）+ 各模块「单独生成」入口（如仅补例句），避免整段重跑。
22. 单词页渲染五大分区；搭配短语在例句中以加粗+底色高亮（按同义项搭配的形式变量匹配）。
23. 落地「同义项内不混入其他义项搭配」的校验提示（AI 返回后按 sense 归属落库，前端分区显示）。

### 阶段 5 · 定向重新分析（依赖 4）
24. server/ai/prompts/item_reanalyze.md：输入原内容 + 历史版本 + 驳回意见 + 同义项兄弟条目，输出新版本与「本次修改说明」；生成新版本号，旧版本保留。
25. 规则硬化：已 approved 的条目 reanalyze 直接 409 并提示先「解除通过」；义项级重跑自动跳过已通过条目，并在结果面板列出被跳过项。
26. POST /api/items/:id/explain（仅返回解释文本，不入库）+ 词条页 AI 调用日志抽屉（模型、token、耗时、失败原因）。

### 阶段 6 · 例句联网核实（依赖 4，可整体开关）
27. server/ai/search.ts：POST {searchBase}/v1/tools/search（query/count/need_content）与 /v1/tools/fetch；处理 401/402/404/429 并降级提示。因这是 DeepSeek 专有能力，非 DeepSeek 供应商时自动禁用。
28. 两段式流程：模型生成 3 条检索 query → 后端搜索取正文 → 抽取模型只允许逐字引用所给正文 → validateContainment（normalize 后子串匹配）→ 命中才标 sourced/verified，否则丢弃并回落为「AI生成例句」。
29. 设置页增加 enable_source_verification 开关；关闭或失败时界面强制显示「来源待核实」。

### 阶段 7 · 数据资产（依赖 3，可与 5/6 并行）
30. 导出：GET /api/export?scope=approved|all&format=json|md，JSON 含完整版本与审核历史，Markdown 为可读学习文档。
31. 备份/恢复：POST /api/backup（better-sqlite3 backup() 到 data/backups/）、下载、上传恢复（先备份当前库 → 校验迁移版本 → 原子替换 → 重开连接）。
32. 统计接口与首页卡片；vocabulary copy.txt 30 词批量导入为 backlog（不自动调用 AI）。

### 阶段 8 · 加固与验收（依赖全部）
33. 统一错误模型（AppError → 结构化 JSON）、请求超时、幂等防护（同一义项并发生成互斥）。
34. 安全自检：dist/client 内无 key 痕迹、/api/settings 无明文、日志无 Authorization、服务默认仅监听回环地址。
35. README.md：安装、迁移、启动、首次配置、备份恢复、常见错误；附「一个词从生成到全部通过」的操作手册。

**Relevant files**

- f:\vocabulary\package.json、f:\vocabulary\tsconfig.base.json、f:\vocabulary\.env.example、f:\vocabulary\README.md
- f:\vocabulary\server\app.ts、server\index.ts、server\config.ts
- f:\vocabulary\server\db\index.ts、db\migrate.ts、db\migrations\001_init.sql
- f:\vocabulary\server\repositories\：words.ts、items.ts、versions.ts、reviews.ts、settings.ts、tasks.ts
- f:\vocabulary\server\services\：analysisService.ts、reviewService.ts、exportService.ts、backupService.ts、jobRunner.ts
- f:\vocabulary\server\ai\：client.ts、schemas.ts、search.ts、prompts\word_overview.md、prompts\sense_study.md、prompts\item_reanalyze.md
- f:\vocabulary\server\routes\：words.ts、items.ts、reviews.ts、settings.ts、jobs.ts、export.ts、stats.ts
- f:\vocabulary\server\utils\：crypto.ts、json.ts、diff.ts、textMatch.ts、ids.ts
- f:\vocabulary\client\src\pages\：Home.tsx、WordDetail.tsx、Review.tsx、Settings.tsx
- f:\vocabulary\client\src\components\：ItemCard.tsx、ReviewActions.tsx、EditForm.tsx、VersionDiff.tsx、SenseBlock.tsx、ExampleText.tsx、StatusBadge.tsx
- f:\vocabulary\client\src\api\client.ts、client\src\App.tsx

**Verification**

1. npm install → npm run db:migrate → npm run dev，打开 http://127.0.0.1:5173，/api/health 返回 ok。
2. AI_MODE=mock 离线走通：新增 suspend → 生成义项清单 → 对义项 2 深入研究 → 驳回「概念解释」并填写意见 → 重新分析 → 修改文字 → 再次通过；确认旧版本仍可查看。
3. 真实 Key 验证：生成 spoil（多义项）与 suspend，人工判断概念解释是否「不靠中文近义词糊弄」，记录问题清单。
4. 单元/接口测试（Vitest + supertest + mock provider）：审核状态机（含 approved 保护、重跑跳过）、Zod 校验与修复路径、validateContainment、导出结构、恢复流程。
5. 联网核实实测：对 suspend 义项 1 触发「获取带来源例句」，检查返回 URL 可打开、句子能在该页原文中找到；断网/无余额时确认自动降级为「AI生成例句」而非报错中断。
6. 安全检查：构建后在 dist/client 全文搜索 key 片段应为 0 命中；GET /api/settings 只返回掩码；ai_tasks 中无 Authorization。
7. 备份→新增一个词→恢复→数据回到备份点；导出 JSON 后重新导入校验字段完整性。

**Decisions**

- 数据模型用通用 items 表 + kind 区分的 payload，而非 8 张类型表：一套 CRUD、一套版本、一套审核，直接满足「每条内容独立审核」，也为将来的「笔记/用法条件」留口；word/sense 仍是 items 中的父级节点。
- 两步式生成（你已选）：添加单词只产生基本信息与义项清单；义项详细研究由你逐义项触发，默认一次产出该义项全部模块，另提供单模块生成。
- 例句来源：先 AI 生成，再按需联网核实；核实采用 Search/Fetch + 本地原文包含性校验，不信任模型自述来源；无法确认一律标「来源待核实」。
- 审核保护：approved 条目不可被任何自动流程覆盖，必须显式「解除通过」。
- 不做：背单词/复习、多用户登录、真题语料库检索、富文本编辑、Docker 与 Postgres。
- 本地安全：服务默认仅监听 127.0.0.1，Key 加密落库且永不出现在前端产物或日志中。

**Further Considerations**

1. 模型默认用 deepseek-flash 且结构化任务关闭 thinking（JSON 更稳、更快、更省）；是否需要在设置里额外暴露 deepseek-v4-pro 与 thinking 开关？推荐：暴露模型名与 thinking 开关，默认 flash + 关闭。
2. 「CET-4/6、IELTS 真题」标签的判定标准：推荐只有命中预设白名单域名（或你手工确认）的页面才允许打真题标签，其余统一为「有来源/待核实」。是否接受这个保守策略？
3. 义项的人工维护范围：v1 建议支持「手动新增义项」「软删除义项」，不做义项合并/拆分（复杂度高、收益低）。若你预期经常需要合并义项，我再把这部分纳入 v1。