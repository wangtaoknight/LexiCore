import { z } from 'zod';

export const frequencySchema = z.enum(['high', 'mid', 'low']);
export const cet6ImportanceSchema = z.enum(['high', 'mid', 'low']);
export const evidenceTypeSchema = z.enum(['verified', 'sourced', 'ai_inferred', 'unverified']);
export const sourceTypeSchema = z.enum([
  'cet4',
  'cet6',
  'ielts',
  'corpus',
  'dictionary',
  'news',
  'media',
  'ai',
]);

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** 单词基本信息 */
export const wordBasicPayloadSchema = z.object({
  lemma: text(80),
  phonetic: z.string().trim().max(120).default(''),
  pos: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  etymology: text(4000),
  semanticHistory: text(4000),
  coreMeaning: z.string().trim().max(2000).nullable().default(null),
  coreMeaningNote: z.string().trim().max(2000).nullable().default(null),
  evidenceType: evidenceTypeSchema.default('ai_inferred'),
});

/** 义项基本信息 */
export const sensePayloadSchema = z.object({
  senseNo: z.number().int().min(1).max(99),
  pos: text(40),
  /** 词性细节标签：及物/不及物、可数性、语域或学科等（可空） */
  posTags: z.array(z.string().trim().min(1).max(20)).max(6).default([]),
  cnGloss: text(200),
  enDefinition: text(1200),
  frequency: frequencySchema,
  cet6Importance: cet6ImportanceSchema,
  usageNote: z.string().trim().max(2000).default(''),
  evidenceType: evidenceTypeSchema.default('ai_inferred'),
});

/** 概念解释（系统最重要的部分） */
export const senseConceptPayloadSchema = z.object({
  conceptCn: text(6000),
  describedObject: text(2000),
  scope: text(2000),
  boundary: text(3000),
  misconceptions: z.array(z.string().trim().min(1).max(1000)).max(8).default([]),
  cnContrast: text(3000),
  grammarPatterns: z.array(z.string().trim().min(1).max(500)).max(12).default([]),
  scenarios: z.array(z.string().trim().min(1).max(800)).max(10).default([]),
  evidenceType: evidenceTypeSchema.default('ai_inferred'),
});

/** 词义历史 */
export const senseHistoryPayloadSchema = z.object({
  origin: text(4000),
  development: text(4000),
  relations: text(3000),
  notableShifts: z.array(z.string().trim().min(1).max(1000)).max(8).default([]),
  certaintyNote: z.string().trim().max(1500).default(''),
  evidenceType: evidenceTypeSchema.default('ai_inferred'),
});

/** 例句 */
export const examplePayloadSchema = z.object({
  en: text(1200),
  cn: text(1200),
  meaning: text(1500),
  keyWords: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  collocationsInSentence: z.array(z.string().trim().min(1).max(120)).max(8).default([]),
  sourceType: sourceTypeSchema.default('ai'),
  sourceTitle: optionalText(300),
  sourceUrl: optionalText(1000),
  sourceVerified: z.boolean().default(false),
  evidenceType: evidenceTypeSchema.default('ai_inferred'),
  note: optionalText(1000),
});

/** 固定搭配 */
export const collocationPayloadSchema = z.object({
  phrase: text(200),
  cn: text(300),
  grammar: z.string().trim().max(300).default(''),
  usageCondition: text(800),
  exampleEn: text(1200),
  exampleCn: text(1200),
  sourceType: sourceTypeSchema.default('ai'),
  sourceTitle: optionalText(300),
  sourceUrl: optionalText(1000),
  evidenceType: evidenceTypeSchema.default('ai_inferred'),
});

/** 近义词 */
export const synonymPayloadSchema = z.object({
  word: text(80),
  coreMeaning: text(600),
  shared: text(800),
  difference: text(2000),
  usageScene: text(800),
  interchangeable: z.boolean(),
  notInterchangeableWhen: text(1500),
  evidenceType: evidenceTypeSchema.default('ai_inferred'),
});

/** 反义词 */
export const antonymPayloadSchema = z.object({
  word: text(80),
  coreMeaning: text(600),
  opposition: text(1000),
  difference: text(1500),
  typicalScene: text(800),
  isDirect: z.boolean(),
  evidenceType: evidenceTypeSchema.default('ai_inferred'),
});

export const ITEM_KINDS = [
  'word_basic',
  'sense',
  'sense_concept',
  'sense_history',
  'example',
  'collocation',
  'synonym',
  'antonym',
] as const;

export type ItemKind = (typeof ITEM_KINDS)[number];

export const itemPayloadSchemas: Record<ItemKind, z.ZodTypeAny> = {
  word_basic: wordBasicPayloadSchema,
  sense: sensePayloadSchema,
  sense_concept: senseConceptPayloadSchema,
  sense_history: senseHistoryPayloadSchema,
  example: examplePayloadSchema,
  collocation: collocationPayloadSchema,
  synonym: synonymPayloadSchema,
  antonym: antonymPayloadSchema,
};

export function parseItemPayload(kind: ItemKind, value: unknown): Record<string, unknown> {
  const schema = itemPayloadSchemas[kind];
  return schema.parse(value) as Record<string, unknown>;
}

/** 任务输出：单词概览（基本信息 + 义项清单） */
export const wordOverviewOutputSchema = z.object({
  wordBasic: wordBasicPayloadSchema,
  senses: z.array(sensePayloadSchema).min(1).max(12),
});

/** 任务输出：单个义项的深入研究 */
export const senseStudyOutputSchema = z.object({
  concept: senseConceptPayloadSchema,
  history: senseHistoryPayloadSchema,
  examples: z.array(examplePayloadSchema).min(1).max(6),
  collocations: z.array(collocationPayloadSchema).max(8).default([]),
  synonyms: z.array(synonymPayloadSchema).max(6).default([]),
  antonyms: z.array(antonymPayloadSchema).max(6).default([]),
});

/** 任务输出：为某个义项补充反义词候选（允许为空数组，表示确实没有合适反义词） */
export const senseAntonymsOutputSchema = z.object({
  antonyms: z.array(antonymPayloadSchema).max(6).default([]),
});

/** 任务输出：单条内容重新分析 */
export const itemReanalyzeOutputSchema = z.object({
  payload: z.record(z.unknown()),
  changeNote: z.string().trim().max(2000).default(''),
});

export type WordOverviewOutput = z.infer<typeof wordOverviewOutputSchema>;
export type SenseStudyOutput = z.infer<typeof senseStudyOutputSchema>;
export type WordBasicPayload = z.infer<typeof wordBasicPayloadSchema>;
export type SensePayload = z.infer<typeof sensePayloadSchema>;
export type SenseConceptPayload = z.infer<typeof senseConceptPayloadSchema>;
export type SenseHistoryPayload = z.infer<typeof senseHistoryPayloadSchema>;
export type ExamplePayload = z.infer<typeof examplePayloadSchema>;
export type CollocationPayload = z.infer<typeof collocationPayloadSchema>;
export type SynonymPayload = z.infer<typeof synonymPayloadSchema>;
export type AntonymPayload = z.infer<typeof antonymPayloadSchema>;
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
