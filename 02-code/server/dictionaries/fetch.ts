import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const BASE_HEADERS: Record<string, string> = {
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
  Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
};

export const CACHE_DIR = path.resolve(config.dataDir, 'dict-cache');
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 1200;

const lastRequestAt = new Map<string, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 同一域名的最小请求间隔，避免把对方站点打爆（也降低被风控的概率） */
async function throttle(host: string): Promise<void> {
  const previous = lastRequestAt.get(host) ?? 0;
  const wait = previous + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastRequestAt.set(host, Date.now());
}

export type FetchOptions = {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
};

/** 带超时与重试的文本抓取（失败抛错，由调用方降级） */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const { headers = {}, timeoutMs = 20000, retries = 1 } = options;
  const host = new URL(url).host;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    await throttle(host);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { ...BASE_HEADERS, ...headers },
        redirect: 'follow',
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}${text.includes('Just a moment') ? '（被反爬拦截）' : ''}`);
      }
      if (text.length < 512) throw new Error('返回内容过短，疑似被拦截');
      return text;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(800 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function cachePath(source: string, word: string): string {
  const safe = word.toLowerCase().replace(/[^a-z0-9-]+/g, '_');
  return path.resolve(CACHE_DIR, source, `${safe}.json`);
}

export async function readCache<T>(source: string, word: string, maxAgeMs = DEFAULT_TTL): Promise<T | null> {
  try {
    const file = cachePath(source, word);
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > maxAgeMs) return null;
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeCache(source: string, word: string, data: unknown): Promise<void> {
  try {
    const file = cachePath(source, word);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 1), 'utf8');
  } catch {
    // 缓存失败不影响主流程
  }
}

/** 把 HTML 压成可读文本（保留换行，压缩空白） */
export function cleanText(input: string): string {
  return input
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}
