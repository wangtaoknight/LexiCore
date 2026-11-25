import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config';

/** 一本离线词典的文件构成 */
export type DictInfo = {
  /** 词条文件名去掉扩展名，例如 OALD9EnEn；同时充当 URL 中的 id */
  id: string;
  /** 展示名，来源于所在目录名（去掉 "3." 这类排序前缀） */
  name: string;
  dir: string;
  mdxPath: string;
  mddPath: string | null;
  cssFiles: string[];
  jsFiles: string[];
  mdxSize: number;
  mddSize: number;
};

export type DictListResult = {
  root: string;
  exists: boolean;
  dicts: DictInfo[];
};

let cache: DictListResult | null = null;

function stripOrderPrefix(name: string): string {
  return name.replace(/^\s*\d+\s*[.、-]\s*/, '').trim() || name;
}

function scan(): DictListResult {
  const root = config.dictRoot;
  if (!fs.existsSync(root)) return { root, exists: false, dicts: [] };

  const dicts: DictInfo[] = [];
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));

  for (const entry of entries) {
    const dir = path.join(root, entry.name);
    const files = fs.readdirSync(dir);
    const mdxFile = files.find((file) => file.toLowerCase().endsWith('.mdx'));
    if (!mdxFile) continue;

    const id = mdxFile.slice(0, -4);
    const mddFile = files.find(
      (file) => file.toLowerCase().endsWith('.mdd') && file.slice(0, -4) === id,
    );
    const cssFiles = files.filter((file) => file.toLowerCase().endsWith('.css'));
    const jsFiles = files.filter((file) => file.toLowerCase().endsWith('.js'));
    const mdxPath = path.join(dir, mdxFile);
    const mddPath = mddFile ? path.join(dir, mddFile) : null;

    dicts.push({
      id,
      name: stripOrderPrefix(entry.name),
      dir,
      mdxPath,
      mddPath,
      cssFiles,
      jsFiles,
      mdxSize: fs.statSync(mdxPath).size,
      mddSize: mddPath ? fs.statSync(mddPath).size : 0,
    });
  }

  return { root, exists: true, dicts };
}

export function listDicts(): DictListResult {
  if (!cache) cache = scan();
  return cache;
}

/** 重新扫描目录（用户在设置页点「重新扫描」时调用） */
export function reloadDicts(): DictListResult {
  cache = scan();
  return cache;
}

export function getDict(id: string): DictInfo | undefined {
  return listDicts().dicts.find((dict) => dict.id === id);
}
