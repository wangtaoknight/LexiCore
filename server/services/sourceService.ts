import { z } from 'zod';
import { fillPrompt, loadPrompt } from '../ai/prompts';
import type { SensePayload } from '../ai/schemas';
import { parseItemPayload } from '../ai/schemas';
import { searchWeb, type SearchResult } from '../ai/search';
import { requestStructured } from '../ai/structured';
import { badRequest, conflict, upstreamError } from '../errors';
import { getItem, listItemsByWord, insertItemWithVersion } from '../repositories/items';
import { getSettings } from '../repositories/settings';
import { createAiTask, finishAiTask } from '../repositories/tasks';
import { getWord, touchWord } from '../repositories/words';
import { containsQuote, normalizeForMatch } from '../utils/textMatch';

const queriesSchema = z.object({
  queries: z.array(z.string().trim().min(2).max(120)).min(1).max(4),
});

const extractionSchema = z.object({
  examples: z
    .array(
      z.object({
        en: z.string().trim().min(8).max(1200),
        cn: z.string().trim().min(1).max(1200),
        meaning: z.string().trim().min(1).max(1500),
        keyWords: z.array(z.string().trim().max(120)).max(12).default([]),
        collocationsInSentence: z.array(z.string().trim().max(120)).max(8).default([]),
        sourceUrl: z.string().trim().max(1000),
        sourceTitle: z.string().trim().max(300).default(''),
        sourceType: z.enum(['dictionary', 'corpus', 'news']).default('news'),
        note: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .max(6),
});

export type SourcedExamplesResult = {
  added: number;
  discarded: number;
  candidates: number;
};

export async function generateSourcedExamples(
  senseItemId: string,
  report: (message: string) => void,
): Promise<SourcedExamplesResult> {
  const sense = getItem(senseItemId);
  if (sense.kind !== 'sense') {
    throw badRequest('只能对「义项」条目获取带来源的例句');
  }

  const settings = getSettings();
  if (!settings.enableSourceVerification) {
    throw conflict('尚未开启例句联网核实，请先到「设置与数据」页面开启');
  }

  const word = getWord(sense.wordId);
  const payload = sense.payload as unknown as SensePayload;
  const system = loadPrompt('system.md');

  report('正在设计用于检索真实例句的关键词…');
  const queryResult = await requestStructured({
    schema: queriesSchema,
    taskType: 'example_queries',
    system,
    user: fillPrompt(loadPrompt('example_queries.md'), {
      WORD: word.lemma,
      POS: payload.pos,
      CN_GLOSS: payload.cnGloss,
      EN_DEFINITION: payload.enDefinition,
    }),
    wordId: word.id,
    itemId: sense.id,
    maxTokens: 800,
  });

  const candidates = new Map<string, SearchResult>();
  for (const query of queryResult.data.queries.slice(0, 3)) {
    report(`正在检索：${query}`);
    try {
      const results = await searchWeb(query, 6);
      for (const result of results) {
        if (result.url && !candidates.has(result.url)) candidates.set(result.url, result);
      }
    } catch (error) {
      report(`检索失败（已跳过）：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (candidates.size === 0) {
    throw upstreamError('没有检索到可用页面，未写入任何例句');
  }

  report(`获得 ${candidates.size} 个候选页面，正在抽取原句…`);

  const list = Array.from(candidates.values()).slice(0, 10);
  const corpusText = list
    .map((result, index) => {
      const body = result.content || result.summary || result.snippet;
      return `[${index + 1}] url: ${result.url}\ntitle: ${result.title}\ncontent: ${body.slice(
        0,
        2500,
      )}`;
    })
    .join('\n\n');

  const taskId = createAiTask({
    taskType: 'examples_sourced',
    requestJson: JSON.stringify({
      queries: queryResult.data.queries,
      urls: list.map((result) => result.url),
    }),
    wordId: word.id,
    itemId: sense.id,
  });

  let extraction: z.infer<typeof extractionSchema>;
  try {
    const result = await requestStructured({
      schema: extractionSchema,
      taskType: 'example_extract',
      system,
      user: fillPrompt(loadPrompt('example_extract.md'), {
        WORD: word.lemma,
        POS: payload.pos,
        CN_GLOSS: payload.cnGloss,
        EN_DEFINITION: payload.enDefinition,
        CORPUS: corpusText,
      }),
      wordId: word.id,
      itemId: sense.id,
      maxTokens: 4000,
    });
    extraction = extractionSchema.parse(result.data);
  } catch (error) {
    finishAiTask({
      id: taskId,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      model: 'extract',
      durationMs: 0,
    });
    throw error;
  }

  report('正在逐条核对原句是否真实存在于来源页面…');

  const existing = listItemsByWord(word.id).filter(
    (item) => item.parentId === sense.id && item.kind === 'example',
  );
  const existingTexts = new Set(
    existing.map((item) => normalizeForMatch(String(item.payload.en ?? ''))),
  );
  let maxSeq = existing.reduce((max, item) => Math.max(max, item.seq), 0);

  let added = 0;
  let discarded = 0;
  const acceptedLog: Array<{ en: string; url: string }> = [];

  for (const example of extraction.examples) {
    const source = list.find((result) => result.url === example.sourceUrl);
    const pool = source ? [source.content, source.summary, source.snippet].join('\n') : '';
    if (!source || !containsQuote(pool, example.en)) {
      discarded += 1;
      continue;
    }
    const normalized = normalizeForMatch(example.en);
    if (existingTexts.has(normalized)) {
      discarded += 1;
      continue;
    }

    maxSeq += 1;
    const itemPayload = parseItemPayload('example', {
      en: example.en,
      cn: example.cn,
      meaning: example.meaning,
      keyWords: example.keyWords,
      collocationsInSentence: example.collocationsInSentence,
      sourceType: example.sourceType,
      sourceTitle: example.sourceTitle || source.siteName || source.title || null,
      sourceUrl: example.sourceUrl,
      sourceVerified: true,
      evidenceType: 'sourced',
      note: example.note ?? '已在本地校验：原句存在于检索到的页面正文中',
    });

    insertItemWithVersion({
      wordId: word.id,
      parentId: sense.id,
      kind: 'example',
      seq: maxSeq,
      pos: payload.pos,
      payload: itemPayload,
      changeSource: 'ai_initial',
    });
    existingTexts.add(normalized);
    added += 1;
    acceptedLog.push({ en: example.en, url: example.sourceUrl });
  }

  finishAiTask({
    id: taskId,
    status: 'succeeded',
    responseRaw: JSON.stringify({ accepted: acceptedLog, discarded, candidates: list.length }),
    model: 'extract',
    durationMs: 0,
  });
  touchWord(word.id);

  report(`校验完成：写入 ${added} 条，丢弃 ${discarded} 条（无法在原文中找到或重复）`);
  return { added, discarded, candidates: list.length };
}
