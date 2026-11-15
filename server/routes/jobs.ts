import { Router } from 'express';
import { getJob } from '../services/jobRunner';

export const jobsRouter = Router();

jobsRouter.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: { code: 'not_found', message: '任务不存在或已过期' } });
    return;
  }
  res.json(job);
});

jobsRouter.get('/jobs/:id/stream', (req, res) => {
  const jobId = req.params.id;
  if (!getJob(jobId)) {
    res.status(404).json({ error: { code: 'not_found', message: '任务不存在或已过期' } });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (): boolean => {
    const current = getJob(jobId);
    if (!current) return false;
    res.write(`data: ${JSON.stringify(current)}\n\n`);
    return current.status === 'running';
  };

  if (!send()) {
    res.end();
    return;
  }

  const interval = setInterval(() => {
    if (!send()) {
      clearInterval(interval);
      res.end();
    }
  }, 500);

  req.on('close', () => {
    clearInterval(interval);
  });
});
