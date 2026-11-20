import { Router } from 'express';
import { config } from '../config';
import { getSchemaVersion } from '../db/migrate';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    aiMode: config.aiMode,
    schemaVersion: getSchemaVersion(),
    time: new Date().toISOString(),
  });
});
