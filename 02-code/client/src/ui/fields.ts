import type { ItemKind } from '../api/types';

export type FieldType = 'text' | 'textarea' | 'list' | 'select' | 'number';

export type FieldSpec = {
  key: string;
  label: string;
  type: FieldType;
  options?: Array<{ value: string; label: string }>;
  hint?: string;
  nullable?: boolean;
  rows?: number;
};

const FREQ_OPTIONS = [
  { value: 'high', label: '高频' },
  { value: 'mid', label: '中频' },
  { value: 'low', label: '低频' },
];

const IMPORTANCE_OPTIONS = [
  { value: 'high', label: '六级：高' },
  { value: 'mid', label: '六级：中' },
  { value: 'low', label: '六级：低' },
];

const EVIDENCE_OPTIONS = [
  { value: 'verified', label: '已验证（可靠词典/语料）' },
  { value: 'sourced', label: '有来源（可追溯，待人工判断）' },
  { value: 'ai_inferred', label: 'AI推断' },
  { value: 'unverified', label: '待核实（有争议或信息不足）' },
];

const SOURCE_TYPE_OPTIONS = [
  { value: 'cet6', label: '六级真题' },
  { value: 'cet4', label: '四级真题' },
  { value: 'ielts', label: '雅思真题' },
  { value: 'corpus', label: '语料库' },
  { value: 'dictionary', label: '词典' },
  { value: 'news', label: '新闻/网页' },
  { value: 'media', label: '影视台词' },
  { value: 'ai', label: 'AI生成例句' },
];

export const FIELD_SPECS: Record<ItemKind, FieldSpec[]> = {
  word_basic: [
    { key: 'lemma', label: '单词', type: 'text' },
    { key: 'phonetic', label: '音标', type: 'text' },
    { key: 'pos', label: '词性（每行一个）', type: 'list' },
    { key: 'etymology', label: '词源', type: 'textarea', rows: 4 },
    { key: 'semanticHistory', label: '语义演变', type: 'textarea', rows: 4 },
    { key: 'coreMeaning', label: '核心意义', type: 'textarea', rows: 2, nullable: true },
    {
      key: 'coreMeaningNote',
      label: '核心意义说明（为什么可以/不可以归纳）',
      type: 'textarea',
      rows: 2,
      nullable: true,
    },
    { key: 'evidenceType', label: '证据类型', type: 'select', options: EVIDENCE_OPTIONS },
  ],
  sense: [
    { key: 'senseNo', label: '义项编号', type: 'number' },
    { key: 'pos', label: '词性', type: 'text' },
    { key: 'cnGloss', label: '中文参考译法', type: 'text' },
    { key: 'enDefinition', label: '英文释义', type: 'textarea', rows: 3 },
    { key: 'frequency', label: '一般使用频率', type: 'select', options: FREQ_OPTIONS },
    { key: 'cet6Importance', label: '六级重要程度', type: 'select', options: IMPORTANCE_OPTIONS },
    { key: 'usageNote', label: '使用提示', type: 'textarea', rows: 2 },
    { key: 'evidenceType', label: '证据类型', type: 'select', options: EVIDENCE_OPTIONS },
  ],
  sense_concept: [
    { key: 'conceptCn', label: '概念解释', type: 'textarea', rows: 8 },
    { key: 'describedObject', label: '它所描述的对象 / 行为 / 状态 / 关系', type: 'textarea', rows: 3 },
    { key: 'scope', label: '适用范围', type: 'textarea', rows: 3 },
    { key: 'boundary', label: '意义边界：不是什么、容易混淆什么', type: 'textarea', rows: 3 },
    { key: 'misconceptions', label: '容易产生的误解（每行一条）', type: 'list' },
    { key: 'cnContrast', label: '与中文概念的联系和区别', type: 'textarea', rows: 3 },
    { key: 'grammarPatterns', label: '常见语法结构（每行一条）', type: 'list' },
    { key: 'scenarios', label: '典型使用场景（每行一条）', type: 'list' },
    { key: 'evidenceType', label: '证据类型', type: 'select', options: EVIDENCE_OPTIONS },
  ],
  sense_history: [
    { key: 'origin', label: '原始意义', type: 'textarea', rows: 3 },
    { key: 'development', label: '意义如何发展而来', type: 'textarea', rows: 4 },
    { key: 'relations', label: '与其他义项的演变关系', type: 'textarea', rows: 3 },
    { key: 'notableShifts', label: '值得注意的语义变化（每行一条）', type: 'list' },
    { key: 'certaintyNote', label: '不确定性说明', type: 'textarea', rows: 2 },
    { key: 'evidenceType', label: '证据类型', type: 'select', options: EVIDENCE_OPTIONS },
  ],
  example: [
    { key: 'en', label: '英文原句', type: 'textarea', rows: 2 },
    { key: 'cn', label: '中文翻译', type: 'textarea', rows: 2 },
    { key: 'meaning', label: '该句表达的具体含义', type: 'textarea', rows: 2 },
    { key: 'keyWords', label: '重点词汇和搭配（每行一个）', type: 'list' },
    { key: 'collocationsInSentence', label: '句中出现的固定搭配（每行一个）', type: 'list' },
    { key: 'sourceType', label: '来源类型', type: 'select', options: SOURCE_TYPE_OPTIONS },
    { key: 'sourceTitle', label: '来源名称', type: 'text', nullable: true },
    { key: 'sourceUrl', label: '来源链接', type: 'text', nullable: true },
    { key: 'evidenceType', label: '证据类型', type: 'select', options: EVIDENCE_OPTIONS },
  ],
  collocation: [
    { key: 'phrase', label: '英文搭配', type: 'text' },
    { key: 'cn', label: '中文含义', type: 'text' },
    { key: 'grammar', label: '语法结构', type: 'text' },
    { key: 'usageCondition', label: '具体使用条件', type: 'textarea', rows: 2 },
    { key: 'exampleEn', label: '对应例句（英）', type: 'textarea', rows: 2 },
    { key: 'exampleCn', label: '对应例句（中）', type: 'textarea', rows: 2 },
    { key: 'sourceType', label: '例句来源类型', type: 'select', options: SOURCE_TYPE_OPTIONS },
    { key: 'sourceTitle', label: '来源名称', type: 'text', nullable: true },
    { key: 'sourceUrl', label: '来源链接', type: 'text', nullable: true },
    { key: 'evidenceType', label: '证据类型', type: 'select', options: EVIDENCE_OPTIONS },
  ],
  synonym: [
    { key: 'word', label: '近义词', type: 'text' },
    { key: 'coreMeaning', label: '核心含义', type: 'textarea', rows: 2 },
    { key: 'shared', label: '共同点', type: 'textarea', rows: 2 },
    { key: 'difference', label: '具体区别', type: 'textarea', rows: 3 },
    { key: 'usageScene', label: '适用场景', type: 'textarea', rows: 2 },
    { key: 'interchangeable', label: '是否可互换', type: 'select', options: [
      { value: 'true', label: '多数语境可互换' },
      { value: 'false', label: '不能随意互换' },
    ] },
    { key: 'notInterchangeableWhen', label: '不能互换的情况', type: 'textarea', rows: 2 },
    { key: 'evidenceType', label: '证据类型', type: 'select', options: EVIDENCE_OPTIONS },
  ],
  antonym: [
    { key: 'word', label: '反义词', type: 'text' },
    { key: 'coreMeaning', label: '核心含义', type: 'textarea', rows: 2 },
    { key: 'opposition', label: '与当前义项的对立关系', type: 'textarea', rows: 2 },
    { key: 'difference', label: '具体区别', type: 'textarea', rows: 2 },
    { key: 'typicalScene', label: '典型使用场景', type: 'textarea', rows: 2 },
    { key: 'isDirect', label: '是否直接反义', type: 'select', options: [
      { value: 'true', label: '是直接反义词' },
      { value: 'false', label: '非直接反义（语境对立）' },
    ] },
    { key: 'evidenceType', label: '证据类型', type: 'select', options: EVIDENCE_OPTIONS },
  ],
};

const BOOLEAN_FIELDS = new Set(['interchangeable', 'isDirect']);

export function labelForValue(spec: FieldSpec, value: unknown): string {
  if (spec.type === 'select' && spec.options) {
    const key = String(value);
    return spec.options.find((option) => option.value === key)?.label ?? key;
  }
  if (BOOLEAN_FIELDS.has(spec.key)) return value ? '是' : '否';
  return String(value);
}

/** 把 payload 转成表单状态（数组字段用换行连接） */
export function payloadToForm(kind: ItemKind, payload: Record<string, unknown>): Record<string, string> {
  const form: Record<string, string> = {};
  for (const spec of FIELD_SPECS[kind]) {
    const value = payload[spec.key];
    if (Array.isArray(value)) {
      form[spec.key] = value.join('\n');
    } else if (value === null || value === undefined) {
      form[spec.key] = '';
    } else if (BOOLEAN_FIELDS.has(spec.key)) {
      form[spec.key] = value ? 'true' : 'false';
    } else {
      form[spec.key] = String(value);
    }
  }
  return form;
}

/** 把表单状态转回 payload */
export function formToPayload(kind: ItemKind, form: Record<string, string>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const spec of FIELD_SPECS[kind]) {
    const raw = form[spec.key] ?? '';
    if (spec.type === 'list') {
      payload[spec.key] = raw
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    } else if (spec.type === 'number') {
      const value = Number(raw);
      payload[spec.key] = Number.isFinite(value) ? value : 0;
    } else if (BOOLEAN_FIELDS.has(spec.key)) {
      payload[spec.key] = raw === 'true';
    } else if (spec.nullable) {
      payload[spec.key] = raw.trim() === '' ? null : raw.trim();
    } else {
      payload[spec.key] = raw.trim();
    }
  }
  return payload;
}
