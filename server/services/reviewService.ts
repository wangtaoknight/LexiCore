import { getDb } from '../db';
import { conflict } from '../errors';
import { parseItemPayload } from '../ai/schemas';
import type { Item } from '../repositories/items';
import { findItem, getItem } from '../repositories/items';
import { touchWord } from '../repositories/words';
import { newId, nowIso } from '../utils/ids';

export type ItemVersion = {
  id: string;
  versionNo: number;
  payload: Record<string, unknown>;
  changeSource: 'ai_initial' | 'ai_revision' | 'human_edit';
  feedback: string | null;
  note: string | null;
  model: string | null;
  createdAt: string;
};

type VersionRow = {
  id: string;
  version_no: number;
  payload: string;
  change_source: ItemVersion['changeSource'];
  feedback: string | null;
  note: string | null;
  model: string | null;
  created_at: string;
};

export type ReviewEvent = {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment: string | null;
  versionNo: number | null;
  createdAt: string;
};

type EventRow = {
  id: string;
  action: string;
  from_status: string | null;
  to_status: string | null;
  comment: string | null;
  version_no: number | null;
  created_at: string;
};

export function recordReviewEvent(input: {
  itemId: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  comment?: string | null;
  versionNo?: number | null;
}): void {
  getDb()
    .prepare(
      `INSERT INTO review_events (id, item_id, action, from_status, to_status, comment, version_no, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      input.itemId,
      input.action,
      input.fromStatus,
      input.toStatus,
      input.comment ?? null,
      input.versionNo ?? null,
      nowIso(),
    );
}

export function approveItem(itemId: string): Item {
  const item = getItem(itemId);
  if (item.status === 'approved') {
    throw conflict('该条目已经是「已通过」状态');
  }
  if (item.status === 'reanalyzing') {
    throw conflict('该条目正在重新分析，请稍后再审核');
  }
  getDb()
    .prepare("UPDATE items SET status = 'approved', updated_at = ? WHERE id = ?")
    .run(nowIso(), itemId);
  recordReviewEvent({
    itemId,
    action: 'approve',
    fromStatus: item.status,
    toStatus: 'approved',
    versionNo: item.currentVersion,
  });
  touchWord(item.wordId);
  return getItem(itemId);
}

export function rejectItem(itemId: string, comment: string | null): Item {
  const item = getItem(itemId);
  if (item.status === 'approved') {
    throw conflict('已通过的内容不能直接驳回，请先「解除通过」再驳回');
  }
  getDb()
    .prepare("UPDATE items SET status = 'rejected', updated_at = ? WHERE id = ?")
    .run(nowIso(), itemId);
  recordReviewEvent({
    itemId,
    action: 'reject',
    fromStatus: item.status,
    toStatus: 'rejected',
    comment: comment?.trim() || null,
    versionNo: item.currentVersion,
  });
  touchWord(item.wordId);
  return getItem(itemId);
}

export function editItem(itemId: string, payload: unknown): Item {
  const item = getItem(itemId);
  const validated = parseItemPayload(item.kind, payload);
  const nextVersion = item.currentVersion + 1;
  const now = nowIso();

  const apply = getDb().transaction(() => {
    getDb()
      .prepare(
        `UPDATE items SET payload = ?, status = 'pending', origin = 'human', evidence_type = ?,
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
        `INSERT INTO item_versions (id, item_id, version_no, payload, change_source, feedback, note,
          model, ai_task_id, created_at)
         VALUES (?, ?, ?, ?, 'human_edit', NULL, NULL, NULL, NULL, ?)`,
      )
      .run(newId(), itemId, nextVersion, JSON.stringify(validated), now);

    recordReviewEvent({
      itemId,
      action: 'edit',
      fromStatus: item.status,
      toStatus: 'pending',
      comment: '人工修改',
      versionNo: nextVersion,
    });
  });
  apply();

  touchWord(item.wordId);
  return getItem(itemId);
}

export function unpublishItem(itemId: string): Item {
  const item = getItem(itemId);
  if (item.status !== 'approved') {
    throw conflict('只有「已通过」的内容需要解除通过');
  }
  getDb()
    .prepare("UPDATE items SET status = 'pending', updated_at = ? WHERE id = ?")
    .run(nowIso(), itemId);
  recordReviewEvent({
    itemId,
    action: 'unpublish',
    fromStatus: 'approved',
    toStatus: 'pending',
    comment: '解除通过',
    versionNo: item.currentVersion,
  });
  touchWord(item.wordId);
  return getItem(itemId);
}

export function listVersions(itemId: string): ItemVersion[] {
  const rows = getDb()
    .prepare('SELECT * FROM item_versions WHERE item_id = ? ORDER BY version_no DESC')
    .all(itemId) as VersionRow[];
  return rows.map((row) => ({
    id: row.id,
    versionNo: row.version_no,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    changeSource: row.change_source,
    feedback: row.feedback,
    note: row.note,
    model: row.model,
    createdAt: row.created_at,
  }));
}

export function listEvents(itemId: string): ReviewEvent[] {
  const rows = getDb()
    .prepare('SELECT * FROM review_events WHERE item_id = ? ORDER BY created_at DESC')
    .all(itemId) as EventRow[];
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    comment: row.comment,
    versionNo: row.version_no,
    createdAt: row.created_at,
  }));
}

export function requireItem(id: string): Item {
  const item = findItem(id);
  if (!item) throw conflict('内容条目不存在');
  return item;
}
