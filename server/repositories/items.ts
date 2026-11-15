import { getDb } from '../db';
import { notFound } from '../errors';
import type { ItemKind } from '../ai/schemas';
import { newId, nowIso } from '../utils/ids';

export type ItemStatus = 'pending' | 'approved' | 'rejected' | 'reanalyzing';
export type EvidenceType = 'verified' | 'sourced' | 'ai_inferred' | 'unverified';
export type ChangeSource = 'ai_initial' | 'ai_revision' | 'human_edit';

export type Item = {
  id: string;
  wordId: string;
  parentId: string | null;
  kind: ItemKind;
  seq: number;
  pos: string | null;
  payload: Record<string, unknown>;
  status: ItemStatus;
  evidenceType: EvidenceType;
  origin: 'ai' | 'human';
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
};

type ItemRow = {
  id: string;
  word_id: string;
  parent_id: string | null;
  kind: ItemKind;
  seq: number;
  pos: string | null;
  payload: string;
  status: ItemStatus;
  evidence_type: EvidenceType;
  origin: 'ai' | 'human';
  current_version: number;
  created_at: string;
  updated_at: string;
};

function rowToItem(row: ItemRow): Item {
  return {
    id: row.id,
    wordId: row.word_id,
    parentId: row.parent_id,
    kind: row.kind,
    seq: row.seq,
    pos: row.pos,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
    status: row.status,
    evidenceType: row.evidence_type,
    origin: row.origin,
    currentVersion: row.current_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getItem(id: string): Item {
  const row = getDb().prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
  if (!row) throw notFound('内容条目不存在');
  return rowToItem(row);
}

export function findItem(id: string): Item | null {
  const row = getDb().prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow | undefined;
  return row ? rowToItem(row) : null;
}

export function listItemsByWord(wordId: string): Item[] {
  const rows = getDb()
    .prepare('SELECT * FROM items WHERE word_id = ? ORDER BY seq ASC, created_at ASC')
    .all(wordId) as ItemRow[];
  return rows.map(rowToItem);
}

export function findItemsByKind(wordId: string, kind: ItemKind): Item[] {
  const rows = getDb()
    .prepare('SELECT * FROM items WHERE word_id = ? AND kind = ? ORDER BY seq ASC')
    .all(wordId, kind) as ItemRow[];
  return rows.map(rowToItem);
}

export function insertItemWithVersion(input: {
  wordId: string;
  parentId?: string | null;
  kind: ItemKind;
  seq?: number;
  pos?: string | null;
  payload: Record<string, unknown>;
  evidenceType?: EvidenceType;
  origin?: 'ai' | 'human';
  changeSource: ChangeSource;
  feedback?: string | null;
  note?: string | null;
  model?: string | null;
  aiTaskId?: string | null;
}): Item {
  const db = getDb();
  const now = nowIso();
  const id = newId();
  const evidenceType =
    input.evidenceType ??
    ((input.payload.evidenceType as EvidenceType | undefined) ?? 'ai_inferred');

  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO items (id, word_id, parent_id, kind, seq, pos, payload, status, evidence_type,
        origin, current_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 1, ?, ?)`,
    ).run(
      id,
      input.wordId,
      input.parentId ?? null,
      input.kind,
      input.seq ?? 0,
      input.pos ?? null,
      JSON.stringify(input.payload),
      evidenceType,
      input.origin ?? 'ai',
      now,
      now,
    );

    db.prepare(
      `INSERT INTO item_versions (id, item_id, version_no, payload, change_source, feedback, note,
        model, ai_task_id, created_at)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newId(),
      id,
      JSON.stringify(input.payload),
      input.changeSource,
      input.feedback ?? null,
      input.note ?? null,
      input.model ?? null,
      input.aiTaskId ?? null,
      now,
    );
  });
  create();

  return getItem(id);
}

export function countItemsByStatus(wordId: string): {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
} {
  const rows = getDb()
    .prepare('SELECT status, COUNT(*) AS c FROM items WHERE word_id = ? GROUP BY status')
    .all(wordId) as Array<{ status: ItemStatus; c: number }>;
  const result = { pending: 0, approved: 0, rejected: 0, total: 0 };
  for (const row of rows) {
    result.total += row.c;
    if (row.status === 'pending') result.pending = row.c;
    if (row.status === 'approved') result.approved = row.c;
    if (row.status === 'rejected') result.rejected = row.c;
  }
  return result;
}
