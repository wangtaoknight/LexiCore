import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { getSettingValue, getSettings, setSettingValue } from '../repositories/settings';
import { getDict, listDicts, reloadDicts, type DictInfo } from '../dictionaries/mdx/registry';
import { entryCount, lookupEntry, readResource, releaseAll } from '../dictionaries/mdx/reader';
import {
  contentTypeOf,
  renderEntryDocument,
  renderMissDocument,
} from '../dictionaries/mdx/render';

export const dictRouter = Router();

const DISABLED_KEY = 'disabled_dicts';
const ORDER_KEY = 'dict_order';
const NAMES_KEY = 'dict_names';
const SHORT_NAMES_KEY = 'dict_short_names';

function readStringArray(key: string): string[] {
  try {
    const raw = getSettingValue(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function readNames(): Record<string, string> {
  try {
    const raw = getSettingValue(NAMES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** 词典简称：查询页标签用它，避免长名称挤满顶栏 */
function readShortNames(): Record<string, string> {
  try {
    const raw = getSettingValue(SHORT_NAMES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * 按用户自定义顺序排列词典；未纳入顺序表的词典保持目录扫描顺序。
 * 这样新增词典不会因为顺序表里没有它而跑到最前面。
 */
function orderedDicts(): DictInfo[] {
  const { dicts } = listDicts();
  const rank = new Map<string, number>();
  readStringArray(ORDER_KEY).forEach((id, index) => {
    if (!rank.has(id)) rank.set(id, index);
  });
  const base = new Map(dicts.map((dict, index) => [dict.id, index]));
  return [...dicts].sort((a, b) => {
    const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return (base.get(a.id) ?? 0) - (base.get(b.id) ?? 0);
  });
}

function readDisabled(): Set<string> {
  return new Set(readStringArray(DISABLED_KEY));
}

function writeDisabled(ids: Set<string>): void {
  setSettingValue(DISABLED_KEY, JSON.stringify([...ids].sort()));
}

/** 词典列表（按用户排序，含启用状态、自定义名称与文件情况） */
dictRouter.get('/dicts', (_req, res) => {
  const { root, exists } = listDicts();
  const disabled = readDisabled();
  const names = readNames();
  const shortNames = readShortNames();
  res.json({
    root,
    exists,
    dicts: orderedDicts().map((dict, index) => ({
      index: index + 1,
      id: dict.id,
      name: names[dict.id]?.trim() || dict.name,
      shortName: shortNames[dict.id]?.trim() || '',
      originalName: dict.name,
      entryCount: entryCount(dict),
      mdxSize: dict.mdxSize,
      mddSize: dict.mddSize,
      hasMdd: Boolean(dict.mddPath),
      cssFiles: dict.cssFiles,
      jsFiles: dict.jsFiles,
      enabled: !disabled.has(dict.id),
    })),
  });
});

/** 重新扫描词典目录（新增/删除词典后使用） */
dictRouter.post('/dicts/reload', (_req, res) => {
  releaseAll();
  const { root, exists, dicts } = reloadDicts();
  res.json({ root, exists, count: dicts.length });
});

/** 调整词典顺序（拖拽排序后调用）；未列出的词典自动接在后面 */
dictRouter.put('/dicts/order', (req, res) => {
  const raw = (req.body as { ids?: unknown } | undefined)?.ids;
  const ids = Array.isArray(raw) ? raw.map(String) : [];
  const known = new Set(listDicts().dicts.map((dict) => dict.id));
  const picked = [...new Set(ids.filter((id) => known.has(id)))];
  const rest = orderedDicts()
    .map((dict) => dict.id)
    .filter((id) => !picked.includes(id));
  const next = [...picked, ...rest];
  setSettingValue(ORDER_KEY, JSON.stringify(next));
  res.json({ ids: next });
});

/** 启用 / 禁用 / 重命名某本词典 */
dictRouter.put('/dicts/:id', (req, res) => {
  const dict = getDict(req.params.id);
  if (!dict) {
    res.status(404).json({ error: { code: 'not_found', message: '词典不存在' } });
    return;
  }
  const body = (req.body ?? {}) as { enabled?: unknown; name?: unknown; shortName?: unknown };
  const disabled = readDisabled();
  if (typeof body.enabled === 'boolean') {
    if (body.enabled) disabled.delete(dict.id);
    else disabled.add(dict.id);
    writeDisabled(disabled);
  }
  if (typeof body.name === 'string') {
    const names = readNames();
    const name = body.name.trim().slice(0, 60);
    if (!name || name === dict.name) delete names[dict.id];
    else names[dict.id] = name;
    setSettingValue(NAMES_KEY, JSON.stringify(names));
  }
  if (typeof body.shortName === 'string') {
    const shortNames = readShortNames();
    const shortName = body.shortName.trim().slice(0, 20);
    if (!shortName) delete shortNames[dict.id];
    else shortNames[dict.id] = shortName;
    setSettingValue(SHORT_NAMES_KEY, JSON.stringify(shortNames));
  }
  res.json({
    id: dict.id,
    enabled: !disabled.has(dict.id),
    name: readNames()[dict.id]?.trim() || dict.name,
    shortName: readShortNames()[dict.id]?.trim() || '',
  });
});

/** 多词典查询概览：只返回是否命中，正文由 render 接口按需加载 */
dictRouter.get('/dicts/lookup', (req, res) => {
  const word = String(req.query.word ?? '').trim();
  if (!word) {
    res.status(400).json({ error: { code: 'bad_request', message: '缺少 word 参数' } });
    return;
  }
  const disabled = readDisabled();
  const names = readNames();
  const shortNames = readShortNames();
  const results = orderedDicts()
    .filter((dict) => !disabled.has(dict.id))
    .map((dict, index) => {
      const label = names[dict.id]?.trim() || dict.name;
      const shortName = shortNames[dict.id]?.trim() || '';
      try {
        const hit = lookupEntry(dict, word);
        return {
          index: index + 1,
          id: dict.id,
          name: label,
          shortName,
          hit: Boolean(hit),
          keyText: hit?.keyText ?? null,
          matchedWord: hit?.matchedWord ?? null,
          length: hit?.html.length ?? 0,
        };
      } catch (error) {
        return {
          index: index + 1,
          id: dict.id,
          name: label,
          shortName,
          hit: false,
          keyText: null,
          matchedWord: null,
          length: 0,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  const settings = getSettings();
  res.json({
    word,
    viewMode: settings.dictViewMode,
    panelMode: settings.dictPanelMode,
    fontScale: settings.dictFontScale,
    results,
  });
});

/** 词条渲染文档：供 iframe 直接加载 */
dictRouter.get('/dicts/:id/render', (req, res) => {
  const dict = getDict(req.params.id);
  if (!dict) {
    res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><p>词典不存在。</p>');
    return;
  }
  const word = String(req.query.word ?? '').trim();
  const fontScale = getSettings().dictFontScale;
  res.type('html');
  if (!word) {
    res.send(renderMissDocument(dict, '', fontScale));
    return;
  }
  try {
    const hit = lookupEntry(dict, word);
    res.send(
      hit
        ? renderEntryDocument({ dict, entryHtml: hit.html, word, fontScale })
        : renderMissDocument(dict, word, fontScale),
    );
  } catch (error) {
    res
      .status(500)
      .type('html')
      .send(
        `<!doctype html><meta charset="utf-8"><p>读取词条失败：${escape(
          error instanceof Error ? error.message : String(error),
        )}</p>`,
      );
  }
});

/** 词典静态资源：优先同目录文件，其次 MDD 资源包 */
dictRouter.get('/dicts/:id/asset/*', (req, res) => {
  const dict = getDict(req.params.id);
  if (!dict) {
    res.status(404).end();
    return;
  }
  const raw = decodeURIComponent(String((req.params as Record<string, string>)[0] ?? ''));
  const rel = path.normalize(raw).replace(/^([/\\]|\.\.[/\\])+/, '');
  const localPath = path.join(dict.dir, rel);
  if (localPath.startsWith(dict.dir) && fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    res.type(contentTypeOf(rel));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(fs.readFileSync(localPath));
    return;
  }

  const fromMdd = readResource(dict, rel) ?? readResource(dict, path.basename(rel));
  if (fromMdd) {
    res.type(contentTypeOf(rel));
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(fromMdd.data);
    return;
  }
  res.status(404).end();
});

/** 音频：从 MDD 按 sound:// key 取出 */
dictRouter.get('/dicts/:id/audio', (req, res) => {
  const dict = getDict(req.params.id);
  if (!dict) {
    res.status(404).end();
    return;
  }
  const key = String(req.query.key ?? '').trim();
  if (!key) {
    res.status(400).end();
    return;
  }
  const found = readResource(dict, key) ?? readResource(dict, path.basename(key));
  if (!found) {
    res.status(404).end();
    return;
  }
  res.type(contentTypeOf(key));
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(found.data);
});

function escape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
