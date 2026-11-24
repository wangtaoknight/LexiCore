import { z } from 'zod';

/** 词典来源标识 */
export const SOURCE_IDS = ['oxford', 'longman', 'cambridge', 'skell'] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const SOURCE_LABEL: Record<SourceId, string> = {
  oxford: 'Oxford Learner’s',
  longman: 'Longman LDOCE',
  cambridge: 'Cambridge',
  skell: 'SkELL',
};

/** 单一词典里的一个义项（不同来源粒度不同，字段按可用性填充） */
export const dictSenseSchema = z.object({
  pos: z.string().trim().default(''),
  /** [countable] / [uncountable] 这类语法标注 */
  grammar: z.string().trim().default(''),
  /** 英文释义 */
  definition: z.string().trim().default(''),
  /** 中文释义（仅剑桥英汉版） */
  definitionCn: z.string().trim().default(''),
  examples: z.array(z.string().trim().min(1)).default([]),
  /** 该义项下的搭配（牛津搭配词典 / 兰根搭配） */
  collocations: z.array(z.string().trim().min(1)).default([]),
  synonyms: z.array(z.string().trim().min(1)).default([]),
  /** CEFR 等级或词频段，如 B2 / S2 */
  level: z.string().trim().default(''),
  /** 该义项的主题标签，如 Transport by car or lorry */
  topics: z.array(z.string().trim().min(1)).default([]),
});
export type DictSense = z.infer<typeof dictSenseSchema>;

export const skellCollocationSchema = z.object({
  /** 语法关系标签，如 verbs with battery / battery + noun */
  relation: z.string().trim().default(''),
  items: z
    .array(
      z.object({
        word: z.string().trim().default(''),
        count: z.number().default(0),
        score: z.number().default(0),
        /** 语料里的真实用例片段 */
        example: z.string().trim().default(''),
      }),
    )
    .default([]),
});
export type SkellCollocation = z.infer<typeof skellCollocationSchema>;

export type SourceResult = {
  source: SourceId;
  url: string;
  ok: boolean;
  error?: string;
  ms: number;
  /** 是否命中了本地缓存 */
  cached?: boolean;
  senses?: DictSense[];
  /** 词频标记，如 ['S2', 'W2'] */
  frequency?: string[];
  /** SkELL 专有数据 */
  skell?: {
    collocations: SkellCollocation[];
    similar: Array<{ word: string; freq: number }>;
    examples: string[];
  };
};

export type WordEvidence = {
  word: string;
  fetchedAt: string;
  sources: SourceResult[];
};

export type CollectOptions = {
  /** 忽略缓存，强制重新抓取 */
  force?: boolean;
  /** 缓存有效期（毫秒），默认 7 天 */
  maxAgeMs?: number;
};
