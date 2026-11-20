import { getDb } from '../db';
import { getSchemaVersion } from '../db/migrate';
import type { Item } from '../repositories/items';
import { listItemsByWord } from '../repositories/items';
import { listWords } from '../repositories/words';
import { listEvents, listVersions } from '../services/reviewService';

export type ExportScope = 'approved' | 'all';

type ExportItem = {
  id: string;
  kind: Item['kind'];
  parentId: string | null;
  pos: string | null;
  status: Item['status'];
  evidenceType: Item['evidenceType'];
  origin: Item['origin'];
  currentVersion: number;
  payload: Record<string, unknown>;
  versions: ReturnType<typeof listVersions>;
  events: ReturnType<typeof listEvents>;
};

export function buildExportData(scope: ExportScope): Record<string, unknown> {
  const words = listWords().map((word) => {
    const allItems = listItemsByWord(word.id);
    const items = scope === 'approved' ? allItems.filter((item) => item.status === 'approved') : allItems;
    const ids = new Set(items.map((item) => item.id));

    return {
      lemma: word.lemma,
      status: word.status,
      createdAt: word.createdAt,
      updatedAt: word.updatedAt,
      items: items.map<ExportItem>((item) => ({
        id: item.id,
        kind: item.kind,
        parentId: item.parentId,
        pos: item.pos,
        status: item.status,
        evidenceType: item.evidenceType,
        origin: item.origin,
        currentVersion: item.currentVersion,
        payload: item.payload,
        versions: listVersions(item.id),
        events: listEvents(item.id),
      })),
      omittedPendingItems: scope === 'approved' ? allItems.length - ids.size : 0,
    };
  });

  return {
    app: 'vocabulary-concept-lab',
    exportVersion: 1,
    schemaVersion: getSchemaVersion(),
    scope,
    exportedAt: new Date().toISOString(),
    stats: {
      words: words.length,
      items: words.reduce((sum, word) => sum + word.items.length, 0),
    },
    words,
  };
}

function joinList(value: unknown): string {
  if (!Array.isArray(value)) return String(value ?? '');
  return value.map(String).join('；');
}

function sourceLine(payload: Record<string, unknown>): string {
  const sourceType = String(payload.sourceType ?? 'ai');
  const title = payload.sourceTitle ? String(payload.sourceTitle) : '';
  const url = payload.sourceUrl ? String(payload.sourceUrl) : '';
  const verified = payload.sourceVerified === true ? '已验证' : '待核实';
  const label =
    sourceType === 'ai'
      ? 'AI生成例句'
      : { cet6: '六级真题', cet4: '四级真题', ielts: '雅思真题', corpus: '语料库', dictionary: '词典', news: '网页/新闻', media: '影视' }[
          sourceType
        ] ?? sourceType;
  return [label, title, url, verified].filter(Boolean).join(' · ');
}

export function buildMarkdownExport(scope: ExportScope): string {
  const data = buildExportData(scope) as {
    exportedAt: string;
    words: Array<{
      lemma: string;
      items: ExportItem[];
    }>;
  };

  const lines: string[] = [];
  lines.push(`# 词汇概念知识库（${scope === 'approved' ? '仅已通过内容' : '全部内容'}）`);
  lines.push('');
  lines.push(`导出时间：${new Date(data.exportedAt).toLocaleString('zh-CN')}`);
  lines.push('');

  for (const word of data.words) {
    const basic = word.items.find((item) => item.kind === 'word_basic');
    const senses = word.items
      .filter((item) => item.kind === 'sense')
      .sort((a, b) => Number(a.payload.senseNo ?? 0) - Number(b.payload.senseNo ?? 0));

    lines.push(`## ${word.lemma}`);
    lines.push('');
    if (basic) {
      const payload = basic.payload;
      if (payload.phonetic) lines.push(`音标：${String(payload.phonetic)}`);
      if (Array.isArray(payload.pos) && payload.pos.length > 0) {
        lines.push(`词性：${joinList(payload.pos)}`);
      }
      if (payload.coreMeaning) {
        lines.push('');
        lines.push(`**核心意义**：${String(payload.coreMeaning)}`);
      }
      if (payload.coreMeaningNote) lines.push(`> ${String(payload.coreMeaningNote)}`);
      if (payload.etymology) {
        lines.push('');
        lines.push(`**词源**：${String(payload.etymology)}`);
      }
      if (payload.semanticHistory) {
        lines.push('');
        lines.push(`**语义演变**：${String(payload.semanticHistory)}`);
      }
      lines.push('');
    }

    for (const sense of senses) {
      const payload = sense.payload;
      lines.push(`### 义项 ${String(payload.senseNo)} · ${String(payload.pos)} ${String(payload.cnGloss)}`);
      lines.push('');
      lines.push(`- 英文释义：${String(payload.enDefinition)}`);
      lines.push(
        `- 使用频率：${String(payload.frequency)}｜六级重要程度：${String(payload.cet6Importance)}`,
      );
      if (payload.usageNote) lines.push(`- 使用提示：${String(payload.usageNote)}`);
      lines.push('');

      const children = word.items.filter((item) => item.parentId === sense.id);
      const concept = children.find((item) => item.kind === 'sense_concept');
      const history = children.find((item) => item.kind === 'sense_history');
      const examples = children.filter((item) => item.kind === 'example');
      const collocations = children.filter((item) => item.kind === 'collocation');
      const synonyms = children.filter((item) => item.kind === 'synonym');
      const antonyms = children.filter((item) => item.kind === 'antonym');

      if (concept) {
        lines.push('#### 概念解释');
        lines.push('');
        lines.push(String(concept.payload.conceptCn ?? ''));
        lines.push('');
        if (concept.payload.scope) lines.push(`- 适用范围：${String(concept.payload.scope)}`);
        if (concept.payload.boundary) lines.push(`- 意义边界：${String(concept.payload.boundary)}`);
        if (concept.payload.cnContrast) lines.push(`- 与中文概念的差异：${String(concept.payload.cnContrast)}`);
        if (Array.isArray(concept.payload.misconceptions) && concept.payload.misconceptions.length > 0) {
          lines.push(`- 常见误解：${joinList(concept.payload.misconceptions)}`);
        }
        lines.push('');
      }

      if (history) {
        lines.push('#### 词义历史');
        lines.push('');
        if (history.payload.origin) lines.push(`- 原始意义：${String(history.payload.origin)}`);
        if (history.payload.development) lines.push(`- 演变：${String(history.payload.development)}`);
        if (history.payload.relations) lines.push(`- 与其他义项的关系：${String(history.payload.relations)}`);
        if (Array.isArray(history.payload.notableShifts) && history.payload.notableShifts.length > 0) {
          lines.push(`- 值得注意的变化：${joinList(history.payload.notableShifts)}`);
        }
        lines.push('');
      }

      if (examples.length > 0) {
        lines.push('#### 例句');
        lines.push('');
        examples.forEach((example, index) => {
          lines.push(`${index + 1}. ${String(example.payload.en)}`);
          lines.push(`   - 译文：${String(example.payload.cn)}`);
          if (example.payload.meaning) lines.push(`   - 含义：${String(example.payload.meaning)}`);
          lines.push(`   - 来源：${sourceLine(example.payload)}`);
        });
        lines.push('');
      }

      if (collocations.length > 0) {
        lines.push('#### 固定搭配');
        lines.push('');
        for (const collocation of collocations) {
          lines.push(
            `- **${String(collocation.payload.phrase)}** — ${String(collocation.payload.cn)}（${String(
              collocation.payload.usageCondition ?? '',
            )}）`,
          );
        }
        lines.push('');
      }

      if (synonyms.length > 0) {
        lines.push('#### 近义词');
        lines.push('');
        for (const synonym of synonyms) {
          lines.push(`- **${String(synonym.payload.word)}**：${String(synonym.payload.difference ?? '')}`);
        }
        lines.push('');
      }

      if (antonyms.length > 0) {
        lines.push('#### 反义词');
        lines.push('');
        for (const antonym of antonyms) {
          lines.push(`- **${String(antonym.payload.word)}**：${String(antonym.payload.opposition ?? '')}`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

/** 仅用于调试：导出时统计条目数 */
export function countItems(): number {
  return (getDb().prepare('SELECT COUNT(*) AS c FROM items').get() as { c: number }).c;
}
