import * as cheerio from 'cheerio';
import { cleanText } from './fetch';
import type { DictSense, SourceResult } from './types';

const MAX_SENSES = 8;
const MAX_EXAMPLES = 5;
const MAX_COLLOCATIONS = 8;

type Node = ReturnType<cheerio.CheerioAPI>;

/**
 * 提取 OALD 的「Oxford Collocations Dictionary」区块：
 * ```
 * <span class="unbox" unbox="snippet">
 *   <span class="box_title">Oxford Collocations Dictionary</span>
 *   <span class="body">
 *     <span class="unbox">adjective</span>
 *     <ul class="collocs_list"><li>free-range</li><li>domestic</li></ul>
 *     <span class="unbox">verb + poultry</span> …
 *   </span>
 * </span>
 * ```
 * 输出形如 `adjective: free-range, domestic` 的字符串，保留关系标签。
 */
function parseCollocationBox($: cheerio.CheerioAPI, root: Node): string[] {
  const out: string[] = [];
  const body = root.find('span.unbox[unbox="snippet"]').first().find('span.body').first();
  if (body.length === 0) return out;

  let relation = '';
  body.children().each((_, child) => {
    const node = $(child);
    if (node.is('span.unbox')) {
      relation = cleanText(node.text());
      return;
    }
    if (node.is('ul')) {
      const words = node
        .find('li')
        .toArray()
        .map((item) => cleanText($(item).text()))
        .filter((text) => text.length > 0 && text.length <= 40 && text !== '…');
      const unique = [...new Set(words)];
      if (unique.length > 0) out.push(`${relation || '搭配'}: ${unique.join(', ')}`);
      relation = '';
    }
  });

  return out.slice(0, MAX_COLLOCATIONS);
}

/** 只取真正的主题名（`.topic_name`），跳过图片缩略图与 “enlarge image” 文案 */
function readTopics($: cheerio.CheerioAPI, root: Node): string[] {
  const topics = root
    .find('.topic .topic_name')
    .toArray()
    .map((el) => cleanText($(el).text()))
    .filter(Boolean);
  return [...new Set(topics)];
}

/**
 * Oxford Advanced Learner's Dictionary
 * 页面为服务端渲染，`li.sense` 内含 grammar / def / x(例) 结构，
 * 搭配词典区块以 `span.unbox[unbox="snippet"]` 挂在义项内部。
 */
export function parseOxford(word: string, url: string, html: string, ms: number): SourceResult {
  const $ = cheerio.load(html);
  const pos = cleanText($('span.pos').first().text());
  const level = cleanText($('.cefr').first().text());
  const entryTopics = readTopics($, $('.entry').first());

  const senses: DictSense[] = [];
  $('li.sense').each((index, el) => {
    if (index >= MAX_SENSES) return;
    const node = $(el);
    const grammar = cleanText(node.find('span.grammar').first().text());
    const definition = cleanText(node.find('span.def').first().text());
    if (!definition) return;

    // 只取义项自身（ul.examples 内）的例句，避免把搭配区块里的词当成句子
    const examples = node
      .find('ul.examples span.x, span.unx')
      .toArray()
      .map((item) => cleanText($(item).text()))
      .filter((text) => text.length > 0 && text.length < 300)
      .slice(0, MAX_EXAMPLES);

    const ownTopics = readTopics($, node);
    const collocations = parseCollocationBox($, node);

    senses.push({
      pos,
      grammar,
      definition,
      definitionCn: '',
      examples,
      collocations,
      synonyms: [],
      level,
      topics: ownTopics.length > 0 ? ownTopics : index === 0 ? entryTopics : [],
    });
  });

  if (senses.length === 0) throw new Error('未解析到义项（页面结构可能已变化）');
  return { source: 'oxford', url, ok: true, ms, senses, frequency: level ? [level] : [] };
}
