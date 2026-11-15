export type FuzzyKind = 'exact' | 'strong' | 'weak';

export type FuzzyMatch = {
  /** 匹配到的原始单词（保留库中写法） */
  lemma: string;
  /** 0–1 的综合分 */
  score: number;
  kind: FuzzyKind;
};

/** 与后端 normalizeLemma 保持一致：小写、去首尾空格、合并空格、统一引号与破折号 */
export function normalizeWord(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ');
}

function bigrams(value: string): string[] {
  const result: string[] = [];
  for (let index = 0; index < value.length - 1; index += 1) {
    result.push(value.slice(index, index + 2));
  }
  return result;
}

/** Sørensen–Dice 系数（字符二元组），对词内顺序变化不敏感 */
export function bigramDice(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const left = bigrams(a);
  const right = bigrams(b);
  if (left.length === 0 || right.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const gram of left) counts.set(gram, (counts.get(gram) ?? 0) + 1);

  let overlap = 0;
  for (const gram of right) {
    const remaining = counts.get(gram) ?? 0;
    if (remaining > 0) {
      overlap += 1;
      counts.set(gram, remaining - 1);
    }
  }
  return (2 * overlap) / (left.length + right.length);
}

/** Damerau-Levenshtein（OSA），相邻字母换位记 1 次编辑，能覆盖 suspsned 这类笔误 */
export function damerauLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[a.length][b.length];
}

const STRONG_THRESHOLD = 0.8;
const WEAK_THRESHOLD = 0.62;
const MAX_CANDIDATES = 20;

/**
 * 在给定词库中寻找唯一最佳匹配。
 * - 先按 bigram / 前缀做廉价召回，仅对前 20 个候选计算编辑距离
 * - 综合分 = 0.55×编辑相似度 + 0.30×bigram + 0.15×前缀占比
 * - 低于弱阈值返回 null，宁可不提示也不乱猜
 */
export function fuzzyBestMatch(query: string, lemmas: string[]): FuzzyMatch | null {
  const normalizedQuery = normalizeWord(query);
  if (normalizedQuery.length < 2) return null;

  const candidates: Array<{ lemma: string; normalized: string; cheap: number }> = [];

  for (const lemma of lemmas) {
    const normalized = normalizeWord(lemma);
    if (normalized === normalizedQuery) {
      return { lemma, score: 1, kind: 'exact' };
    }
    const prefixBonus = normalized.startsWith(normalizedQuery) ? 1 : 0;
    const containsBonus = normalized.includes(normalizedQuery) ? 0.6 : 0;
    const dice = bigramDice(normalizedQuery, normalized);
    candidates.push({
      lemma,
      normalized,
      cheap: Math.max(dice, prefixBonus, containsBonus),
    });
  }

  candidates.sort((left, right) => right.cheap - left.cheap);

  let best: FuzzyMatch | null = null;
  for (const candidate of candidates.slice(0, MAX_CANDIDATES)) {
    const distance = damerauLevenshtein(normalizedQuery, candidate.normalized);
    const maxLength = Math.max(normalizedQuery.length, candidate.normalized.length);
    const editSimilarity = maxLength === 0 ? 1 : 1 - distance / maxLength;
    const dice = bigramDice(normalizedQuery, candidate.normalized);

    let commonPrefix = 0;
    while (
      commonPrefix < normalizedQuery.length &&
      commonPrefix < candidate.normalized.length &&
      normalizedQuery[commonPrefix] === candidate.normalized[commonPrefix]
    ) {
      commonPrefix += 1;
    }
    const prefixRatio = maxLength === 0 ? 0 : commonPrefix / maxLength;

    const score = 0.55 * editSimilarity + 0.3 * dice + 0.15 * prefixRatio;
    if (!best || score > best.score) {
      best = {
        lemma: candidate.lemma,
        score,
        kind: score >= STRONG_THRESHOLD ? 'strong' : 'weak',
      };
    }
  }

  if (!best || best.score < WEAK_THRESHOLD) return null;
  return best;
}
