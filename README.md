# 词汇概念研究台（Vocabulary Concept Lab）

以「概念理解」为核心的英语词汇研究工具。它不是背单词软件：输入一个单词后，AI 先梳理义项清单，再由你对**每个义项、每条例句、每个搭配、每个近义词/反义词**逐条审核、驳回、修改或重新分析。只有人工通过的内容才进入正式知识库。

## 核心设计

- **单词 → 义项 → 内容单元**：`word_basic`、`sense`、`sense_concept`、`sense_history`、`example`、`collocation`、`synonym`、`antonym` 都是独立的可审核对象。
- **版本永不丢失**：AI 原稿保留为 v1，人工修改与重新分析都会生成新版本，可并排查看差异。
- **已通过保护**：`approved` 的内容不会被任何自动流程覆盖，必须显式「解除通过」。
- **两步式生成**：添加单词只生成基本信息与义项清单（约 10–20 秒）；义项深入研究逐个触发，避免一次重跑整份报告。
- **来源诚实**：AI 例句统一标注；开启联网核实后，使用 DeepSeek Search & Fetch 检索正文，并在本地逐字比对，找不到出处或与原文不符的句子直接丢弃。

## 技术栈

Node.js + TypeScript、Express、better-sqlite3（单文件 SQLite）、React + Vite。前后端同一仓库，无微服务、无 ORM、无状态管理库。

## 快速开始

```powershell
# 1. 安装依赖
npm install

# 若 better-sqlite3 编译失败（本机没有 Python / MSVC），改用：
npm install --ignore-scripts
npm run setup:sqlite

# 2. 配置环境变量
Copy-Item .env.example .env

# 3. 初始化数据库
npm run db:migrate

# 4. 开发模式（后端 5174 + 前端 5173）
npm run dev
```

打开 http://127.0.0.1:5173 ，进入「设置与数据」填写 API Base URL、API Key、模型名称，点击「测试连接」。

生产模式：

```powershell
npm run build
npm start        # 由 Express 托管 dist/client，访问 http://127.0.0.1:5174
```

离线开发/测试：把 `.env` 中 `AI_MODE` 改为 `mock`（内置 `suspend` / `spoil` 样例），不会调用真实接口。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `HOST` | 监听地址，默认 `127.0.0.1`（仅本机可访问） |
| `PORT` | 后端端口，默认 `5174` |
| `DB_PATH` | SQLite 文件路径，默认 `data/app.db` |
| `APP_SECRET` | 加密 API Key 的密钥；留空则在 `data/secret.key` 自动生成 |
| `AI_MODE` | `live`（真实调用）或 `mock`（离线样例） |

## 使用流程

1. 首页输入单词 → 自动生成「基本信息 + 义项清单」。
2. 单词页选择某个义项 → 「深入研究此义项」，生成概念解释、词义历史、3–5 条例句、固定搭配、近义词、反义词。
3. 逐条审核：
   - **通过**：进入正式知识库（导出时可只导出已通过内容）。
   - **驳回**：填写意见，意见会永久保存，并在重新分析时作为修改依据。
   - **修改**：直接编辑，保存后生成新版本并回到待审核。
   - **重新分析**：AI 结合原内容、历史意见、同义项上下文重写这一条。
   - **历史**：查看版本差异、修改说明与审核事件流水。
   - **追问**：就这一条内容提问，回答不写入数据库。
4. 「审核中心」可按状态/类型筛选所有待审核内容，跨单词集中处理。
5. 「设置与数据」支持导出 JSON / Markdown、备份与恢复数据库、导入 `vocabulary copy.txt` 作为待研究清单。

## AI 接口

- 兼容 OpenAI Chat Completions 协议：填写 Base URL + API Key + 模型名即可（DeepSeek、OpenAI、Kimi、通义、本地 vLLM/Ollama 等）。
- 默认 `deepseek-flash`，结构化任务建议关闭 thinking（JSON 输出更稳定）。
- 所有模型返回都经过 Zod 校验；校验失败会先做一次「修复为合法 JSON」调用，仍失败则任务失败并保留原始响应，**绝不把未校验数据写入数据库**。
- 联网核实使用 DeepSeek 专有的 Search & Fetch 接口（`/v1/tools/search`、`/v1/tools/fetch`）。非 DeepSeek 服务商时该功能自动禁用，界面会提示。

## 数据库

单文件 SQLite，迁移脚本位于 `server/db/migrations`，启动时自动执行未应用的迁移。

| 表 | 用途 |
| --- | --- |
| `words` | 单词与状态（待研究/已生成概览） |
| `items` | 通用内容单元（kind + payload + 审核状态 + 证据等级） |
| `item_versions` | 每条内容的完整版本历史 |
| `review_events` | 审核事件流水（通过/驳回/修改/重新分析/解除通过） |
| `ai_tasks` | AI 调用日志（请求体已脱敏，不含 Authorization） |
| `settings` | 配置；API Key 以 AES-256-GCM 加密存储 |
| `learning_meta` | 预留的记忆训练字段，v1 不使用 |

备份与恢复都在「设置与数据」页面完成：备份使用 `VACUUM INTO` 生成一致快照；恢复前会自动备份当前库为 `pre-restore-*.db`，并校验上传文件确实是本系统数据库。

## 测试

```powershell
npm run typecheck   # 前后端类型检查
npm test            # Vitest：工具函数 + 完整 API 流程（mock 模式）
```

当前覆盖：JSON 宽松解析、例句原文包含性校验、创建单词→义项生成、审核状态机（含已通过保护）、深入研究、重新分析版本、导出/统计。

## 安全说明

- 服务默认只监听 `127.0.0.1`，无登录、无公网暴露。
- API Key 加密后存于本地数据库，`GET /api/settings` 只返回末四位掩码。
- 前端代码与构建产物中不包含任何密钥；所有 AI 请求由后端发起。
- `ai_tasks` 记录请求体（不含 Authorization 头），便于排查但不会泄露 Key。

## 连接失败排查

界面提示「无法连接 AI 服务：fetch failed」时，说明请求在 Node 网络层就失败了。浏览器能上网不代表 Node 能直连——Node 默认不读取 Windows 系统代理。

1. 先用 Node 复现并看错误码：

```powershell
node -e "fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer sk-test'},body:JSON.stringify({model:'deepseek-flash',messages:[{role:'user',content:'hi'}]})}).then(async r=>console.log('HTTP',r.status)).catch(e=>console.log('CAUSE',e.cause&&e.cause.code,e.message))"
```

2. 按提示处理：
   - `连接超时 / 连接被拒绝`：需要让 Node 走系统代理（下面的命令，端口换成你代理实际端口），然后**重启** `npm run dev`：

```powershell
$env:NODE_USE_ENV_PROXY="1"
$env:HTTPS_PROXY="http://127.0.0.1:7890"
$env:HTTP_PROXY="http://127.0.0.1:7890"
npm run dev
```

   - `DNS 解析失败`：检查 DNS 或网络；可尝试 `$env:NODE_OPTIONS="--dns-result-order=ipv4first"`。
   - `TLS 证书校验失败`：多为杀毒软件/代理的 HTTPS 拦截，用 `$env:NODE_EXTRA_CA_CERTS="C:\path\to\ca.crt"` 导入其根证书。

3. 网络错误会自动重试 4 次（1s/2s/4s 递增），瞬时抖动无需手动处理。

## 已知限制

- 无背单词/间隔复习功能（数据库已预留 `learning_meta` 字段）。
- 例句高亮基于搭配字符串匹配，屈折变化（was suspended / suspend）可能无法命中。
- 联网核实依赖 DeepSeek 搜索接口与目标站点可访问性；失败时会明确提示，不会伪造来源。
- 「真题」来源标签不会被自动打上，只有人工确认的来源才应标注。
