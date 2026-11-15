import { Router } from 'express';
import { config } from '../config';
import { asyncHandler } from '../middleware/error';
import {
  getPublicSettings,
  settingsUpdateSchema,
  updateSettings,
} from '../repositories/settings';
import { chat } from '../ai/client';

export const settingsRouter = Router();

settingsRouter.get('/settings', (_req, res) => {
  res.json(getPublicSettings());
});

settingsRouter.put('/settings', (req, res) => {
  const parsed = settingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: {
        code: 'bad_request',
        message: '配置参数不合法',
        details: parsed.error.flatten(),
      },
    });
    return;
  }
  res.json(updateSettings(parsed.data));
});

settingsRouter.post(
  '/settings/test',
  asyncHandler(async (_req, res) => {
    if (config.aiMode === 'mock') {
      res.json({ ok: true, mock: true, latencyMs: 0, reply: 'mock 模式，无需真实连接' });
      return;
    }
    const startedAt = Date.now();
    const result = await chat({
      taskType: 'connectivity_test',
      maxTokens: 32,
      temperature: 0,
      timeoutMs: 30_000,
      messages: [
        { role: 'system', content: '你是连通性测试助手，只回复被要求的内容。' },
        { role: 'user', content: '只回复两个大写字母：OK' },
      ],
    });
    res.json({
      ok: true,
      latencyMs: Date.now() - startedAt,
      model: result.model,
      reply: result.content.slice(0, 200),
    });
  }),
);
