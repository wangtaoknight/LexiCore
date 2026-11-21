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

describe('义项模块化接口', () => {
  let wordId = '';
  let senseId = '';

  beforeAll(async () => {
    const response = await request(app).post('/api/words').send({ word: 'spoil' });
    wordId = response.body.word.id;
    if (response.body.job) await waitJob(response.body.job.id);
    const detail = await request(app).get(`/api/words/${wordId}`);
    senseId = detail.body.items.find((item: { kind: string }) => item.kind === 'sense').id;
  });

  it('义项缺少 posTags 时按空数组处理，不报错', async () => {
    const detail = await request(app).get(`/api/items/${senseId}`);
    expect(detail.status).toBe(200);
    expect(Array.isArray(detail.body.item.payload.posTags)).toBe(true);
  });

  it('英文释义可按需翻译（不落库）', async () => {
    const before = await request(app).get(`/api/items/${senseId}`);
    const response = await request(app).post(`/api/items/${senseId}/translate`);
    expect(response.status).toBe(200);
    expect(response.body.text.length).toBeGreaterThan(0);
    const after = await request(app).get(`/api/items/${senseId}`);
    // 翻译只读，不产生新版本
    expect(after.body.item.currentVersion).toBe(before.body.item.currentVersion);
  });

  it('追问返回回答但不写库', async () => {
    const before = await request(app).get(`/api/items/${senseId}`);
    const response = await request(app)
      .post(`/api/items/${senseId}/explain`)
      .send({ question: '这个义项和 damage 有什么区别？' });
    expect(response.status).toBe(200);
    expect(response.body.answer.length).toBeGreaterThan(0);
    const after = await request(app).get(`/api/items/${senseId}`);
    expect(after.body.item.currentVersion).toBe(before.body.item.currentVersion);
    expect(after.body.item.status).toBe(before.body.item.status);
  });

  it('模块批量通过：逐条通过后全部变为 approved', async () => {
    const study = await request(app).post(`/api/items/${senseId}/study`);
    await waitJob(study.body.job.id);
    const detail = await request(app).get(`/api/words/${wordId}`);
    const examples = detail.body.items.filter(
      (item: { parentId: string | null; kind: string }) =>
        item.parentId === senseId && item.kind === 'example',
    );
    expect(examples.length).toBeGreaterThan(1);

    for (const example of examples) {
      const response = await request(app).post(`/api/items/${example.id}/approve`);
      expect(response.body.item.status).toBe('approved');
    }

    const after = await request(app).get(`/api/words/${wordId}`);
    const statuses = after.body.items
      .filter((item: { parentId: string | null; kind: string }) =>
        item.parentId === senseId && item.kind === 'example')
      .map((item: { status: string }) => item.status);
    expect(statuses.every((status: string) => status === 'approved')).toBe(true);
  });

  it('可为义项补充反义词候选（异步任务，重复调用冲突）', async () => {
    // 用一个尚未深入研究过的义项（没有既有反义词）
    const created = await request(app).post('/api/words').send({ word: 'foundation' });
    if (created.body.job) await waitJob(created.body.job.id);
    const detail = await request(app).get(`/api/words/${created.body.word.id}`);
    const freshSense = detail.body.items.find((item: { kind: string }) => item.kind === 'sense');

    const response = await request(app).post(`/api/items/${freshSense.id}/antonyms`);
    expect(response.status).toBe(202);
    const job = await waitJob(response.body.job.id);
    expect(job.status).toBe('succeeded');

    const after = await request(app).get(`/api/words/${created.body.word.id}`);
    const antonyms = after.body.items.filter(
      (item: { parentId: string | null; kind: string }) =>
        item.parentId === freshSense.id && item.kind === 'antonym',
    );
    expect(antonyms.length).toBeGreaterThan(0);
    expect(antonyms[0].status).toBe('pending');

    const again = await request(app).post(`/api/items/${freshSense.id}/antonyms`);
    expect(again.status).toBe(409);
  });
});

describe('词库校验接口', () => {
  it('已入库单词：大小写与空格归一后仍能命中', async () => {
    const response = await request(app).get('/api/words/lookup?word=%20Suspend%20');
    expect(response.status).toBe(200);
    expect(response.body.valid).toBe(true);
    expect(response.body.word).toBe('suspend');
    expect(response.body.existing).not.toBeNull();
    expect(response.body.existing.lemma).toBe('suspend');
  });

  it('未入库单词返回 existing=null', async () => {
    const response = await request(app).get('/api/words/lookup?word=ambition');
    expect(response.body.valid).toBe(true);
    expect(response.body.existing).toBeNull();
  });

  it('校验只做精确匹配，不做模糊匹配', async () => {
    const response = await request(app).get('/api/words/lookup?word=suspen');
    expect(response.body.valid).toBe(true);
    expect(response.body.existing).toBeNull();
  });

  it('非法字符返回 valid=false', async () => {
    const response = await request(app).get('/api/words/lookup?word=sus%20pend!');
    expect(response.body.valid).toBe(false);
    expect(response.body.existing).toBeNull();
  });
});

