import * as cheerio from 'cheerio';
import { cleanText } from './fetch';
import type { DictSense, SourceResult } from './types';

/**
 * Cambridge Dictionary（英英页面）
 * 结构：`.entry-body__el`（一个词性块）→ `.pos.dpos`（词性）、`.epp-xref`（CEFR 等级）
 *       → 每个 `.def-block` 内的 `.def.ddef_d`（释义）与 `.eg.deg`（例句）。
 */
export function parseCambridge(word: string, url: string, html: string, ms: number): SourceResult {
  const $ = cheerio.load(html);
  const senses: DictSense[] = [];
  const levels = new Set<string>();

  $('.entry-body__el').each((blockIndex, block) => {
    if (blockIndex >= 4) return;
    const root = $(block);
    const pos = cleanText(root.find('.pos.dpos').first().text());
    const level = cleanText(root.find('.epp-xref').first().text());
    if (level) levels.add(level);

    root.find('.def-block').each((_, defBlock) => {
      if (senses.length >= 10) return;
      const node = $(defBlock);
      const definition = cleanText(node.find('.def.ddef_d').first().text());
      if (!definition) return;
      const examples = node
        .find('.eg.deg')
        .toArray()
        .map((el) => cleanText($(el).text()))
        .filter((text) => text.length > 0 && text.length < 300)
        .slice(0, 4);
      const definitionCn = cleanText(node.find('.trans.dtrans, .trans').first().text());
      senses.push({
        pos,
        grammar: '',
        definition,
        definitionCn,
        examples,
        collocations: [],
        synonyms: [],
        level,
        topics: [],
      });
    });
  });

  if (senses.length === 0) throw new Error('未解析到义项（页面结构可能已变化）');
  return { source: 'cambridge', url, ok: true, ms, senses, frequency: [...levels] };
}
