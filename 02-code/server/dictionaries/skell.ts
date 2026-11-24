import { cleanText, fetchText } from './fetch';
import type { SkellCollocation, SourceResult } from './types';

const API_BASE = 'https://skell.sketchengine.eu/api/';

type SkellConcordanceLine = {
  Left?: Array<{ Str?: string }>;
  Kwic?: Array<{ Str?: string }>;
  Right?: Array<{ Str?: string }>;
};

type SkellConcordance = { Lines?: SkellConcordanceLine[]; Err?: unknown };

type SkellWordSketch = {
  GramRels?: Array<{
    Name?: string;
    Words?: Array<{ Word?: string; Count?: number; Score?: number; Cm?: string }>;
  }>;
  Err?: unknown;
};

type SkellThesaurus = {
  Words?: Array<{ Word?: string; Freq?: number; Score?: number }>;
  Err?: unknown;
};

function joinSegments(segments: Array<{ Str?: string }> | undefined): string {
  return (segments ?? []).map((segment) => segment.Str ?? '').join('');
}

async function getJson<T>(path: string): Promise<T> {
  const text = await fetchText(`${API_BASE}${path}`, { headers: { Accept: 'application/json' } });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('SkELL 返回内容不是合法 JSON');
  }
}

/**
 * SkELL（Sketch Engine 的免费学习版）
 * 三个 GET 接口：concordance / wordsketch / thesaurus，
 * 参数固定为 query=<word>&lang=English&format=json。
 */
export async function fetchSkell(word: string): Promise<SourceResult> {
  const start = Date.now();
  const query = encodeURIComponent(word);
  const base = `${API_BASE}wordsketch?query=${query}&lang=English&format=json`;
  const result: SourceResult = { source: 'skell', url: base, ok: true, ms: 0 };

  const [concordance, wordsketch, thesaurus] = await Promise.allSettled([
    getJson<SkellConcordance>(`concordance?query=${query}&lang=English&format=json`),
    getJson<SkellWordSketch>(`wordsketch?query=${query}&lang=English&format=json`),
    getJson<SkellThesaurus>(`thesaurus?query=${query}&lang=English&format=json`),
  ]);

  const examples: string[] = [];
  if (concordance.status === 'fulfilled') {
    for (const line of concordance.value.Lines ?? []) {
      const sentence = cleanText(
        `${joinSegments(line.Left)}${joinSegments(line.Kwic)}${joinSegments(line.Right)}`,
      );
      if (sentence && sentence.length < 400) examples.push(sentence);
      if (examples.length >= 30) break;
    }
  }

  const collocations: SkellCollocation[] = [];
  if (wordsketch.status === 'fulfilled') {
    for (const relation of wordsketch.value.GramRels ?? []) {
      const items = (relation.Words ?? [])
        .filter((item) => item.Word)
        .slice(0, 12)
        .map((item) => ({
          word: String(item.Word ?? ''),
          count: Number(item.Count ?? 0),
          score: Number(item.Score ?? 0),
          example: cleanText(String(item.Cm ?? '')),
        }));
      if (items.length > 0) {
        collocations.push({
          relation: cleanText(String(relation.Name ?? '')).replace(/%w/g, word),
          items,
        });
      }
    }
  }

  const similar =
    thesaurus.status === 'fulfilled'
      ? (thesaurus.value.Words ?? [])
          .filter((item) => item.Word)
          .slice(0, 30)
          .map((item) => ({ word: String(item.Word ?? ''), freq: Number(item.Freq ?? 0) }))
      : [];

  result.ms = Date.now() - start;
  result.skell = { collocations, similar, examples };

  if (collocations.length === 0 && similar.length === 0 && examples.length === 0) {
    result.ok = false;
    result.error = 'SkELL 未返回可用数据（可能超出匿名额度）';
  }
  return result;
}
