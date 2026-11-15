import { Router } from 'express';
import { z } from 'zod';
import { badRequest } from '../errors';
import { asyncHandler } from '../middleware/error';
import { countItemsByStatus, findItemsByKind, listItemsByWord } from '../repositories/items';
import {
  createWord,
  deleteWord,
  findWordByLemma,
  getStats,
  getWord,
  listWords,
  normalizeLemma,
} from '../repositories/words';
import { generateWordOverview } from '../services/analysisService';
import { findRunningJob, startJob } from '../services/jobRunner';
import { listTasksByWord } from '../repositories/tasks';

export const wordsRouter = Router();

const createWordSchema = z.object({
  word: z.string().trim().min(1, '请输入英文单词').max(60),
});

wordsRouter.get('/words', (_req, res) => {
  res.json({ words: listWords(), stats: getStats() });
});

wordsRouter.get('/stats', (_req, res) => {
  res.json(getStats());
});

wordsRouter.post(
  '/words',
  asyncHandler(async (req, res) => {
    const parsed = createWordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw badRequest('请输入合法的英文单词', parsed.error.flatten());
    }

    const lemma = normalizeLemma(parsed.data.word);
    let word = findWordByLemma(lemma);
    let created = false;

    if (!word) {
      word = createWord(lemma);
      created = true;
    }

    const hasOverview = findItemsByKind(word.id, 'word_basic').length > 0;
    let job = findRunningJob(word.id, 'word_overview') ?? null;

    if (!hasOverview && !job) {
      const wordId = word.id;
      job = startJob({
        type: 'word_overview',
        wordId,
        run: (report) => generateWordOverview(wordId, report),
      });
    }

    res.status(created ? 201 : 200).json({ word, created, hasOverview, job });
  }),
);

wordsRouter.get('/words/:id', (req, res) => {
  const word = getWord(req.params.id);
  res.json({
    word,
    items: listItemsByWord(word.id),
    stats: countItemsByStatus(word.id),
    runningJob: findRunningJob(word.id) ?? null,
  });
});

wordsRouter.delete('/words/:id', (req, res) => {
  deleteWord(req.params.id);
  res.json({ ok: true });
});

wordsRouter.get('/words/:id/tasks', (req, res) => {
  const word = getWord(req.params.id);
  const tasks = listTasksByWord(word.id, 100).map((task) => ({
    id: task.id,
    taskType: task.task_type,
    status: task.status,
    error: task.error,
    model: task.model,
    promptTokens: task.prompt_tokens,
    completionTokens: task.completion_tokens,
    durationMs: task.duration_ms,
    createdAt: task.created_at,
    finishedAt: task.finished_at,
  }));
  res.json({ tasks });
});
