import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

const TEST_DB = path.join(process.cwd(), 'data', 'test-app.db');

process.env.DB_PATH = 'data/test-app.db';
process.env.AI_MODE = 'mock';
process.env.APP_SECRET = 'test-secret';
process.env.PORT = '5199';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

async function waitJob(jobId: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await request(app).get(`/api/jobs/${jobId}`);
    if (response.status === 200 && response.body.status !== 'running') {
      return response.body as Record<string, unknown>;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('任务等待超时');
}

beforeAll(async () => {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${TEST_DB}${suffix}`, { force: true });
  }
  fs.mkdirSync(path.dirname(TEST_DB), { recursive: true });
  const { runMigrations } = await import('../db/migrate');
  runMigrations();
  const { createApp } = await import('../app');
  app = createApp();
});

describe('核心流程（mock 模式）', () => {
  let wordId = '';
  let senseId = '';
  let conceptId = '';

  it('创建单词并生成义项清单', async () => {
    const response = await request(app).post('/api/words').send({ word: 'Suspend' });
    expect(response.status).toBe(201);
    expect(response.body.word.lemma).toBe('suspend');
    expect(response.body.job).toBeTruthy();

    const job = await waitJob(response.body.job.id);
    expect(job.status).toBe('succeeded');
    wordId = response.body.word.id;

    const detail = await request(app).get(`/api/words/${wordId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.items).toHaveLength(4);
    expect(detail.body.stats.pending).toBe(4);
    senseId = detail.body.items.find((item: { kind: string }) => item.kind === 'sense').id;
  });

  it('重复添加不会重复生成', async () => {
    const response = await request(app).post('/api/words').send({ word: 'suspend' });
    expect(response.body.created).toBe(false);
    expect(response.body.hasOverview).toBe(true);
    expect(response.body.job).toBeNull();
  });

  it('审核：通过、驳回、人工修改、版本递增', async () => {
    const reject = await request(app)
      .post(`/api/items/${senseId}/reject`)
      .send({ comment: '义项边界不清' });
    expect(reject.body.item.status).toBe('rejected');

    const detail = await request(app).get(`/api/items/${senseId}`);
    const payload = { ...detail.body.item.payload, usageNote: '（人工补充）注意正式语境。' };
    const edit = await request(app).patch(`/api/items/${senseId}`).send({ payload });
    expect(edit.body.item.status).toBe('pending');
    expect(edit.body.item.currentVersion).toBe(2);

    const versions = await request(app).get(`/api/items/${senseId}/versions`);
    expect(versions.body.versions).toHaveLength(2);
    expect(versions.body.versions[0].changeSource).toBe('human_edit');

    const approve = await request(app).post(`/api/items/${senseId}/approve`);
    expect(approve.body.item.status).toBe('approved');

    const rejectApproved = await request(app)
      .post(`/api/items/${senseId}/reject`)
      .send({ comment: '不该允许' });
    expect(rejectApproved.status).toBe(409);

    const unpublish = await request(app).post(`/api/items/${senseId}/unpublish`);
    expect(unpublish.body.item.status).toBe('pending');
  });

  it('义项深入研究生成子条目', async () => {
    const response = await request(app).post(`/api/items/${senseId}/study`);
    expect(response.status).toBe(202);
    const job = await waitJob(response.body.job.id);
    expect(job.status).toBe('succeeded');

    const detail = await request(app).get(`/api/words/${wordId}`);
    const children = detail.body.items.filter(
      (item: { parentId: string | null }) => item.parentId === senseId,
    );
    expect(children.length).toBeGreaterThanOrEqual(8);
    conceptId = children.find((item: { kind: string }) => item.kind === 'sense_concept').id;
  });

  it('重新分析生成新版本并保留旧版本', async () => {
    const response = await request(app)
      .post(`/api/items/${conceptId}/reanalyze`)
      .send({ comment: '没有说明与 halt 的区别' });
    expect(response.status).toBe(202);
    const job = await waitJob(response.body.job.id);
    expect(job.status).toBe('succeeded');

    const detail = await request(app).get(`/api/items/${conceptId}`);
    expect(detail.body.item.currentVersion).toBe(2);
    expect(detail.body.item.status).toBe('pending');
    // versions 按版本号倒序：v2 在第一位，携带本次驳回意见
    expect(detail.body.versions[0].feedback).toContain('halt');
    expect(detail.body.versions[1].versionNo).toBe(1);
    const actions = detail.body.events.map((event: { action: string }) => event.action);
    expect(actions).toContain('reanalyze_done');
  });

  it('已通过的内容不允许直接重新分析', async () => {
    await request(app).post(`/api/items/${conceptId}/approve`);
    const response = await request(app)
      .post(`/api/items/${conceptId}/reanalyze`)
      .send({ comment: 'x' });
    expect(response.status).toBe(409);
  });

  it('导出与统计接口可用', async () => {
    const approved = await request(app).get('/api/export?scope=approved&format=json');
    expect(approved.status).toBe(200);
    expect(approved.body.app).toBe('vocabulary-concept-lab');

    const markdown = await request(app).get('/api/export?scope=all&format=md');
    expect(markdown.status).toBe(200);
    expect(markdown.text).toContain('# 词汇概念知识库');

    const stats = await request(app).get('/api/stats');
    expect(stats.body.wordCount).toBeGreaterThanOrEqual(1);
  });
});
