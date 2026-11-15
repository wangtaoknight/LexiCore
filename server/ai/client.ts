import { config } from '../config';
import { AppError, badRequest, upstreamError } from '../errors';
import { getSettings, requireApiKey } from '../repositories/settings';
import { createAiTask, finishAiTask } from '../repositories/tasks';
import { mockChatResponse } from './mock';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatOptions = {
  messages: ChatMessage[];
  taskType: string;
  jsonMode?: boolean;
  wordId?: string | null;
  itemId?: string | null;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  /** mock 模式下用于选择样例数据 */
  mockKey?: string;
};

export type ChatResult = {
  content: string;
  model: string;
  taskId: string;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
};

type ChatCompletionResponse = {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null; reasoning_content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string; type?: string; code?: string };
};

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 把底层网络错误翻译成可操作的中文说明，便于判断是代理、DNS 还是证书问题 */
export function describeNetworkError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (
    error as { cause?: { code?: string; message?: string; errno?: string | number } }
  ).cause;
  const code =
    cause?.code ?? (cause?.errno !== undefined ? String(cause.errno) : error.name === 'TypeError' ? '' : error.name);

  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') {
    return '连接超时：可能被防火墙或代理拦截（Node 默认不读取系统代理）';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'DNS 解析失败：请检查网络或 DNS 设置';
  }
  if (code === 'ECONNREFUSED') {
    return '连接被拒绝：请检查代理地址与端口是否正确';
  }
  if (code && /CERT|SSL|TLS/i.test(code)) {
    return `TLS 证书校验失败（${code}）：可能存在代理或杀毒软件的 HTTPS 拦截`;
  }
  return code ? `${error.message}（${code}）` : error.message;
}

export function chatEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) return base;
  return `${base}/chat/completions`;
}

function isDeepSeek(baseUrl: string): boolean {
  return /deepseek\.com/i.test(baseUrl);
}

function mapHttpError(status: number, message: string, raw: string): AppError {
  if (status === 401 || status === 403) {
    return badRequest(`API Key 无效或无权限：${message}`);
  }
  if (status === 402) {
    return badRequest(`账户余额不足：${message}`);
  }
  if (status === 429) {
    return upstreamError(`请求频率受限，请稍后重试：${message}`);
  }
  if (status === 400) {
    return upstreamError(`模型拒绝了请求：${message}`, { raw: raw.slice(0, 2000) });
  }
  return upstreamError(`AI 服务错误（HTTP ${status}）：${message}`, { raw: raw.slice(0, 2000) });
}

function readErrorMessage(raw: string): { message: string; body: ChatCompletionResponse | null } {
  try {
    const body = JSON.parse(raw) as ChatCompletionResponse;
    return { message: body.error?.message ?? raw.slice(0, 500), body };
  } catch {
    return { message: raw.slice(0, 500) || '未知错误', body: null };
  }
}

type StreamResult = {
  content: string;
  model: string | null;
  finishReason: string | null;
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
};

type StreamChunk = {
  model?: string;
  error?: { message?: string };
  choices?: Array<{
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/**
 * 流式读取 Chat Completions（SSE）。
 * 长内容若用非流式请求，客户端在等待生成期间没有数据往来，
 * 容易被防火墙/代理按空闲连接重置（CONNRESET）；流式可保持连接活跃。
 */
async function readStreamCompletion(response: Response): Promise<StreamResult> {
  const reader = response.body?.getReader();
  if (!reader) throw upstreamError('AI 响应没有可读取的流');

  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let model: string | null = null;
  let finishReason: string | null = null;
  let usage: StreamResult['usage'];

  const handleLine = (line: string): void => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return;

    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(payload) as StreamChunk;
    } catch {
      return;
    }
    if (chunk.error) {
      throw upstreamError(`AI 服务中断：${chunk.error.message ?? '未知错误'}`);
    }
    if (chunk.model) model = chunk.model;
    const choice = chunk.choices?.[0];
    if (choice?.delta?.content) content += choice.delta.content;
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (chunk.usage) usage = chunk.usage;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      handleLine(line);
      newlineIndex = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  if (buffer.trim()) handleLine(buffer);

  return { content: content.trim(), model, finishReason, usage };
}

export async function chat(options: ChatOptions): Promise<ChatResult> {
  const settings = getSettings();
  const model = options.model ?? settings.model;
  const maxTokens = options.maxTokens ?? settings.maxTokens;
  const temperature = options.temperature ?? settings.temperature;
  const timeoutMs = options.timeoutMs ?? 180_000;
  const startedAt = Date.now();

  const taskId = createAiTask({
    taskType: options.taskType,
    wordId: options.wordId ?? null,
    itemId: options.itemId ?? null,
    model,
    requestJson: JSON.stringify({
      model,
      messages: options.messages,
      temperature,
      max_tokens: maxTokens,
      json_mode: Boolean(options.jsonMode),
    }),
  });

  if (config.aiMode === 'mock') {
    try {
      const content = mockChatResponse(options.taskType, options.mockKey);
      finishAiTask({
        id: taskId,
        status: 'succeeded',
        responseRaw: content,
        model: `${model} (mock)`,
        durationMs: Date.now() - startedAt,
      });
      return {
        content,
        model: `${model} (mock)`,
        taskId,
        promptTokens: null,
        completionTokens: null,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finishAiTask({ id: taskId, status: 'failed', error: message, model });
      throw upstreamError(`mock 模式不可用：${message}`);
    }
  }

  const apiKey = requireApiKey();
  const url = chatEndpoint(settings.apiBaseUrl);
  const body: Record<string, unknown> = {
    model,
    messages: options.messages,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: maxTokens,
  };
  if (options.jsonMode) body.response_format = { type: 'json_object' };
  if (settings.thinking === 'disabled') {
    if (isDeepSeek(settings.apiBaseUrl)) body.thinking = { type: 'disabled' };
    body.temperature = temperature;
  } else {
    if (isDeepSeek(settings.apiBaseUrl)) {
      body.thinking = { type: 'enabled' };
      body.reasoning_effort = 'high';
    }
    body.temperature = temperature;
  }

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const raw = await response.text();
        const { message } = readErrorMessage(raw);
        if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_ATTEMPTS) {
          lastError = mapHttpError(response.status, message, raw);
          await delay(attempt * 1500);
          continue;
        }
        const mapped = mapHttpError(response.status, message, raw);
        finishAiTask({
          id: taskId,
          status: 'failed',
          responseRaw: raw.slice(0, 20_000),
          error: mapped.message,
          model,
          durationMs: Date.now() - startedAt,
        });
        throw mapped;
      }

      const streamed = await readStreamCompletion(response);
      const content = streamed.content;

      if (!content) {
        const mapped = upstreamError(
          streamed.finishReason === 'content_filter'
            ? '模型因内容审查拒绝生成'
            : '模型返回内容为空（可能触发内容审查或超出输出长度限制）',
          { finishReason: streamed.finishReason ?? null },
        );
        finishAiTask({
          id: taskId,
          status: 'failed',
          responseRaw: null,
          error: mapped.message,
          model: streamed.model ?? model,
          durationMs: Date.now() - startedAt,
        });
        throw mapped;
      }

      if (streamed.finishReason === 'length') {
        const mapped = upstreamError(
          '模型输出达到长度上限被截断，未能返回完整内容。请调高「最大输出 tokens」后重试。',
          { finishReason: 'length', contentLength: content.length },
        );
        finishAiTask({
          id: taskId,
          status: 'failed',
          responseRaw: content.slice(0, 20_000),
          error: mapped.message,
          model: streamed.model ?? model,
          durationMs: Date.now() - startedAt,
        });
        throw mapped;
      }

      const durationMs = Date.now() - startedAt;
      finishAiTask({
        id: taskId,
        status: 'succeeded',
        responseRaw: content.slice(0, 200_000),
        model: streamed.model ?? model,
        promptTokens: streamed.usage?.prompt_tokens ?? null,
        completionTokens: streamed.usage?.completion_tokens ?? null,
        durationMs,
      });
      return {
        content,
        model: streamed.model ?? model,
        taskId,
        promptTokens: streamed.usage?.prompt_tokens ?? null,
        completionTokens: streamed.usage?.completion_tokens ?? null,
        durationMs,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      const aborted = error instanceof Error && error.name === 'AbortError';
      lastError = aborted
        ? upstreamError(`AI 请求超时（${Math.round(timeoutMs / 1000)} 秒）`)
        : upstreamError(`无法连接 AI 服务：${describeNetworkError(error)}`);

      if (attempt < MAX_ATTEMPTS) {
        // 1s → 2s → 4s 递增，给瞬时网络抖动留出恢复时间
        await delay(Math.min(1000 * 2 ** (attempt - 1), 8000));
        continue;
      }
      finishAiTask({
        id: taskId,
        status: 'failed',
        error: lastError instanceof Error ? lastError.message : String(lastError),
        model,
        durationMs: Date.now() - startedAt,
      });
      throw lastError;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof AppError
    ? lastError
    : upstreamError('AI 请求失败，请稍后重试');
}
