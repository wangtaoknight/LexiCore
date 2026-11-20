import { getDb } from '../db';
import { nowIso } from '../utils/ids';
import { newId } from '../utils/ids';

export type AiTaskStatus = 'running' | 'succeeded' | 'failed';

export type AiTaskRow = {
  id: string;
  word_id: string | null;
  item_id: string | null;
  task_type: string;
  request_json: string;
  response_raw: string | null;
  status: AiTaskStatus;
  error: string | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  duration_ms: number | null;
  created_at: string;
  finished_at: string | null;
};

export function createAiTask(input: {
  taskType: string;
  requestJson: string;
  wordId?: string | null;
  itemId?: string | null;
  model?: string | null;
}): string {
  const id = newId();
  getDb()
    .prepare(
      `INSERT INTO ai_tasks (id, word_id, item_id, task_type, request_json, status, model, created_at)
       VALUES (?, ?, ?, ?, ?, 'running', ?, ?)`,
    )
    .run(
      id,
      input.wordId ?? null,
      input.itemId ?? null,
      input.taskType,
      input.requestJson,
      input.model ?? null,
      nowIso(),
    );
  return id;
}

export function finishAiTask(input: {
  id: string;
  status: Exclude<AiTaskStatus, 'running'>;
  responseRaw?: string | null;
  error?: string | null;
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  durationMs?: number | null;
}): void {
  getDb()
    .prepare(
      `UPDATE ai_tasks SET status = ?, response_raw = ?, error = ?, model = ?,
        prompt_tokens = ?, completion_tokens = ?, duration_ms = ?, finished_at = ?
       WHERE id = ?`,
    )
    .run(
      input.status,
      input.responseRaw ?? null,
      input.error ?? null,
      input.model ?? null,
      input.promptTokens ?? null,
      input.completionTokens ?? null,
      input.durationMs ?? null,
      nowIso(),
      input.id,
    );
}

export function listTasksByWord(wordId: string, limit = 50): AiTaskRow[] {
  return getDb()
    .prepare('SELECT * FROM ai_tasks WHERE word_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(wordId, limit) as AiTaskRow[];
}

export function getTask(id: string): AiTaskRow | undefined {
  return getDb().prepare('SELECT * FROM ai_tasks WHERE id = ?').get(id) as AiTaskRow | undefined;
}
