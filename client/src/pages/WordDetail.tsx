import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Job, WordDetailResponse } from '../api/types';
import { ItemCard } from '../components/ItemCard';
import { SenseBlock } from '../components/SenseBlock';

type WordBasic = {
  phonetic?: string;
  pos?: string[];
  etymology?: string;
  semanticHistory?: string;
  coreMeaning?: string | null;
  coreMeaningNote?: string | null;
};

type TaskRow = {
  id: string;
  taskType: string;
  status: string;
  error: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number | null;
  createdAt: string;
  finishedAt: string | null;
};

export default function WordDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<WordDetailResponse | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [tasks, setTasks] = useState<TaskRow[] | null>(null);
  const [sourceEnabled, setSourceEnabled] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const next = await api.get<WordDetailResponse>(`/words/${id}`);
    setData(next);
    setJob(next.runningJob);
    if (next.runningJob) setJobId(next.runningJob.id);
  }, [id]);

  useEffect(() => {
    load().catch((err) => setError(errorMessage(err)));
  }, [load]);

  useEffect(() => {
    api
      .get<{ enableSourceVerification: boolean }>('/settings')
      .then((settings) => setSourceEnabled(settings.enableSourceVerification))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!jobId) return;
    const source = new EventSource(`/api/jobs/${jobId}/stream`);
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as Job;
      setJob(next);
      if (next.status !== 'running') {
        source.close();
        setJobId(null);
        void load();
      }
    };
    source.onerror = () => {
      source.close();
      setJobId(null);
    };
    return () => source.close();
  }, [jobId, load]);

  async function startOverview() {
    if (!data) return;
    setStarting(true);
    setError(null);
    try {
      const result = await api.post<{ job: Job | null }>('/words', { word: data.word.lemma });
      if (result.job) {
        setJob(result.job);
        setJobId(result.job.id);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setStarting(false);
    }
  }

  function handleItemChanged() {
    void load();
  }

  async function startStudy(senseId: string) {
    setError(null);
    try {
      const result = await api.post<{ job: Job }>(`/items/${senseId}/study`);
      setJob(result.job);
      setJobId(result.job.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function startSources(senseId: string) {
    setError(null);
    try {
      const result = await api.post<{ job: Job }>(`/items/${senseId}/sources`);
      setJob(result.job);
      setJobId(result.job.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function toggleTasks() {
    if (tasksOpen) {
      setTasksOpen(false);
      return;
    }
    setTasksOpen(true);
    try {
      const result = await api.get<{ tasks: TaskRow[] }>(`/words/${id}/tasks`);
      setTasks(result.tasks);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  if (error && !data) {
    return <div className="notice notice-error">{error}</div>;
  }

  if (!data) {
    return <div className="empty">加载中…</div>;
  }

  const basicItem = data.items.find((item) => item.kind === 'word_basic');
  const basic = basicItem?.payload as WordBasic | undefined;
  const senses = data.items
    .filter((item) => item.kind === 'sense')
    .sort((a, b) => a.seq - b.seq);
  const running = job?.status === 'running';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link to="/" className="muted small">
            ← 返回单词列表
          </Link>
          <h1 className="word-title serif">{data.word.lemma}</h1>
          <div className="row">
            {basic?.phonetic && <span className="mono muted">{basic.phonetic}</span>}
            {basic?.pos?.map((pos) => (
              <span key={pos} className="badge badge-neutral">
                {pos}
              </span>
            ))}
          </div>
        </div>
        <div className="row">
          {data.stats.pending > 0 && (
            <span className="badge badge-pending">{data.stats.pending} 项待审核</span>
          )}
          <Link className="btn btn-sm" to="/review">
            审核中心
          </Link>
        </div>
      </div>

      {error && <div className="notice notice-error" style={{ marginBottom: 14 }}>{error}</div>}

      {job && (
        <div className={`job-box ${job.status === 'failed' ? 'notice-error' : ''}`}>
          <div className="row">
            <strong>{running ? 'AI 正在生成…' : job.status === 'failed' ? '生成失败' : '生成完成'}</strong>
            {running && <span className="spinner" />}
          </div>
          {job.progress.map((line, index) => (
            <div key={`${index}-${line}`} className="muted small">
              · {line}
            </div>
          ))}
          {job.error && <div className="small danger-text">{job.error}</div>}
        </div>
      )}

      {!basicItem && !running && (
        <div className="card">
          <div className="card-body">
            <p className="muted">
              还没有生成词汇概览。点击下方按钮，让 AI 梳理基本信息与义项清单（不会自动审核通过）。
            </p>
            <button className="btn btn-primary" onClick={startOverview} disabled={starting}>
              {starting ? '启动中…' : '生成单词概览'}
            </button>
          </div>
        </div>
      )}

      {basicItem && (
        <ItemCard
          item={basicItem}
          title="单词基本信息"
          hideKeys={['lemma']}
          onChanged={handleItemChanged}
        />
      )}

      {senses.length > 0 && (
        <>
          <div className="section-title-row">
            <h2 className="section-title">义项研究</h2>
            <span className="muted small">共 {senses.length} 个义项，每个义项独立生成、独立审核。</span>
          </div>
          {senses.map((item) => (
            <SenseBlock
              key={item.id}
              sense={item}
              items={data.items}
              busy={Boolean(running)}
              sourceEnabled={sourceEnabled}
              onChanged={handleItemChanged}
              onStartStudy={(senseId) => void startStudy(senseId)}
              onStartSources={(senseId) => void startSources(senseId)}
            />
          ))}
        </>
      )}

      <div className="card" style={{ marginTop: 22 }}>
        <div className="card-header">
          <h2 className="card-title">AI 调用记录</h2>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => void toggleTasks()}>
            {tasksOpen ? '收起' : '展开'}
          </button>
        </div>
        {tasksOpen && (
          <div className="card-body">
            {!tasks && <div className="empty">加载中…</div>}
            {tasks && tasks.length === 0 && <div className="empty">还没有调用记录。</div>}
            {tasks && tasks.length > 0 && (
              <table className="table">
                <thead>
                  <tr>
                    <th>任务</th>
                    <th>状态</th>
                    <th>模型</th>
                    <th>tokens</th>
                    <th>耗时</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id}>
                      <td className="mono small">{task.taskType}</td>
                      <td>
                        <span
                          className={
                            task.status === 'succeeded'
                              ? 'badge badge-approved'
                              : task.status === 'failed'
                                ? 'badge badge-rejected'
                                : 'badge badge-reanalyzing'
                          }
                        >
                          {task.status}
                        </span>
                        {task.error && <div className="small danger-text">{task.error}</div>}
                      </td>
                      <td className="small">{task.model ?? '—'}</td>
                      <td className="small">
                        {task.promptTokens ?? '—'} / {task.completionTokens ?? '—'}
                      </td>
                      <td className="small">
                        {task.durationMs != null ? `${(task.durationMs / 1000).toFixed(1)}s` : '—'}
                      </td>
                      <td className="small muted">
                        {new Date(task.createdAt).toLocaleString('zh-CN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
