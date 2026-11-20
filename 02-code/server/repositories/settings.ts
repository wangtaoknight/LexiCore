import { z } from 'zod';
import { config } from '../config';
import { getDb } from '../db';
import { badRequest } from '../errors';
import { decryptSecret, encryptSecret, maskSecret } from '../utils/crypto';
import { nowIso } from '../utils/ids';

export type ThinkingMode = 'enabled' | 'disabled';

export type InternalSettings = {
  apiBaseUrl: string;
  apiKey: string | null;
  model: string;
  temperature: number;
  maxTokens: number;
  thinking: ThinkingMode;
  searchBaseUrl: string;
  enableSourceVerification: boolean;
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

function toNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? '');
  return Number.isFinite(parsed) ? parsed : fallback;
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
