import { MDD, MDX } from 'js-mdict';
import { IRREGULAR_LEMMAS } from './irregular';
import type { DictInfo } from './registry';

/** 同时保持打开的 MDD 数量上限（MDD 可达 2GB+，key 索引占内存） */
const MAX_OPEN_MDD = 2;

const mdxCache = new Map<string, MDX>();
/** 用 Map 的插入顺序实现简单 LRU：最久未使用的在最前面 */
const mddCache = new Map<string, MDD>();

export type EntryHit = {
  /** 实际命中的词条 key（可能不等于用户输入的词） */
  keyText: string;
  html: string;
  /** 输入被还原成了哪个词（用于界面提示） */
  matchedWord: string;
};

function getMdx(dict: DictInfo): MDX {
  const cached = mdxCache.get(dict.id);
  if (cached) return cached;
  const instance = new MDX(dict.mdxPath);
  mdxCache.set(dict.id, instance);
  return instance;
}

function getMdd(dict: DictInfo): MDD | null {
  if (!dict.mddPath) return null;
  const cached = mddCache.get(dict.id);
  if (cached) {
    // 命中后移到末尾，标记为最近使用
    mddCache.delete(dict.id);
    mddCache.set(dict.id, cached);
    return cached;
  }
  const instance = new MDD(dict.mddPath);
  mddCache.set(dict.id, instance);
  while (mddCache.size > MAX_OPEN_MDD) {
    const oldest = mddCache.keys().next().value;
    if (oldest === undefined) break;
    mddCache.delete(oldest);
  }
  return instance;
}

/** 生成查词候选：原词 → 小写 → 不规则表 → 规则还原 */
export function buildCandidates(word: string): string[] {
  const input = word.trim();
  if (!input) return [];
  const lower = input.toLowerCase();
  const list = [input, lower];
  const push = (value: string | undefined) => {
    if (value && value.length > 1 && !list.includes(value)) list.push(value);
  };

  push(lower.replace(/['’]s$/, ''));
  push(IRREGULAR_LEMMAS[lower]);

  const rules: Array<[RegExp, (stem: string) => string[]]> = [
    [/ies$/, (stem) => [`${stem}y`]],
    [/ves$/, (stem) => [`${stem}f`, `${stem}fe`]],
    [/([^aeiou])oes$/, (stem) => [`${stem}o`]],
    [/(ch|sh|ss|x|z)es$/, (stem) => [stem]],
    [/s$/, (stem) => [stem]],
    [/ied$/, (stem) => [`${stem}y`]],
    [/ed$/, (stem) => [stem, `${stem}e`]],
    [/ing$/, (stem) => [stem, `${stem}e`, stem.replace(/(.)\1$/, '$1')]],
    [/ier$/, (stem) => [`${stem}y`]],
    [/iest$/, (stem) => [`${stem}y`]],
    [/er$/, (stem) => [stem, `${stem}e`]],
    [/est$/, (stem) => [stem, `${stem}e`]],
  ];
  for (const [pattern, expand] of rules) {
    if (!pattern.test(lower)) continue;
    const stem = lower.replace(pattern, '$1');
    for (const candidate of expand(stem)) push(candidate);
  }
  return list;
}

/** MDX 词条尾部常带 \r\n\0，统一清掉 */
function cleanEntry(value: string): string {
  return value.replace(/\u0000/g, '').trim();
}

function resolveLink(mdx: MDX, html: string, depth: number): { keyText: string; html: string } | null {
  const cleaned = cleanEntry(html);
  const match = /^@@@LINK=(\S+)/.exec(cleaned);
  if (!match || depth > 2) return null;
  const target = match[1].trim();
  const next = mdx.lookup(target);
  const nextHtml = cleanEntry(next?.definition ?? '');
  if (!nextHtml) return null;
  if (nextHtml.startsWith('@@@LINK=')) return resolveLink(mdx, nextHtml, depth + 1);
  return { keyText: next.keyText || target, html: nextHtml };
}

/** 在单本词典里查词，带词形兜底与 @@@LINK 跳转解析 */
export function lookupEntry(dict: DictInfo, word: string): EntryHit | null {
  const mdx = getMdx(dict);
  for (const candidate of buildCandidates(word)) {
    let result: { keyText: string; definition: string | null } | null = null;
    try {
      result = mdx.lookup(candidate);
    } catch {
      result = null;
    }
    const html = cleanEntry(result?.definition ?? '');
    if (!html) continue;

    if (html.startsWith('@@@LINK=')) {
      const resolved = resolveLink(mdx, html, 0);
      if (resolved) {
        return { keyText: resolved.keyText, html: resolved.html, matchedWord: candidate };
      }
      continue;
    }
    return { keyText: result?.keyText || candidate, html, matchedWord: candidate };
  }
  return null;
}

/** 词典词条总数（复用已打开的 MDX 实例；打开时会一次性解析全部 key） */
export function entryCount(dict: DictInfo): number {
  try {
    const mdx = getMdx(dict);
    return Array.isArray(mdx.keywordList) ? mdx.keywordList.length : 0;
  } catch {
    return 0;
  }
}

export type ResourceResult = { data: Buffer; keyText: string } | null;

/** 从 MDD 读取资源（音频、图片） */
export function readResource(dict: DictInfo, key: string): ResourceResult {
  const mdd = getMdd(dict);
  if (!mdd) return null;
  try {
    const found = mdd.locate(key);
    if (!found?.definition) return null;
    return { data: Buffer.from(found.definition, 'base64'), keyText: found.keyText };
  } catch {
    return null;
  }
}

export type DictRuntimeStatus = {
  id: string;
  mdxLoaded: boolean;
  mddLoaded: boolean;
};

export function runtimeStatus(): DictRuntimeStatus[] {
  return [...mdxCache.keys()].map((id) => ({
    id,
    mdxLoaded: true,
    mddLoaded: mddCache.has(id),
  }));
}

/** 释放所有已打开的词典句柄（重新扫描或关闭服务前调用） */
export function releaseAll(): void {
  mdxCache.clear();
  mddCache.clear();
}
