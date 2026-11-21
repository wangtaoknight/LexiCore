import type { SensePayload } from '../ai/schemas';
import {
  senseAntonymsOutputSchema,
  senseStudyOutputSchema,
  wordOverviewOutputSchema,
} from '../ai/schemas';
import { loadPrompt, fillPrompt } from '../ai/prompts';
import { requestStructured } from '../ai/structured';
import { getDb } from '../db';
import { badRequest, conflict, upstreamError } from '../errors';
import {
  findItemsByKind,
  getItem,
  insertItemWithVersion,
  listItemsByWord,
} from '../repositories/items';
import { getWord, updateWordStatus } from '../repositories/words';

export type GeneratedOverview = {
  lemma: string;
  senseCount: number;
};

export async function generateWordOverview(
  wordId: string,
  report: (message: string) => void,
): Promise<GeneratedOverview> {
  const word = getWord(wordId);
  if (findItemsByKind(wordId, 'word_basic').length > 0) {
    throw conflict('该单词已有概览。如需重新生成，请到单词页对具体条目重新分析。');
  }

  report('正在调用模型：梳理词汇基本信息与义项清单…');
  const system = loadPrompt('system.md');
  const user = fillPrompt(loadPrompt('word_overview.md'), { WORD: word.lemma });

  const { data, taskId, model } = await requestStructured({
    schema: wordOverviewOutputSchema,
    taskType: 'word_overview',
    system,
    user,
    wordId,
    maxTokens: 6000,
    mockKey: word.lemma,
  });

  report(`模型返回 ${data.senses.length} 个义项，正在校验并写入数据库…`);

  const db = getDb();
  const write = db.transaction(() => {
    insertItemWithVersion({
      wordId,
      kind: 'word_basic',
      seq: 0,
      pos: null,
      payload: data.wordBasic as Record<string, unknown>,
      changeSource: 'ai_initial',
      model,
      aiTaskId: taskId,
    });

    data.senses.forEach((sense, index) => {
      insertItemWithVersion({
        wordId,
        kind: 'sense',
        seq: index + 1,
        pos: sense.pos,
        payload: sense as Record<string, unknown>,
        changeSource: 'ai_initial',
        model,
        aiTaskId: taskId,
      });
    });

    updateWordStatus(wordId, 'studied');
  });
  write();

  report('已写入数据库，全部条目处于待审核状态');
  return { lemma: word.lemma, senseCount: data.senses.length };
}

export type GeneratedAntonyms = {
  count: number;
};

/**
 * 只为某个义项补充反义词候选（模块 5 缺反义词时的手动触发）。
 * 写入的条目仍然是 pending，需要人工审核。
 */
export async function generateSenseAntonyms(
  senseItemId: string,
  report: (message: string) => void,
): Promise<GeneratedAntonyms> {
  const sense = getItem(senseItemId);
  if (sense.kind !== 'sense') {
    throw badRequest('只能对「义项」条目补充反义词');
  }

  const existing = listItemsByWord(sense.wordId).filter(
    (item) => item.parentId === sense.id && item.kind === 'antonym',
  );
  if (existing.length > 0) {
    throw conflict('该义项已有反义词。如需调整，请对具体条目使用「修改」或「重新分析」。');
  }

  const word = getWord(sense.wordId);
  const payload = sense.payload as unknown as SensePayload;

  report(`正在为义项 ${payload.senseNo} 生成反义词候选…`);
  const system = loadPrompt('system.md');
  const user = fillPrompt(loadPrompt('sense_antonyms.md'), {
    WORD: word.lemma,
    SENSE_NO: String(payload.senseNo),
    POS: payload.pos,
    CN_GLOSS: payload.cnGloss,
    EN_DEFINITION: payload.enDefinition,
  });

  const { data, taskId, model } = await requestStructured({
    schema: senseAntonymsOutputSchema,
    taskType: 'sense_antonyms',
    system,
    user,
    wordId: word.id,
    itemId: sense.id,
    maxTokens: 3000,
    mockKey: `${word.lemma}#${payload.senseNo}`,
  });

  const antonyms = data.antonyms ?? [];
  if (antonyms.length === 0) {
    throw upstreamError('模型认为该义项没有合适的直接反义词，已放弃写入');
  }

  const db = getDb();
  const write = db.transaction(() => {
    antonyms.forEach((antonym, index) => {
      insertItemWithVersion({
        wordId: word.id,
        parentId: sense.id,
        kind: 'antonym',
        seq: index + 1,
        pos: payload.pos,
        payload: antonym as Record<string, unknown>,
        changeSource: 'ai_initial',
        model,
        aiTaskId: taskId,
      });
    });
  });
  write();

  report(`已写入 ${antonyms.length} 条待审核反义词`);
  return { count: antonyms.length };
}

export type GeneratedSenseStudy = {
  senseNo: number;
  exampleCount: number;
  synonymCount: number;
  antonymCount: number;
};

/**
 * 对单个义项生成完整研究内容：概念解释、词义历史、例句、固定搭配、近义词、反义词。
 * 所有子条目都挂在义项条目下，初始状态 pending。
 */
export async function generateSenseStudy(
  senseItemId: string,
  report: (message: string) => void,
): Promise<GeneratedSenseStudy> {
  const sense = getItem(senseItemId);
  if (sense.kind !== 'sense') {
    throw badRequest('只能对「义项」条目生成深入研究');
  }

  const existingChildren = listItemsByWord(sense.wordId).filter(
    (item) => item.parentId === sense.id,
  );
  if (existingChildren.length > 0) {
    throw conflict('该义项已有研究内容。如需更新，请对具体条目使用「重新分析」。');
  }

  const word = getWord(sense.wordId);
  const payload = sense.payload as unknown as SensePayload;
  const basicItem = findItemsByKind(word.id, 'word_basic')[0];
  const coreMeaning = basicItem ? String(basicItem.payload.coreMeaning ?? '') : '';
  const otherSenses = findItemsByKind(word.id, 'sense')
    .filter((item) => item.id !== sense.id)
    .map((item) => {
      const other = item.payload as unknown as SensePayload;
      return `${other.senseNo}. ${other.pos} ${other.cnGloss}`;
    })
    .join('\n');

  report(`正在生成义项 ${payload.senseNo} 的概念解释、历史、例句、搭配与近反义词…`);

  const system = loadPrompt('system.md');
  const user = fillPrompt(loadPrompt('sense_study.md'), {
    WORD: word.lemma,
    SENSE_NO: String(payload.senseNo),
    POS: payload.pos,
    CN_GLOSS: payload.cnGloss,
    EN_DEFINITION: payload.enDefinition,
    CORE_MEANING: coreMeaning || '（未归纳）',
    OTHER_SENSES: otherSenses || '（无其他义项）',
  });

  const { data, taskId, model } = await requestStructured({
    schema: senseStudyOutputSchema,
    taskType: 'sense_study',
    system,
    user,
    wordId: word.id,
    itemId: sense.id,
    maxTokens: 14000,
    mockKey: `${word.lemma}#${payload.senseNo}`,
  });

  report('结构校验通过，正在写入数据库…');

  const collocations = data.collocations ?? [];
  const synonyms = data.synonyms ?? [];
  const antonyms = data.antonyms ?? [];

  const db = getDb();
  const write = db.transaction(() => {
    insertItemWithVersion({
      wordId: word.id,
      parentId: sense.id,
      kind: 'sense_concept',
      seq: 1,
      pos: payload.pos,
      payload: data.concept as Record<string, unknown>,
      changeSource: 'ai_initial',
      model,
      aiTaskId: taskId,
    });
    insertItemWithVersion({
      wordId: word.id,
      parentId: sense.id,
      kind: 'sense_history',
      seq: 2,
      pos: payload.pos,
      payload: data.history as Record<string, unknown>,
      changeSource: 'ai_initial',
      model,
      aiTaskId: taskId,
    });
    data.examples.forEach((example, index) => {
      insertItemWithVersion({
        wordId: word.id,
        parentId: sense.id,
        kind: 'example',
        seq: index + 1,
        pos: payload.pos,
        payload: example as Record<string, unknown>,
        changeSource: 'ai_initial',
        model,
        aiTaskId: taskId,
      });
    });
    data.collocations?.forEach((collocation, index) => {
      insertItemWithVersion({
        wordId: word.id,
        parentId: sense.id,
        kind: 'collocation',
        seq: index + 1,
        pos: payload.pos,
        payload: collocation as Record<string, unknown>,
        changeSource: 'ai_initial',
        model,
        aiTaskId: taskId,
      });
    });
    data.synonyms?.forEach((synonym, index) => {
      insertItemWithVersion({
        wordId: word.id,
        parentId: sense.id,
        kind: 'synonym',
        seq: index + 1,
        pos: payload.pos,
        payload: synonym as Record<string, unknown>,
        changeSource: 'ai_initial',
        model,
        aiTaskId: taskId,
      });
    });
    data.antonyms?.forEach((antonym, index) => {
      insertItemWithVersion({
        wordId: word.id,
        parentId: sense.id,
        kind: 'antonym',
        seq: index + 1,
        pos: payload.pos,
        payload: antonym as Record<string, unknown>,
        changeSource: 'ai_initial',
        model,
        aiTaskId: taskId,
      });
    });
  });
  write();

  report(
    `已写入 ${1 + 1 + data.examples.length + collocations.length + synonyms.length + antonyms.length} 条待审核内容`,
  );

  return {
    senseNo: payload.senseNo,
    exampleCount: data.examples.length,
    synonymCount: synonyms.length,
    antonymCount: antonyms.length,
  };
}
