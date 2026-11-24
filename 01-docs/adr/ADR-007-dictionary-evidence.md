# ADR-007：用多词典证据驱动 AI（抓取 → 缓存 → 归纳）

- 状态：Proposed（原型已验证，尚未接入正式流程）
- 日期：2026-11

## 背景

当前 `word_overview` / `sense_study` 完全依赖模型自身知识生成释义、例句与搭配，质量不稳定：例句可能是模型编造的"AI 例句"，搭配缺少频次依据，义项划分也缺少外部参照。

牛津、朗文、剑桥三个学习型词典的义项划分、语法标注、例句与词频分级，加上 SKELL 的语料搭配与真实例句，正好覆盖我们需要的全部维度。目标是把它们作为**证据层**，让模型只做归纳与翻译，不再凭空生成。

难点只有一个：**如何稳定、低成本地拿到这些站点的结构化内容**。

## 备选方案与取舍

| 方案 | 稳定性 | 覆盖 | 成本 | 结论 |
| --- | --- | --- | --- | --- |
| A. 官方 API（Oxford Dictionaries API / Sketch Engine API） | 高 | 中（OALD 完整词条需授权版） | 需申请 key、按量计费 | **长期首选**，但需要账号与授权，短期无法验证 |
| B. 第三方聚合 API（Free Dictionary / Wiktionary / Datamuse） | 高 | 低（释义粗、无 OALD 级例句与搭配） | 免费 | 可做兜底，不能做主源 |
| C. 服务端直抓 HTML + cheerio 解析 | 中（受反爬影响） | **高**（四大源全量） | 免费、需自维护选择器 | **本期采用**，实验阶段最现实 |
| D. 无头浏览器（Playwright）抓取 | 中高（能过部分反爬） | 高 | 慢（秒级/页）、占内存 | 作为 C 的降级手段，暂不启用 |
| E. 商用词库/MDX 离线文件 | 高 | 高 | 版权风险 | 不采用（仅限个人研究时也不能分发） |

实测（2026-11-21，普通 Node `fetch` + 桌面 UA）：

| 站点 | 状态 | 说明 |
| --- | --- | --- |
| OALD | 200，约 60KB | 服务端渲染，`li.sense` 结构稳定 |
| LDOCE | 200，约 59KB | 服务端渲染，含 `S2/W2` 词频段 |
| Cambridge | 200，约 380KB | 服务端渲染，含 CEFR 等级 |
| SkELL | 200（JSON 接口） | `concordance` / `wordsketch` / `thesaurus`，参数 `query&lang=English&format=json` |
| Collins / Merriam-Webster | 403 | Cloudflare 挑战页，直接放弃 |

结论：**C 方案在本机可行**，四个源全部拿到结构化数据，无需 key、无需浏览器。

## 决策

1. 新增 `server/dictionaries/` 证据层，与 AI 层解耦：
   - `fetch.ts`：统一 UA、20s 超时、1 次重试、**每域名 1.2s 最小间隔**、磁盘缓存（`data/dict-cache/<source>/<word>.json`，默认 7 天）。
   - `oxford.ts` / `longman.ts` / `cambridge.ts` / `skell.ts`：每个源一个纯解析器，输出统一 `DictSense` / `SourceResult`。
   - `index.ts`：`collectWordEvidence(word)` 四源并行，**任一源失败只记录 error**；`renderEvidenceForPrompt()` 把证据压成紧凑文本。
2. 数据模型统一为「义项 + 释义 + 例句 + 搭配 + 同义 + 等级/频段 + 主题」，来源差异用空值容忍（zod `.default()`）。
3. 后续接入时分三步：`collectWordEvidence` → `word_overview`（用证据定义项与词性标签）→ `sense_study`（按义项取对应证据生成候选，示例/搭配带 `sourceUrl`）。
4. 频次/等级信息（OALD CEFR、LDOCE S/W 段、SkELL count/score）作为**排序与取舍依据**，不直接展示。

## 后果

- **正面**：义项划分有外部基准；例句可用真实语料替换"AI 例句"；搭配带频次，可判断常见程度；全部有 URL 可回溯。
- **负面/风险**：
  - 页面结构变化会导致解析失败 → 解析器需带「未解析到义项」的明确报错，且失败即降级，不阻塞流程。
  - 反爬随时可能收紧（Cloudflare）→ 缓存 + 低频 + 失败降级，必要时切 Playwright 或官方 API。
  - **合规**：上述站点 ToS 一般不授权批量抓取。本项目定位个人研究、单机、低频、结果不外分发；如要公开部署，必须改用官方授权数据（方案 A）。
  - SkELL 匿名使用有每日额度 → 只在「深入研究」时调用，靠缓存复用。
- **观察指标**：四源成功率、单字冷/热耗时、缓存命中率、解析失败的具体来源与原因。
