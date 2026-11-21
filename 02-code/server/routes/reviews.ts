import { Router } from 'express';
import { z } from 'zod';
import { chat } from '../ai/client';
import { loadPrompt } from '../ai/prompts';
import { badRequest, conflict } from '../errors';
import { getDb } from '../db';
import { asyncHandler } from '../middleware/error';
import type { Item } from '../repositories/items';
import { getItem, listItemsByWord } from '../repositories/items';
import { getWord } from '../repositories/words';
import { generateSenseAntonyms, generateSenseStudy } from '../services/analysisService';
import { findRunningJob, startJob } from '../services/jobRunner';
import { reanalyzeItem } from '../services/reanalyzeService';
import { generateSourcedExamples } from '../services/sourceService';
import {
  approveItem,
  editItem,
  listEvents,
  listVersions,
  rejectItem,
  unpublishItem,
} from '../services/reviewService';

export const reviewsRouter = Router();

const rejectSchema = z.object({
  comment: z.string().trim().max(2000).optional().default(''),
});

const editSchema = z.object({
  payload: z.record(z.unknown()),
});

const reanalyzeSchema = z.object({
  comment: z.string().trim().max(2000).optional().default(''),
});

const explainSchema = z.object({
  question: z.string().trim().min(1, '请输入追问内容').max(1000),
});

type QueueRow = {
  id: string;
  word_id: string;
  parent_id: string | null;
  kind: Item['kind'];
  seq: number;
  pos: string | null;
  payload: string;
  status: Item['status'];
  evidence_type: Item['evidenceType'];
  origin: 'ai' | 'human';
  current_version: number;
  created_at: string;
  updated_at: string;
  lemma: string;
};

reviewsRouter.get('/review/queue', (req, res) => {
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : 'pending';
  const kind = typeof req.query.kind === 'string' ? req.query.kind : '';
  const wordId = typeof req.query.wordId === 'string' ? req.query.wordId : '';
  const pos = typeof req.query.pos === 'string' ? req.query.pos : '';

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (status !== 'all') {
    clauses.push('i.status = ?');
    params.push(status);
  }
  if (kind) {
    clauses.push('i.kind = ?');
    params.push(kind);
  }
  if (wordId) {
    clauses.push('i.word_id = ?');
    params.push(wordId);
  }
  if (pos) {
    clauses.push('i.pos = ?');
    params.push(pos);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = getDb()
    .prepare(
      `SELECT i.*, w.lemma FROM items i JOIN words w ON w.id = i.word_id
       ${where}
       ORDER BY i.updated_at DESC
       LIMIT 300`,
    )
    .all(...params) as QueueRow[];

  res.json({
    status,
    total: rows.length,
    items: rows.map((row) => ({
      id: row.id,
      wordId: row.word_id,
      parentId: row.parent_id,
      kind: row.kind,
      seq: row.seq,
      pos: row.pos,
      payload: JSON.parse(row.payload) as Record<string, unknown>,
      status: row.status,
      evidenceType: row.evidence_type,
      origin: row.origin,
      currentVersion: row.current_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lemma: row.lemma,
    })),
  });
});

reviewsRouter.get('/items/:id', (req, res) => {
  const item = getItem(req.params.id);
  res.json({
    item,
    word: getWord(item.wordId),
    versions: listVersions(item.id),
    events: listEvents(item.id),
  });
});

reviewsRouter.post(
  '/items/:id/approve',
  asyncHandler(async (req, res) => {
    res.json({ item: approveItem(req.params.id) });
  }),
);

reviewsRouter.post(
  '/items/:id/reject',
  asyncHandler(async (req, res) => {
    const parsed = rejectSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw badRequest('驳回意见格式不正确', parsed.error.flatten());
    }
    res.json({ item: rejectItem(req.params.id, parsed.data.comment) });
  }),
);

reviewsRouter.patch(
  '/items/:id',
  asyncHandler(async (req, res) => {
    const parsed = editSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('修改内容格式不正确', parsed.error.flatten());
    }
    res.json({ item: editItem(req.params.id, parsed.data.payload) });
  }),
);

reviewsRouter.post(
  '/items/:id/unpublish',
  asyncHandler(async (req, res) => {
    res.json({ item: unpublishItem(req.params.id) });
  }),
);

reviewsRouter.get('/items/:id/versions', (req, res) => {
  res.json({ versions: listVersions(req.params.id) });
});

/**
 * 按需翻译：把该条目中的英文释义翻成中文。
 * 结果不落库（只用于页面上的「翻译」开关），调用仍会写 ai_tasks 便于排查。
 */
reviewsRouter.post(
  '/items/:id/translate',
  asyncHandler(async (req, res) => {
    const item = getItem(req.params.id);
    const source = String(
      item.payload.enDefinition ?? item.payload.conceptCn ?? item.payload.en ?? '',
    ).trim();
    if (!source) {
      throw badRequest('该条目没有可翻译的英文内容');
    }
    const result = await chat({
      taskType: 'translate',
      wordId: item.wordId,
      itemId: item.id,
      maxTokens: 800,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            '你是英汉词典编辑。把用户给出的英文释义翻译成简洁、准确的中文，只输出译文本身：不要解释、不要加引号、不要任何前缀。',
        },
        { role: 'user', content: source },
      ],
    });
    res.json({ text: result.content.trim(), model: result.model, taskId: result.taskId });
  }),
);

reviewsRouter.post(
  '/items/:id/study',
  asyncHandler(async (req, res) => {
    const item = getItem(req.params.id);
    if (item.kind !== 'sense') {
      throw badRequest('只能对「义项」条目生成深入研究');
    }
    if (findRunningJob(item.wordId)) {
      throw conflict('该单词已有正在运行的生成任务，请等待完成后再试');
    }
    const job = startJob({
      type: 'sense_study',
      wordId: item.wordId,
      run: (report) => generateSenseStudy(item.id, report),
    });
    res.status(202).json({ job });
  }),
);

reviewsRouter.get('/items/:id/events', (req, res) => {
  res.json({ events: listEvents(req.params.id) });
});

/** 为一个义项补充反义词候选（异步任务） */
reviewsRouter.post(
  '/items/:id/antonyms',
  asyncHandler(async (req, res) => {
    const item = getItem(req.params.id);
    if (item.kind !== 'sense') {
      throw badRequest('只能对「义项」条目补充反义词');
    }
    const existingAntonyms = listItemsByWord(item.wordId).filter(
      (child) => child.parentId === item.id && child.kind === 'antonym',
    );
    if (existingAntonyms.length > 0) {
      throw conflict('该义项已有反义词，无需重复生成。');
    }
    if (findRunningJob(item.wordId)) {
      throw conflict('该单词已有正在运行的生成任务，请等待完成后再试');
    }
    const job = startJob({
      type: 'sense_antonyms',
      wordId: item.wordId,
      run: (report) => generateSenseAntonyms(item.id, report),
    });
    res.status(202).json({ job });
  }),
);

reviewsRouter.post(
  '/items/:id/reanalyze',
  asyncHandler(async (req, res) => {
    const parsed = reanalyzeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw badRequest('意见格式不正确', parsed.error.flatten());
    }
    const item = getItem(req.params.id);
    if (item.status === 'approved') {
      throw conflict('已通过的内容不能直接重新分析，请先「解除通过」');
    }
    if (findRunningJob(item.wordId)) {
      throw conflict('该单词已有正在运行的生成任务，请等待完成后再试');
    }
    const job = startJob({
      type: 'item_reanalyze',
      wordId: item.wordId,
      run: (report) => reanalyzeItem(item.id, parsed.data.comment, report),
    });
    res.status(202).json({ job });
  }),
);

reviewsRouter.post(
  '/items/:id/sources',
  asyncHandler(async (req, res) => {
    const item = getItem(req.params.id);
    if (item.kind !== 'sense') {
      throw badRequest('只能对「义项」条目获取带来源的例句');
    }
    if (findRunningJob(item.wordId)) {
      throw conflict('该单词已有正在运行的生成任务，请等待完成后再试');
    }
    const job = startJob({
      type: 'examples_sourced',
      wordId: item.wordId,
      run: (report) => generateSourcedExamples(item.id, report),
    });
    res.status(202).json({ job });
  }),
);

reviewsRouter.post(
  '/items/:id/explain',
  asyncHandler(async (req, res) => {
    const parsed = explainSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw badRequest('追问内容不能为空', parsed.error.flatten());
    }
    const item = getItem(req.params.id);
    const word = getWord(item.wordId);
    const result = await chat({
      taskType: 'explain',
      wordId: item.wordId,
      itemId: item.id,
      maxTokens: 1500,
      temperature: 0.3,
      messages: [
        { role: 'system', content: loadPrompt('explain.md') },
        {
          role: 'user',
          content: `单词：${word.lemma}\n条目类型：${item.kind}\n当前内容（JSON）：\n${JSON.stringify(
            item.payload,
            null,
            2,
          )}\n\n用户问题：${parsed.data.question}`,
        },
      ],
    });
    res.json({ answer: result.content, model: result.model, taskId: result.taskId });
  }),
);
