import { getDb } from '../db';
import { badRequest, notFound } from '../errors';
import { newId, nowIso } from '../utils/ids';

export type WordStatus = 'queued' | 'studied';

export type Word = {
  id: string;
  lemma: string;
  status: WordStatus;
  createdAt: string;
  updatedAt: string;
};

export type WordSummary = Word & {
  itemCount: number;
  pendingCount: number;
  approvedCount: number;
  senseCount: number;
};

type WordRow = {
  id: string;
  lemma: string;
  status: WordStatus;
  created_at: string;
  updated_at: string;
};

function rowToWord(row: WordRow): Word {
  return {
    id: row.id,
    lemma: row.lemma,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 只接受英文字母、连字符、空格、撇号 */
export function normalizeLemma(input: string): string {
  const lemma = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!lemma) throw badRequest('请输入英文单词');
  if (lemma.length > 60) throw badRequest('单词过长（最多 60 个字符）');
  if (!/^[a-z][a-z' -]*$/.test(lemma)) {
    throw badRequest('单词只能包含英文字母、空格、连字符或撇号');
  }
  return lemma;
}

export function getWord(id: string): Word {
  const row = getDb().prepare('SELECT * FROM words WHERE id = ?').get(id) as WordRow | undefined;
  if (!row) throw notFound('单词不存在');
  return rowToWord(row);
}

export function findWordByLemma(lemma: string): Word | null {
  const row = getDb().prepare('SELECT * FROM words WHERE lemma = ?').get(lemma) as
    | WordRow
    | undefined;
  return row ? rowToWord(row) : null;
}

export function createWord(lemma: string): Word {
  const row: WordRow = {
    id: newId(),
    lemma,
    status: 'queued',
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  getDb()
    .prepare('INSERT INTO words (id, lemma, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(row.id, row.lemma, row.status, row.created_at, row.updated_at);
  return rowToWord(row);
}

export function updateWordStatus(id: string, status: WordStatus): void {
  getDb()
    .prepare('UPDATE words SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, nowIso(), id);
}

export function touchWord(id: string): void {
  getDb().prepare('UPDATE words SET updated_at = ? WHERE id = ?').run(nowIso(), id);
}

export function deleteWord(id: string): void {
  const result = getDb().prepare('DELETE FROM words WHERE id = ?').run(id);
  if (result.changes === 0) throw notFound('单词不存在');
}

export function listWords(): WordSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT w.*,
        (SELECT COUNT(*) FROM items i WHERE i.word_id = w.id) AS item_count,
        (SELECT COUNT(*) FROM items i WHERE i.word_id = w.id AND i.status = 'pending') AS pending_count,
        (SELECT COUNT(*) FROM items i WHERE i.word_id = w.id AND i.status = 'approved') AS approved_count,
        (SELECT COUNT(*) FROM items i WHERE i.word_id = w.id AND i.kind = 'sense') AS sense_count
      FROM words w
      ORDER BY w.updated_at DESC`,
    )
    .all() as Array<
    WordRow & {
      item_count: number;
      pending_count: number;
      approved_count: number;
      sense_count: number;
    }
  >;

  return rows.map((row) => ({
    ...rowToWord(row),
    itemCount: row.item_count,
    pendingCount: row.pending_count,
    approvedCount: row.approved_count,
    senseCount: row.sense_count,
  }));
}

export function getStats(): {
  wordCount: number;
  studiedWordCount: number;
  pendingItemCount: number;
  approvedItemCount: number;
  rejectedItemCount: number;
  totalItemCount: number;
} {
  const db = getDb();
  const wordCount = (db.prepare('SELECT COUNT(*) AS c FROM words').get() as { c: number }).c;
  const studiedWordCount = (
    db.prepare("SELECT COUNT(*) AS c FROM words WHERE status = 'studied'").get() as { c: number }
  ).c;
  const countByStatus = (status: string): number =>
    (db.prepare('SELECT COUNT(*) AS c FROM items WHERE status = ?').get(status) as { c: number }).c;
  const totalItemCount = (db.prepare('SELECT COUNT(*) AS c FROM items').get() as { c: number }).c;
  return {
    wordCount,
    studiedWordCount,
    pendingItemCount: countByStatus('pending'),
    approvedItemCount: countByStatus('approved'),
    rejectedItemCount: countByStatus('rejected'),
    totalItemCount,
  };
}
