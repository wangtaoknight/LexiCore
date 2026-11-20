import { z } from 'zod';
import { upstreamError } from '../errors';
import { parseJsonLoose } from '../utils/json';
import { chat } from './client';

export type StructuredResult<T> = {
  data: T;
  taskId: string;
  model: string;
};

function formatZodError(error: z.ZodError): string {
  return error.issues
    .slice(0, 12)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

function tryParse<T>(schema: z.ZodType<T>, text: string): { ok: true; data: T } | { ok: false; error: string } {
  try {
    const json = parseJsonLoose(text);
    const result = schema.safeParse(json);
    if (!result.success) {
      return { ok: false, error: formatZodError(result.error) };
    }
    return { ok: true, data: result.data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * 调用模型并强制结构化输出：
 * 1. JSON 模式调用 → 宽松解析 → Zod 校验
 * 2. 校验失败时发起一次"修复为合法 JSON"的调用
 * 3. 仍失败则抛错，绝不把未校验数据交给上层写库
 */
export async function requestStructured<T>(options: {
  schema: z.ZodType<T>;
  taskType: string;
  system: string;
  user: string;
  wordId?: string | null;
  itemId?: string | null;
  maxTokens?: number;
  mockKey?: string;
}): Promise<StructuredResult<T>> {
  const first = await chat({
    taskType: options.taskType,
    messages: [
      { role: 'system', content: options.system },
      { role: 'user', content: options.user },
    ],
    jsonMode: true,
    wordId: options.wordId,
    itemId: options.itemId,
    maxTokens: options.maxTokens,
    mockKey: options.mockKey,
  });

  const firstParsed = tryParse(options.schema, first.content);
  if (firstParsed.ok) {
    return { data: firstParsed.data, taskId: first.taskId, model: first.model };
  }

  const repair = await chat({
    taskType: `${options.taskType}.repair`,
    messages: [
      { role: 'system', content: options.system },
      { role: 'user', content: options.user },
      { role: 'assistant', content: first.content.slice(0, 30_000) },
      {
        role: 'user',
        content: `上面的 JSON 未通过结构校验：${firstParsed.error}。请只输出修正后的完整 JSON，字段结构与原要求完全一致，不要输出任何其他文字。`,
      },
    ],
    jsonMode: true,
    wordId: options.wordId,
    itemId: options.itemId,
    maxTokens: options.maxTokens,
    mockKey: options.mockKey,
  });

  const secondParsed = tryParse(options.schema, repair.content);
  if (secondParsed.ok) {
    return { data: secondParsed.data, taskId: repair.taskId, model: repair.model };
  }

  throw upstreamError('AI 返回的结构两次都不符合要求，已放弃写入数据库', {
    firstError: firstParsed.error,
    secondError: secondParsed.error,
    firstTaskId: first.taskId,
    repairTaskId: repair.taskId,
  });
}
