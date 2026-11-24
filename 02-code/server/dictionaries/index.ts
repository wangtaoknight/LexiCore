import { fetchText, readCache, writeCache } from './fetch';
import { parseCambridge } from './cambridge';
import { parseLongman } from './longman';
import { parseOxford } from './oxford';
import { fetchSkell } from './skell';
import type {
  CollectOptions,
  DictSense,
  SourceId,
  SourceResult,
  WordEvidence,
} from './types';
import { SOURCE_LABEL } from './types';

const URLS: Record<Exclude<SourceId, 'skell'>, (word: string) => string> = {
  oxford: (word) => `https://www.oxfordlearnersdictionaries.com/definition/english/${encodeURIComponent(word)}`,
  longman: (word) => `https://www.ldoceonline.com/dictionary/${encodeURIComponent(word)}`,
  cambridge: (word) => `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(word)}`,
};

type CachedPage = { url: string; html: string };

async function scrapeParseSource(
  source: Exclude<SourceId, 'skell'>,
  word: string,
  options: CollectOptions,
): Promise<SourceResult> {
  const url = URLS[source](word);
  const cached = options.force ? null : await readCache<CachedPage>(source, word, options.maxAgeMs);
  const start = Date.now();

  if (cached) {
    try {
      const parsed = parseBySource(source, word, cached.url, cached.html, 0);
      return { ...parsed, ms: Date.now() - start, cached: true };
    } catch {
      // 缓存解析失败则重新抓取
    }
  }

  const html = await fetchText(url);
  await writeCache(source, word, { url, html });
  return parseBySource(source, word, url, html, Date.now() - start);
}

function parseBySource(
  source: Exclude<SourceId, 'skell'>,
  word: string,
  url: string,
  html: string,
  ms: number,
): SourceResult {
  if (source === 'oxford') return parseOxford(word, url, html, ms);
  if (source === 'longman') return parseLongman(word, url, html, ms);
  return parseCambridge(word, url, html, ms);
}

/** 汇总四个词典的数据；任一来源失败只记录错误，不影响其它来源 */
export async function collectWordEvidence(
  word: string,
  options: CollectOptions = {},
): Promise<WordEvidence> {
  const lemma = word.trim();
  if (!lemma) throw new Error('单词不能为空');

  const sources = await Promise.all([
    ...(['oxford', 'longman', 'cambridge'] as const).map(async (source) => {
      try {
        return await scrapeParseSource(source, lemma, options);
      } catch (error) {
        return {
          source,
          url: URLS[source](lemma),
          ok: false,
          ms: 0,
          error: error instanceof Error ? error.message : String(error),
        } satisfies SourceResult;
      }
    }),
    (async (): Promise<SourceResult> => {
      const cacheKey = `skell`;
      const cached = options.force
        ? null
        : await readCache<SourceResult>(cacheKey, lemma, options.maxAgeMs);
      if (cached) return { ...cached, cached: true };
      try {
        const result = await fetchSkell(lemma);
        await writeCache(cacheKey, lemma, result);
        return result;
      } catch (error) {
        return {
          source: 'skell',
          url: `https://skell.sketchengine.eu/#result?lang=en&query=${encodeURIComponent(lemma)}`,
          ok: false,
          ms: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    })(),
  ]);

  return { word: lemma, fetchedAt: new Date().toISOString(), sources };
}

/** 把证据压缩成一段紧凑文本，供 AI 提示词使用（去重、限量、保留来源） */
export function renderEvidenceForPrompt(evidence: WordEvidence): string {
  const blocks: string[] = [];

  for (const source of evidence.sources) {
    if (!source.ok) {
      blocks.push(`## ${SOURCE_LABEL[source.source]}\n（抓取失败：${source.error ?? '未知原因'}）`);
      continue;
    }

    if (source.source === 'skell' && source.skell) {
      const lines: string[] = [`## ${SOURCE_LABEL.skell}（语料统计）`];
      const collocations = source.skell.collocations
        .slice(0, 6)
        .map(
          (relation) =>
            `- ${relation.relation || '搭配'}：${relation.items
              .slice(0, 10)
              .map((item) => `${item.word}(${item.count})`)
              .join(', ')}`,
        );
      if (collocations.length) lines.push(collocations.join('\n'));
      if (source.skell.similar.length) {
        lines.push(
          `- 近义词（按相似度）：${source.skell.similar
            .slice(0, 20)
            .map((item) => item.word)
            .join(', ')}`,
        );
      }
      if (source.skell.examples.length) {
        lines.push(
          `- 语料例句：\n${source.skell.examples
            .slice(0, 12)
            .map((example) => `  · ${example}`)
            .join('\n')}`,
        );
      }
      blocks.push(lines.join('\n'));
      continue;
    }

    const senses = dedupeSenses(source.senses ?? []);
    const lines: string[] = [
      `## ${SOURCE_LABEL[source.source]}${source.frequency?.length ? `（${source.frequency.join(' / ')}）` : ''}`,
    ];
    senses.slice(0, 8).forEach((sense, index) => {
      const head = [
        `${index + 1}.`,
        sense.pos ? `[${sense.pos}]` : '',
        sense.grammar,
        sense.level,
        sense.definition,
      ]
        .filter(Boolean)
        .join(' ');
      lines.push(head);
      if (sense.definitionCn) lines.push(`   中文：${sense.definitionCn}`);
      if (sense.topics.length) lines.push(`   主题：${sense.topics.join(', ')}`);
      if (sense.examples.length) {
        lines.push(`   例句：${sense.examples.slice(0, 4).map((item) => `“${item}”`).join(' ')}`);
      }
    });
    blocks.push(lines.join('\n'));
  }

  return blocks.join('\n\n');
}

function dedupeSenses(senses: DictSense[]): DictSense[] {
  const seen = new Set<string>();
  const out: DictSense[] = [];
  for (const sense of senses) {
    const key = `${sense.pos}|${sense.definition.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sense);
  }
  return out;
}
