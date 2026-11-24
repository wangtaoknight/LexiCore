/* 只抓牛津，输出 poultry 的原始数据（HTML 片段 + 解析后 JSON） */
import { writeFileSync } from 'node:fs';
import * as cheerio from 'cheerio';
import { fetchText, readCache, writeCache, cleanText } from '../server/dictionaries/fetch';
import { parseOxford } from '../server/dictionaries/oxford';

async function main(): Promise<void> {
  const word = process.argv[2] ?? 'poultry';
  const url = `https://www.oxfordlearnersdictionaries.com/definition/english/${word}`;

  const cached = await readCache<{ url: string; html: string }>('oxford', word);
  const html = cached?.html ?? (await fetchText(url));
  if (!cached) await writeCache('oxford', word, { url, html });

  writeFileSync(`.tmp-oxford-${word}.html`, html, 'utf8');
  console.log(`HTML ${html.length} 字节，已存 .tmp-oxford-${word}.html，缓存=${Boolean(cached)}`);

  // 原始 DOM 片段（未加工）
  const $ = cheerio.load(html);
  const headword = cleanText($('.headword').first().text() || $('h1').first().text());
  const pos = cleanText($('span.pos').first().text());
  const cefr = cleanText($('.cefr').first().text());
  const freq = $('span.symbols')
    .toArray()
    .map((el) => cleanText($(el).text()))
    .filter(Boolean);

  console.log('\n--- 原始字段 ---');
  console.log('headword:', headword, '| pos:', pos, '| cefr:', cefr, '| symbols:', freq.join(','));

  // 每个 li.sense 的原始文本（未结构化的“脏”文本）
  console.log('\n--- li.sense 原始文本（前 4 条，未加工）---');
  $('li.sense')
    .toArray()
    .slice(0, 4)
    .forEach((el, i) => {
      console.log(`[${i + 1}] ${cleanText($(el).text()).slice(0, 400)}`);
    });

  // 解析后的结构化 JSON（仍未经过 AI）
  const parsed = parseOxford(word, url, html, 0);
  writeFileSync(`.tmp-oxford-${word}.json`, JSON.stringify(parsed, null, 1), 'utf8');
  console.log(`\n--- 解析后 JSON 已写入 .tmp-oxford-${word}.json（${parsed.senses?.length ?? 0} 个义项）---`);
}

void main();
