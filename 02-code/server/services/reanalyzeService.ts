import { itemReanalyzeOutputSchema, parseItemPayload } from '../ai/schemas';
import { fillPrompt, loadPrompt } from '../ai/prompts';
import { requestStructured } from '../ai/structured';
import { mockReanalyzePayload } from '../ai/mock';
import { config } from '../config';
import { getDb } from '../db';
import { conflict } from '../errors';
import { findItem, getItem, listItemsByWord } from '../repositories/items';
import { createAiTask, finishAiTask } from '../repositories/tasks';
import { getWord, touchWord } from '../repositories/words';
import { newId, nowIso } from '../utils/ids';
import { listVersions, recordReviewEvent } from './reviewService';

const KIND_LABELS: Record<string, string> = {
  word_basic: '单词基本信息（音标/词源/历史/核心意义）',
  sense: '义项基本信息（词性/中文译法/英文释义/频率/重要度）',
  sense_concept: '义项的概念解释',
  sense_history: '义项的词义历史',
  example: '例句',
  collocation: '固定搭配',
  synonym: '近义词分析',
  antonym: '反义词分析',
};

function senseContextText(parentId: string): string {
  const sense = findItem(parentId);
  if (!sense) return '（未知义项）';
  const payload = sense.payload;
  return `${String(payload.senseNo ?? '')}. ${String(payload.pos ?? '')} ${String(
    payload.cnGloss ?? '',
  )}；英文释义：${String(payload.enDefinition ?? '')}`;
}

/**
 * 针对单条内容，结合驳回意见重新生成新版本。旧版本永久保留。
 * 已通过的内容必须先解除通过才能重新分析。
 */
export async function reanalyzeItem(
  itemId: string,
  comment: string,
  report: (message: string) => void,
): Promise<ReturnType<typeof getItem>> {
  const item = getItem(itemId);
  if (item.status === 'approved') {
    throw conflict('已通过的内容不能直接重新分析，请先「解除通过」');
  }
  if (item.status === 'reanalyzing') {
    throw conflict('该条目正在重新分析中');
  }

  const word = getWord(item.wordId);
  const previousStatus = item.status;
  const trimmedComment = comment.trim();

  getDb()
    .prepare("UPDATE items SET status = 'reanalyzing', updated_at = ? WHERE id = ?")
    .run(nowIso(), itemId);
  recordReviewEvent({
    itemId,
    action: 'reanalyze_start',
    fromStatus: previousStatus,
    toStatus: 'reanalyzing',
    comment: trimmedComment || null,
    versionNo: item.currentVersion,
  });
  touchWord(item.wordId);

  try {
    report('正在整理原内容、历史意见与同义项上下文…');

    const versions = listVersions(itemId);
    const feedbackHistory =
      versions
        .map((version) => version.feedback)
        .filter((value): value is string => Boolean(value))
        .join('\n---\n') || '（无）';

    const siblings = listItemsByWord(item.wordId).filter(
      (entry) => entry.parentId === item.parentId && entry.id !== item.id,
    );
    const siblingText =
      siblings
        .slice(0, 12)
        .map((entry) => `- ${entry.kind}: ${JSON.stringify(entry.payload).slice(0, 240)}`)
        .join('\n') || '（无）';

    report('正在调用模型生成修订稿…');

    let validated: Record<string, unknown>;
    let taskId: string | null = null;
    let model: string | null = null;
    let changeNote = '';

    if (config.aiMode === 'mock') {
      taskId = createAiTask({
        taskType: `item_reanalyze.${item.kind}`,
        requestJson: JSON.stringify({ itemId, comment: trimmedComment }),
        wordId: item.wordId,
        itemId,
        model: 'mock',
      });
      const mock = mockReanalyzePayload(item.payload, trimmedComment);
      validated = parseItemPayload(item.kind, mock.payload);
      changeNote = mock.changeNote;
      model = 'mock';
      finishAiTask({
        id: taskId,
        status: 'succeeded',
        responseRaw: JSON.stringify(mock),
        model: 'mock',
        durationMs: 0,
      });
    } else {
      const system = loadPrompt('system.md');
      const user = fillPrompt(loadPrompt('item_reanalyze.md'), {
        KIND_LABEL: KIND_LABELS[item.kind] ?? item.kind,
        WORD: word.lemma,
        SENSE_CONTEXT: item.parentId ? senseContextText(item.parentId) : '（单词级内容）',
        PAYLOAD: JSON.stringify(item.payload, null, 2),
        COMMENT: trimmedComment || '（用户未填写具体意见，请根据历史意见整体改进）',
        FEEDBACK_HISTORY: feedbackHistory,
        SIBLINGS: siblingText,
      });

      const result = await requestStructured({
        schema: itemReanalyzeOutputSchema,
        taskType: `item_reanalyze.${item.kind}`,
        system,
        user,
        wordId: item.wordId,
        itemId,
        maxTokens: 9000,
      });
      validated = parseItemPayload(item.kind, result.data.payload);
      changeNote = result.data.changeNote ?? '';
      taskId = result.taskId;
      model = result.model;
    }

    report('校验通过，正在写入新版本…');

    const nextVersion = item.currentVersion + 1;
    const now = nowIso();
    const apply = getDb().transaction(() => {
      getDb()
        .prepare(
          `UPDATE items SET payload = ?, status = 'pending', origin = 'ai', evidence_type = ?,
            current_version = ?, updated_at = ? WHERE id = ?`,
        )
        .run(
          JSON.stringify(validated),
          (validated.evidenceType as string) ?? 'ai_inferred',
          nextVersion,
          now,
          itemId,
        );
      getDb()
        .prepare(
          `INSERT INTO item_versions (id, item_id, version_no, payload, change_source, feedback,
            note, model, ai_task_id, created_at)
           VALUES (?, ?, ?, ?, 'ai_revision', ?, ?, ?, ?, ?)`,
        )
        .run(
          newId(),
          itemId,
          nextVersion,
          JSON.stringify(validated),
          trimmedComment || null,
          changeNote || null,
          model,
          taskId,
          now,
        );
      recordReviewEvent({
        itemId,
        action: 'reanalyze_done',
        fromStatus: 'reanalyzing',
        toStatus: 'pending',
        comment: changeNote || null,
        versionNo: nextVersion,
      });
    });
    apply();

    touchWord(item.wordId);
    report(`已生成 v${nextVersion}，等待再次审核`);
    return getItem(itemId);
  } catch (error) {
    getDb()
      .prepare('UPDATE items SET status = ?, updated_at = ? WHERE id = ?')
      .run(previousStatus, nowIso(), itemId);
    recordReviewEvent({
      itemId,
      action: 'reanalyze_failed',
      fromStatus: 'reanalyzing',
      toStatus: previousStatus,
      comment: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
