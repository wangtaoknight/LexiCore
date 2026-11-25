# ADR-008：离线 MDX 词典作为查词与证据来源

- 状态：Accepted
- 日期：2026-11

## 背景

ADR-007 评估过四种获取词典数据的方案，当时选择「服务端直抓 HTML」（方案 C）并已跑通原型。但实际推进时有两个无法回避的问题：

1. 牛津 / 朗文 / 剑桥的 ToS 均不允许批量抓取，长期使用有合规风险；
2. 抓取需要联网、受反爬与限流影响，且只能拿到「网页上公开的那部分」，没有发音资源。

用户已自行收集了 8 本 MDX/MDD 词典（OALD9、LDOCE6、CALD4、OALD8 英汉、朗文双解、韦氏、麦克米伦、AHD4），本地使用、不分发。本 ADR 记录方案转向。

## 决策

### 1. 词典以文件形式放在 `04-data/dicts/`

```
04-data/dicts/
  1.Cambridge Advanced Learner's Dictionary 4th/
    CALD4.mdx  CALD4.mdd
  3.Oxford Advanced Learner's Dictionary 9th/
    OALD9EnEn.mdx  OALD9EnEn.mdd  OALD9EnEn.css
  ...
```

- 递归扫描 `**/*.mdx`，`id` = mdx 文件名去扩展名，同名 `.mdd` 自动配对；同目录 `*.css` / `*.js` 作为资源。
- **`.gitignore` 增加 `04-data/dicts/`**：词典体积达数 GB，且不应随仓库分发。
- 通过 `DICT_ROOT` 环境变量可改路径；默认按 `02-code/../04-data/dicts` 探测（兼容从仓库根或 `02-code/` 启动）。

### 2. 解析库选 `js-mdict@7.0.0`

| 候选 | License | 依赖数 | 结论 |
| --- | --- | --- | --- |
| `js-mdict`(terasum) | **AGPL-3.0** | 2 | 采用：TS、CJS+ESM、依赖极少 |
| `mdict-js`(tonyzhou1890) | MIT | 20+ | 备选：需要 MIT 时替换 |
| `mdict`(jeka-kiselyov) | MIT | 3 | 不采用：2012 年停更 |

AGPL 只约束「分发 / 对外提供服务」，本地自用不受影响。**若将来对外部署，必须先换 MIT 实现或取得商业授权。**

### 3. 词条用 iframe 渲染，由服务端重写资源引用

MDX 词条的 HTML 依赖词典自带的 CSS/JS，且 class 名（`.def`、`.pos`、`.x`）与本站样式必然冲突，因此：

- `GET /api/dicts/:id/render?word=` 返回完整 HTML 文档，若 iframe 使用；
- 服务端在返回前做四类重写：
  - `<link href>` / `<script src>` / `<img src>` 相对路径 → `/api/dicts/:id/asset/...`
  - `sound://xxx.mp3` → `/api/dicts/:id/audio?key=xxx.mp3`，并注入点击播放脚本
  - `entry://#anchor` → `#anchor`；`entry://word` → 同词典的 render 地址
- `GET /api/dicts/:id/asset/*` 先找词典目录里的真实文件，找不到再回落到 MDD 资源（图片、字体都在 MDD 里）；
- 资源路径做了 `path.normalize` + 前缀校验，防止路径穿越。

### 4. 实例与内存

- MDX 实例按词典缓存（索引几十 MB 量级）；
- MDD 是 GB 级文件，按 **LRU 最多同时打开 2 本**；`MDD.locate` 返回 base64，路由解码后直接下发。
- 实测：MDX 首次打开 90–150 ms，查询 1–2 ms；MDD 首次打开 94–516 ms，之后 locate 1–2 ms。

### 5. 词形兜底

`buildCandidates()` 生成候选序列：原词 → 小写 → 去 `'s` → 不规则表（约 200 条）→ 规则还原（`-s/-es/-ed/-ing/-ies/-er/-est`、双写辅音）。

## 后果

- **正面**：完全离线，不依赖网络与反爬；词条样式与发音保真；每个词条都能追到「哪本词典的哪个 key」，为后续 AI 生成时标注来源提供基础。
- **负面 / 风险**：
  - AGPL 约束（见上）；
  - MDD 常驻内存，长时间使用需关注内存占用；
  - `.spx` 音频（CALD4）浏览器普遍不支持解码，点击会静默失败；
  - 词形兜底是启发式，`unhappier`、`better-known` 这类组合词可能查不到；
  - 词条 HTML 结构因词典而异，后续若要做「结构化抽取喂给 AI」，仍需按词典适配。

## 与 ADR-007 的关系

ADR-007 的「HTTP 抓取」方案保留在代码里（`server/dictionaries/{oxford,longman,cambridge,skell}.ts`），但**默认不启用**，仅作为对照实验。将来若做「词典证据 → AI 生成」的接入，优先使用本 ADR 的 MDX 来源。
