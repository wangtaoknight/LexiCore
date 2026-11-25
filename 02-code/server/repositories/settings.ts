import { z } from 'zod';
import { config } from '../config';
import { getDb } from '../db';
import { badRequest } from '../errors';
import { decryptSecret, encryptSecret, maskSecret } from '../utils/crypto';
import { nowIso } from '../utils/ids';

export type ThinkingMode = 'enabled' | 'disabled';

/** 单词查询页的显示模式：筛选（默认，顶部标签切换）或列表（全部依次堆叠） */
export type DictViewMode = 'filter' | 'list';

/** 单词查询面板的弹出方式：靠边抽屉（默认）或居中弹窗 */
export type DictPanelMode = 'drawer' | 'popup';

export type InternalSettings = {
  apiBaseUrl: string;
  apiKey: string | null;
  model: string;
  temperature: number;
  maxTokens: number;
  thinking: ThinkingMode;
  searchBaseUrl: string;
  enableSourceVerification: boolean;
  dictViewMode: DictViewMode;
  dictPanelMode: DictPanelMode;
  /** 词条正文缩放百分比，100 = 基准字号 */
  dictFontScale: number;
};

export type PublicSettings = {
  apiBaseUrl: string;
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  model: string;
  temperature: number;
  maxTokens: number;
  thinking: ThinkingMode;
  searchBaseUrl: string;
  enableSourceVerification: boolean;
  dictViewMode: DictViewMode;
  dictPanelMode: DictPanelMode;
  dictFontScale: number;
  aiMode: 'live' | 'mock';
};

const DEFAULTS = {
  api_base_url: 'https://api.deepseek.com',
  api_model: 'deepseek-flash',
  temperature: '0.3',
  max_tokens: '8000',
  thinking: 'disabled',
  search_base_url: 'https://api.deepseek.com',
  enable_source_verification: 'false',
  dict_view_mode: 'filter',
  dict_panel_mode: 'drawer',
  dict_font_scale: '100',
} as const;

export const settingsUpdateSchema = z.object({
  apiBaseUrl: z.string().trim().url('API Base URL 必须是合法地址').max(300).optional(),
  apiKey: z.string().trim().max(400).optional(),
  clearApiKey: z.boolean().optional(),
  model: z.string().trim().min(1, '模型名称不能为空').max(120).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(256).max(200000).optional(),
  thinking: z.enum(['enabled', 'disabled']).optional(),
  searchBaseUrl: z.string().trim().url('搜索服务地址必须是合法地址').max(300).optional(),
  enableSourceVerification: z.boolean().optional(),
  dictViewMode: z.enum(['filter', 'list']).optional(),
  dictPanelMode: z.enum(['drawer', 'popup']).optional(),
  dictFontScale: z.number().int().min(100).max(200).optional(),
});

export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

function readRaw(): Record<string, string> {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function writeRaw(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, nowIso());
}

/** 读取任意设置项原始值（供词典启用状态等辅助功能使用） */
export function getSettingValue(key: string): string | undefined {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

/** 写入任意设置项原始值 */
export function setSettingValue(key: string, value: string): void {
  writeRaw(key, value);
}

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** 词条字号缩放：限制在 100%–200%，非法值回落到 100% */
export function clampFontScale(value: string | undefined): number {
  const parsed = Number(value ?? '');
  if (!Number.isFinite(parsed)) return 100;
  return Math.min(200, Math.max(100, Math.round(parsed)));
}

export function getSettings(): InternalSettings {
  const raw = readRaw();
  let apiKey: string | null = null;
  if (raw.api_key_enc) {
    try {
      apiKey = decryptSecret(raw.api_key_enc);
    } catch {
      apiKey = null;
    }
  }
  return {
    apiBaseUrl: raw.api_base_url || DEFAULTS.api_base_url,
    apiKey,
    model: raw.api_model || DEFAULTS.api_model,
    temperature: toNumber(raw.temperature, Number(DEFAULTS.temperature)),
    maxTokens: toNumber(raw.max_tokens, Number(DEFAULTS.max_tokens)),
    thinking: raw.thinking === 'enabled' ? 'enabled' : 'disabled',
    searchBaseUrl: raw.search_base_url || DEFAULTS.search_base_url,
    enableSourceVerification: raw.enable_source_verification === 'true',
    dictViewMode: raw.dict_view_mode === 'list' ? 'list' : 'filter',
    dictPanelMode: raw.dict_panel_mode === 'popup' ? 'popup' : 'drawer',
    dictFontScale: clampFontScale(raw.dict_font_scale),
  };
}

export function getPublicSettings(): PublicSettings {
  const settings = getSettings();
  return {
    apiBaseUrl: settings.apiBaseUrl,
    apiKeyMasked: settings.apiKey ? maskSecret(settings.apiKey) : null,
    hasApiKey: Boolean(settings.apiKey),
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: settings.maxTokens,
    thinking: settings.thinking,
    searchBaseUrl: settings.searchBaseUrl,
    enableSourceVerification: settings.enableSourceVerification,
    dictViewMode: settings.dictViewMode,
    dictPanelMode: settings.dictPanelMode,
    dictFontScale: settings.dictFontScale,
    aiMode: config.aiMode,
  };
}

export function updateSettings(input: SettingsUpdate): PublicSettings {
  const parsed = settingsUpdateSchema.parse(input);

  if (parsed.apiBaseUrl !== undefined) writeRaw('api_base_url', parsed.apiBaseUrl);
  if (parsed.searchBaseUrl !== undefined) writeRaw('search_base_url', parsed.searchBaseUrl);
  if (parsed.model !== undefined) writeRaw('api_model', parsed.model);
  if (parsed.temperature !== undefined) writeRaw('temperature', String(parsed.temperature));
  if (parsed.maxTokens !== undefined) writeRaw('max_tokens', String(parsed.maxTokens));
  if (parsed.thinking !== undefined) writeRaw('thinking', parsed.thinking);
  if (parsed.enableSourceVerification !== undefined) {
    writeRaw('enable_source_verification', String(parsed.enableSourceVerification));
  }
  if (parsed.dictViewMode !== undefined) writeRaw('dict_view_mode', parsed.dictViewMode);
  if (parsed.dictPanelMode !== undefined) writeRaw('dict_panel_mode', parsed.dictPanelMode);
  if (parsed.dictFontScale !== undefined) writeRaw('dict_font_scale', String(parsed.dictFontScale));

  if (parsed.clearApiKey) {
    getDb().prepare("DELETE FROM settings WHERE key = 'api_key_enc'").run();
  } else if (parsed.apiKey) {
    writeRaw('api_key_enc', encryptSecret(parsed.apiKey));
  }

  return getPublicSettings();
}

export function requireApiKey(): string {
  const { apiKey } = getSettings();
  if (!apiKey) {
    throw badRequest('尚未配置 API Key，请先到「设置与数据」页面填写');
  }
  return apiKey;
}
