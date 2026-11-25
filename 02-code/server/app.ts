import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { errorHandler, notFoundHandler } from './middleware/error';
import { dataRouter } from './routes/data';
import { dictRouter } from './routes/dict';
import { healthRouter } from './routes/health';
import { jobsRouter } from './routes/jobs';
import { reviewsRouter } from './routes/reviews';
import { settingsRouter } from './routes/settings';
import { wordsRouter } from './routes/words';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '4mb' }));

  app.use('/api', healthRouter);
  app.use('/api', settingsRouter);
  app.use('/api', dictRouter);
  app.use('/api', wordsRouter);
  app.use('/api', reviewsRouter);
  app.use('/api', jobsRouter);
  app.use('/api', dataRouter);
  app.use('/api', notFoundHandler);

  // 若已构建前端产物，则由 Express 直接托管（本地生产模式）
  const clientDir = path.resolve(process.cwd(), 'dist/client');
  if (fs.existsSync(path.join(clientDir, 'index.html'))) {
    app.use(express.static(clientDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDir, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
