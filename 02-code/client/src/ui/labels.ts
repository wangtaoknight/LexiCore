import type { EvidenceType, ItemKind, ItemStatus } from '../api/types';
import type { Item } from '../api/types';

export const FREQ_LABEL: Record<string, string> = {
  high: '高频',
  mid: '中频',
  low: '低频',
};

export const IMPORTANCE_LABEL: Record<string, string> = {
  high: '六级：高',
  mid: '六级：中',
  low: '六级：低',
};

export const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  reanalyzing: '重新分析中',
};

export const EVIDENCE_LABEL: Record<EvidenceType, string> = {
  verified: '已验证',
  sourced: '有来源',
  ai_inferred: 'AI推断',
  unverified: '待核实',
};

export const KIND_LABEL: Record<ItemKind, string> = {
  word_basic: '单词基本信息',
  sense: '义项基本信息',
  sense_concept: '概念解释',
  sense_history: '词义历史',
  example: '例句',
  collocation: '固定搭配',
  synonym: '近义词',
  antonym: '反义词',
};

export const SOURCE_TYPE_LABEL: Record<string, string> = {
  cet4: '四级真题',
  cet6: '六级真题',
  ielts: '雅思真题',
  corpus: '语料库',
  dictionary: '词典',
  news: '新闻/网页',
  media: '影视台词',
  ai: 'AI生成例句',
};

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function itemTitle(item: Item): string {
  const payload = item.payload;
  switch (item.kind) {
    case 'sense':
      return `${String(payload.senseNo ?? '')}. ${String(payload.cnGloss ?? '')}`;
    case 'example': {
      const en = String(payload.en ?? '');
      return en.length > 56 ? `${en.slice(0, 56)}…` : en;
    }
    case 'collocation':
      return String(payload.phrase ?? '');
    case 'synonym':
      return `≈ ${String(payload.word ?? '')}`;
    case 'antonym':
      return `↔ ${String(payload.word ?? '')}`;
    default:
      return KIND_LABEL[item.kind];
  }
}
