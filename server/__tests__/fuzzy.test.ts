import { describe, expect, it } from 'vitest';
import { bigramDice, damerauLevenshtein, fuzzyBestMatch, normalizeWord } from '../../client/src/ui/fuzzy';

const LIBRARY = ['suspend', 'battery', 'imminent', 'pregnancy', 'consistent', 'receive'];

describe('normalizeWord', () => {
  it('统一大小写、空白与引号', () => {
    expect(normalizeWord('  Sus  pend ’s ')).toBe("sus pend 's");
  });
});

describe('相似度算法', () => {
  it('Damerau-Levenshtein 把相邻换位记 1 次', () => {
    expect(damerauLevenshtein('suspend', 'suspedn')).toBe(1);
    expect(damerauLevenshtein('suspend', 'suspend')).toBe(0);
  });

  it('bigram Dice 对完全一致返回 1', () => {
    expect(bigramDice('battery', 'battery')).toBe(1);
    expect(bigramDice('battery', 'batteries')).toBeGreaterThan(0.6);
  });
});

describe('fuzzyBestMatch', () => {
  it('完全一致返回 exact', () => {
    expect(fuzzyBestMatch('battery', LIBRARY)).toEqual({
      lemma: 'battery',
      score: 1,
      kind: 'exact',
    });
  });

  it('大小写与空格不影响精确匹配', () => {
    expect(fuzzyBestMatch('  BatTery  ', LIBRARY)?.kind).toBe('exact');
  });

  it('少一个字母仍能命中 suspend', () => {
    const match = fuzzyBestMatch('suspen', LIBRARY);
    expect(match?.lemma).toBe('suspend');
    expect(match?.kind).toBe('strong');
  });

  it('相邻字母换位也能命中', () => {
    expect(fuzzyBestMatch('suspedn', LIBRARY)?.lemma).toBe('suspend');
  });

  it('典型拼写错误 receive 能命中', () => {
    expect(fuzzyBestMatch('recieve', LIBRARY)?.lemma).toBe('receive');
  });

  it('无关单词不返回匹配', () => {
    expect(fuzzyBestMatch('zzz', LIBRARY)).toBeNull();
  });

  it('少于两个字符不匹配', () => {
    expect(fuzzyBestMatch('s', LIBRARY)).toBeNull();
  });
});
