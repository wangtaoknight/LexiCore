import express, { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { badRequest } from '../errors';
import { asyncHandler } from '../middleware/error';
import { createWord, findWordByLemma, normalizeLemma } from '../repositories/words';
import {
  createBackup,
  listBackups,
  resolveBackupPath,
  restoreFromFile,
} from '../services/backupService';
import { buildExportData, buildMarkdownExport, type ExportScope } from '../services/exportService';

export const dataRouter = Router();

function parseScope(value: unknown): ExportScope {
  return value === 'all' ? 'all' : 'approved';
}

dataRouter.get('/export', (req, res) => {
  const scope = parseScope(req.query.scope);
  const format = req.query.format === 'md' ? 'md' : 'json';
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'md') {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="vocabulary-${scope}-${stamp}.md"`,
    );
    res.send(buildMarkdownExport(scope));
    return;
  }

  res.setHeader('Content-Disposition', `attachment; filename="vocabulary-${scope}-${stamp}.json"`);
  res.json(buildExportData(scope));
});

dataRouter.get('/backups', (_req, res) => {
  res.json({ backups: listBackups() });
});

dataRouter.post(
  '/backup',
  asyncHandler(async (_req, res) => {
    res.json({ backup: createBackup() });
  }),
);

dataRouter.get('/backup/download', (req, res) => {
  const file = resolveBackupPath(String(req.query.name ?? ''));
  res.download(file, path.basename(file));
});

dataRouter.post(
  '/restore',
  express.raw({ type: '*/*', limit: '256mb' }),
  asyncHandler(async (req, res) => {
    const body = req.body as unknown;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw badRequest('请上传备份数据库文件');
    }
    fs.mkdirSync(config.dataDir, { recursive: true });
    const tempFile = path.join(config.dataDir, `restore-${Date.now()}.db`);
    fs.writeFileSync(tempFile, body);
    try {
      const result = restoreFromFile(tempFile);
      res.json({ ok: true, ...result });
    } finally {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  }),
);

/** 从项目根目录的 vocabulary copy.txt 导入待研究单词（不调用 AI） */
dataRouter.post('/backlog/import', (_req, res) => {
  const file = path.join(process.cwd(), 'vocabulary copy.txt');
  if (!fs.existsSync(file)) {
    throw badRequest('未找到 vocabulary copy.txt（应位于项目根目录）');
  }
  const lines = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.split('\t')[0]?.trim() ?? '')
    .filter(Boolean);

  let imported = 0;
  let skipped = 0;
  for (const raw of lines) {
    let lemma: string;
    try {
      lemma = normalizeLemma(raw);
    } catch {
      skipped += 1;
      continue;
    }
    if (findWordByLemma(lemma)) {
      skipped += 1;
      continue;
    }
    createWord(lemma);
    imported += 1;
  }

  res.json({ ok: true, total: lines.length, imported, skipped });
});
