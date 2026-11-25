import * as cheerio from 'cheerio';
import type { DictInfo } from './registry';

const API_PREFIX = '/api/dicts';

function isRelative(url: string): boolean {
  return Boolean(url) && !/^(https?:|data:|blob:|\/\/|#)/i.test(url);
}

function assetUrl(dictId: string, relative: string): string {
  const clean = relative.replace(/^\.\//, '').replace(/^\/+/, '');
  return `${API_PREFIX}/${encodeURIComponent(dictId)}/asset/${clean.split('/').map(encodeURIComponent).join('/')}`;
}

function audioUrl(dictId: string, key: string): string {
  return `${API_PREFIX}/${encodeURIComponent(dictId)}/audio?key=${encodeURIComponent(key)}`;
}

/**
 * 注入到每个词条文档的基础样式。
 * fontScale 为百分比（100 = 基准 14px），用 html { zoom } 整体缩放，
 * 这样连词典自带的固定 px 字号与图片一起放大，不会因词典 CSS 覆盖而失效。
 */
function baseStyle(fontScale = 100): string {
  const zoom = (Math.min(200, Math.max(100, Math.round(fontScale))) / 100).toFixed(2);
  return `
  html { zoom: ${zoom}; }
  html, body { margin: 0; padding: 0; }
  body {
    padding: 10px 12px 16px;
    font-family: "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #23201b;
    background: #fff;
    overflow-wrap: anywhere;
  }
  a { color: #2f5d62; }
  img { max-width: 100%; height: auto; }
  a[data-sound] { cursor: pointer; }
  a[data-sound] img { vertical-align: middle; }
  .mdx-miss { color: #8a847a; font-size: 13px; }
`.trim();
}

/** 点击喇叭图标时在 iframe 内播放，避免整页跳转到音频文件 */
const SOUND_SCRIPT = `
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[data-sound]');
    if (!link) return;
    event.preventDefault();
    var audio = new Audio(link.getAttribute('href'));
    audio.play().catch(function () {
      link.title = '该音频格式浏览器不支持播放';
    });
  });
`.trim();

export type RenderOptions = {
  dict: DictInfo;
  /** 词条原始 HTML（来自 MDX） */
  entryHtml: string;
  /** 用户查询的词，用于 entry:// 链接跳转 */
  word: string;
  /** 词条字号缩放百分比，100 = 基准 */
  fontScale?: number;
};

/**
 * 把 MDX 词条包装成可独立在 iframe 中渲染的完整 HTML 文档：
 * - 相对路径的 css/js/img 重写到本服务的资源路由
 * - sound:// 音频重写到音频路由，并加 data-sound 标记
 * - entry:// 词条间跳转重写为同词典的查询地址
 */
export function renderEntryDocument({ dict, entryHtml, word, fontScale }: RenderOptions): string {
  const $ = cheerio.load(entryHtml, null, false);
  const headParts: string[] = [];

  $('link[rel="stylesheet"]').each((_, el) => {
    const node = $(el);
    const href = node.attr('href') ?? '';
    if (isRelative(href)) node.attr('href', assetUrl(dict.id, href));
    headParts.push($.html(node));
    node.remove();
  });

  $('script[src]').each((_, el) => {
    const node = $(el);
    const src = node.attr('src') ?? '';
    if (isRelative(src)) node.attr('src', assetUrl(dict.id, src));
    headParts.push($.html(node));
    node.remove();
  });

  $('style').each((_, el) => {
    headParts.push($.html($(el)));
    $(el).remove();
  });

  $('img[src]').each((_, el) => {
    const node = $(el);
    const src = node.attr('src') ?? '';
    if (isRelative(src)) node.attr('src', assetUrl(dict.id, src));
  });

  $('a[href^="sound://"]').each((_, el) => {
    const node = $(el);
    const key = (node.attr('href') ?? '').replace(/^sound:\/\//, '');
    node.attr('href', audioUrl(dict.id, key));
    node.attr('data-sound', '1');
  });

  $('a[href^="entry://"]').each((_, el) => {
    const node = $(el);
    const target = (node.attr('href') ?? '').replace(/^entry:\/\//, '');
    if (target.startsWith('#')) {
      node.attr('href', target);
      return;
    }
    node.attr(
      'href',
      `${API_PREFIX}/${encodeURIComponent(dict.id)}/render?word=${encodeURIComponent(target.replace(/^#/, ''))}`,
    );
  });

  const bodyHtml = $.root().html() ?? '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(word)} · ${escapeHtml(dict.name)}</title>
${headParts.join('\n')}
<style>${baseStyle(fontScale)}</style>
</head>
<body>
${bodyHtml}
<script>${SOUND_SCRIPT}</script>
</body>
</html>`;
}

/** 未命中时的占位文档 */
export function renderMissDocument(dict: DictInfo, word: string, fontScale = 100): string {
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><style>${baseStyle(fontScale)}</style></head>
<body><p class="mdx-miss">${escapeHtml(dict.name)} 中未收录「${escapeHtml(word)}」。</p></body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 资源扩展名 → Content-Type */
export function contentTypeOf(fileName: string): string {
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    spx: 'audio/ogg',
    m4a: 'audio/mp4',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
  };
  return map[ext] ?? 'application/octet-stream';
}
