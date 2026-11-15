import { nowIso, newId } from '../utils/ids';

export type JobStatus = 'running' | 'succeeded' | 'failed';

export type Job = {
  id: string;
  type: string;
  wordId: string;
  status: JobStatus;
  progress: string[];
  result: unknown;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

const jobs = new Map<string, Job>();
const MAX_PROGRESS_LINES = 60;
const CLEANUP_DELAY_MS = 30 * 60 * 1000;

function scheduleCleanup(id: string): void {
  const timer = setTimeout(() => jobs.delete(id), CLEANUP_DELAY_MS);
  timer.unref?.();
}

export function startJob(input: {
  type: string;
  wordId: string;
  run: (report: (message: string) => void) => Promise<unknown>;
}): Job {
  const job: Job = {
    id: newId(),
    type: input.type,
    wordId: input.wordId,
    status: 'running',
    progress: [],
    result: null,
    error: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  jobs.set(job.id, job);

  const report = (message: string): void => {
    job.progress.push(message);
    if (job.progress.length > MAX_PROGRESS_LINES) job.progress.shift();
    job.updatedAt = nowIso();
  };

  void (async () => {
    try {
      job.result = await input.run(report);
      job.status = 'succeeded';
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
    } finally {
      job.updatedAt = nowIso();
      scheduleCleanup(job.id);
    }
  })();

  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function findRunningJob(wordId: string, type?: string): Job | undefined {
  for (const job of jobs.values()) {
    if (job.status !== 'running') continue;
    if (job.wordId !== wordId) continue;
    if (type && job.type !== type) continue;
    return job;
  }
  return undefined;
}
