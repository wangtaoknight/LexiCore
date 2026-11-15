import { config } from '../config';
import { AppError, badRequest, upstreamError } from '../errors';
import { getSettings, requireApiKey } from '../repositories/settings';

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  summary: string;
  content: string;
  siteName: string | null;
  date: string | null;
  authority: number;
};

type RawSearchResult = {
  title?: string;
  url?: string;
  snippet?: string;
  summary?: string;
  content?: string;
  site_name?: string | null;
  date?: string | null;
  authority?: number;
};

function toolsBase(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) base = base.slice(0, -'/chat/completions'.length);
  if (base.endsWith('/v1')) base = base.slice(0, -3);
  return `${base}/v1/tools`;
}

function isDeepSeek(baseUrl: string): boolean {
  return /deepseek\.com/i.test(baseUrl);
}

export function searchAvailable(): boolean {
  const settings = getSettings();
  return isDeepSeek(settings.searchBaseUrl) && Boolean(settings.apiKey || config.aiMode === 'mock');
}

/** 调用 DeepSeek Search API（失败时抛出可读错误，由上层降级） */
export async function searchWeb(query: string, count = 6): Promise<SearchResult[]> {
  if (config.aiMode === 'mock') {
    return [
      {
        title: 'BBC News — Airline cancels flights',
        url: 'https://www.bbc.com/news/mock-article',
        snippet: 'The airline decided to suspend all flights during the storm.',
        summary: 'The airline decided to suspend all flights during the storm, leaving thousands stranded.',
        content:
          'Travel disruption continues. The airline decided to suspend all flights during the storm. Passengers were advised to contact the airline for rebooking.',
        siteName: 'BBC News',
        date: null,
        authority: 3,
      },
    ];
  }

  const apiKey = requireApiKey();
  const settings = getSettings();
  if (!isDeepSeek(settings.searchBaseUrl)) {
    throw conflict('当前 API 服务商不支持搜索接口');
  }

  const response = await fetch(`${toolsBase(settings.searchBaseUrl)}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, count, need_content: true }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw mapSearchError(response.status, raw);
  }

  let parsed: { results?: RawSearchResult[] };
  try {
    parsed = JSON.parse(raw) as { results?: RawSearchResult[] };
  } catch {
    throw upstreamError('搜索服务返回内容不是合法 JSON');
  }

  return (parsed.results ?? []).map((result) => ({
    title: result.title ?? '',
    url: result.url ?? '',
    snippet: result.snippet ?? '',
    summary: result.summary ?? '',
    content: result.content ?? '',
    siteName: result.site_name ?? null,
    date: result.date ?? null,
    authority: typeof result.authority === 'number' ? result.authority : -1,
  }));
}

/** 调用 DeepSeek Fetch API 抓取单页 Markdown 正文 */
export async function fetchPage(url: string): Promise<{ title: string; content: string }> {
  const apiKey = requireApiKey();
  const settings = getSettings();
  if (!isDeepSeek(settings.searchBaseUrl)) {
    throw conflict('当前 API 服务商不支持网页抓取接口');
  }

  const response = await fetch(`${toolsBase(settings.searchBaseUrl)}/fetch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ url }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw mapSearchError(response.status, raw);
  }
  try {
    const parsed = JSON.parse(raw) as { title?: string; content?: string };
    return { title: parsed.title ?? '', content: parsed.content ?? '' };
  } catch {
    throw upstreamError('网页抓取返回内容不是合法 JSON');
  }
}

function conflict(message: string): AppError {
  return new AppError(409, message, { code: 'conflict' });
}

function mapSearchError(status: number, raw: string): AppError {
  let message = raw.slice(0, 300);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    message = parsed.error?.message ?? message;
  } catch {
    // 保留原始片段
  }
  if (status === 401) return badRequest(`搜索服务鉴权失败：${message}`);
  if (status === 402) return badRequest(`搜索服务余额不足：${message}`);
  if (status === 403) return upstreamError(`网页抓取被安全策略拒绝：${message}`);
  if (status === 404) return upstreamError(`目标页面无法抓取：${message}`);
  if (status === 429) return upstreamError(`搜索请求过于频繁，请稍后重试：${message}`);
  return upstreamError(`搜索服务错误（HTTP ${status}）：${message}`);
}
