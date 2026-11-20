# ADR-004：长文本生成一律走 SSE 流式

- 状态：Accepted
- 日期：2026-11

## 背景

`sense_study` 一次要产出概念解释、词义历史、3–6 条例句、搭配与近反义词，输出可达上万 token，生成耗时 30–60 秒。最初使用普通（非流式）请求，实测在 18–28 秒处被中间设备（代理/防火墙）按空闲连接重置，报 `ECONNRESET`，任务随机失败。

## 决策

`chat()` 统一使用流式调用：

```js
{ stream: true, stream_options: { include_usage: true } }
```

由 `readStreamCompletion()` 增量读取 SSE 并拼接 `delta.content`，同时记录 `finish_reason` 与 `usage`。

配套的明确失败语义：

| 情况 | 处理 |
| --- | --- |
| `finish_reason === 'length'` | 明确报「输出达到长度上限被截断，请调高 max_tokens」 |
| 内容为空 | 报「模型返回内容为空」（疑似内容审查/超长） |
| HTTP 408/429/5xx | 退避重试 4 次（1s → 2s → 4s） |
| 网络层错误 | `describeNetworkError()` 翻译为 DNS / 代理 / TLS 等可操作提示 |

## 后果

- **正面**：连接全程有数据往来，长时间生成不再被重置；可拿到 token 用量用于成本观察。
- **负面**：需要自己实现 SSE 解析（按 `\n` 切分、处理 `data:` 前缀与 `[DONE]`）；错误处理分支变多。
- **注意**：这只是「传输层保活」，不改变模型侧的超时；`timeoutMs` 仍为 180s。
