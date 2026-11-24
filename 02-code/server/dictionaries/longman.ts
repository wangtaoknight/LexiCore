import * as cheerio from 'cheerio';
import { cleanText } from './fetch';
import type { DictSense, SourceResult } from './types';

/**
 * Longman Dictionary of Contemporary English
 * `.Sense` 内含 `.DEF`（释义）、`.EXAMPLE`（例句）、`.GRAM`（语法标注）、`.signpost`（义项提示词）。
 * LDOCE 额外提供口语/书面语词频段（S1-S3 / W1-W3），对判断"高频义项"很有价值。
 */
export function parseLongman(word: string, url: string, html: string, ms: number): SourceResult {
  const $ = cheerio.load(html);
  const pos = cleanText($('span.POS').first().text());
  const frequency = $('.FREQ, .W')
    .toArray()
    .map((el) => cleanText($(el).text()))
    .filter(Boolean);

  const senses: DictSense[] = [];
  $('.Sense').each((index, el) => {
    if (index >= 8) return;
    const node = $(el);
    const definition = cleanText(node.find('.DEF').first().text());
    if (!definition) return;
    const grammar = cleanText(node.find('.GRAM').first().text());
    const signpost = cleanText(node.find('.signpost, .SIGNPOST').first().text());
    const examples = node
      .find('.EXAMPLE')
      .toArray()
      .map((item) => cleanText($(item).text()))
      .filter((text) => text.length > 0 && text.length < 300)
      .slice(0, 5);
    const synonyms = node
      .find('.SYN, .Exp')
      .toArray()
      .map((item) => cleanText($(item).text()))
      .filter((text) => text.length > 0 && text.length < 60)
      .slice(0, 6);
    senses.push({
      pos,
      grammar,
      definition: signpost ? `${signpost}: ${definition}` : definition,
      definitionCn: '',
      examples,
      collocations: [],
      synonyms,
      level: '',
      topics: [],
    });
  });

  if (senses.length === 0) throw new Error('未解析到义项（页面结构可能已变化）');
  return { source: 'longman', url, ok: true, ms, senses, frequency };
}
