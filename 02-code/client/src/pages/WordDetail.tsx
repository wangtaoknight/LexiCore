import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Job, WordDetailResponse } from '../api/types';
import { Modal } from '../components/Modal';
import { PayloadView } from '../components/PayloadView';
import { ReviewActions } from '../components/ReviewActions';
import { SenseBlock } from '../components/SenseBlock';

type WordBasic = {
  phonetic?: string;
  pos?: string[];
  etymology?: string;
  semanticHistory?: string;
  coreMeaning?: string | null;
  coreMeaningNote?: string | null;
};

type SensePayload = {
  senseNo: number;
  pos: string;
  cnGloss: string;
  frequency?: string;
  cet6Importance?: string;
};

const FREQ_RANK: Record<string, number> = { high: 0, mid: 1, low: 2 };
const IMPORTANCE_RANK: Record<string, number> = { high: 0, mid: 1, low: 2 };

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
  const [activeSenseId, setActiveSenseId] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [foldOpen, setFoldOpen] = useState(true);
  const [showTabs, setShowTabs] = useState(false);
  const [confirmApproveAll, setConfirmApproveAll] = useState(false);
  const [approveAllBusy, setApproveAllBusy] = useState(false);
  const [approveAllError, setApproveAllError] = useState<string | null>(null);

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

  async function startAntonyms(senseId: string) {
    setError(null);
    try {
      const result = await api.post<{ job: Job }>(`/items/${senseId}/antonyms`);
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
  // 义项按常见程度排序：一般使用频率 → 六级重要程度 → 原始序号
  const senses = data.items
    .filter((item) => item.kind === 'sense')
    .sort((a, b) => {
      const pa = a.payload as unknown as SensePayload;
      const pb = b.payload as unknown as SensePayload;
      const byFreq = (FREQ_RANK[pa.frequency ?? ''] ?? 3) - (FREQ_RANK[pb.frequency ?? ''] ?? 3);
      if (byFreq !== 0) return byFreq;
      const byImportance =
        (IMPORTANCE_RANK[pa.cet6Importance ?? ''] ?? 3) -
        (IMPORTANCE_RANK[pb.cet6Importance ?? ''] ?? 3);
      if (byImportance !== 0) return byImportance;
      return a.seq - b.seq;
    });
  const activeSense = senses.find((item) => item.id === activeSenseId) ?? senses[0] ?? null;
  // 义项「审核完成」= 义项本身及其全部子条目都已通过审核
  const childrenByParent = new Map<string, WordDetailResponse['items']>();
  for (const item of data.items) {
    if (!item.parentId) continue;
    const list = childrenByParent.get(item.parentId);
    if (list) list.push(item);
    else childrenByParent.set(item.parentId, [item]);
  }
  const reviewedSenseCount = senses.filter((sense) => {
    if (sense.status !== 'approved') return false;
    const children = childrenByParent.get(sense.id) ?? [];
    return children.every((child) => child.status === 'approved');
  }).length;
  const allSensesReviewed = senses.length > 0 && reviewedSenseCount === senses.length;
  // 界面按频率重排后，编号也随顺序重编（1..N），避免编号跳跃
  const displayNoById = new Map(senses.map((sense, index) => [sense.id, index + 1]));
  const running = job?.status === 'running';

  const approveAllTargets = activeSense
    ? [activeSense, ...data.items.filter((item) => item.parentId === activeSense.id)]
    : [];
  const approveAllPending = approveAllTargets.filter((item) => item.status !== 'approved');

  async function approveAllUnderSense() {
    if (approveAllPending.length === 0) {
      setConfirmApproveAll(false);
      return;
    }
    setApproveAllBusy(true);
    setApproveAllError(null);
    try {
      for (const item of approveAllPending) {
        await api.post(`/items/${item.id}/approve`);
      }
      setConfirmApproveAll(false);
      await load();
    } catch (err) {
      setApproveAllError(errorMessage(err));
    } finally {
      setApproveAllBusy(false);
    }
  }

  return (
    <div className="page word-detail-page">
      {error && (
        <div className="notice notice-error" style={{ marginBottom: 14 }}>
          {error}
        </div>
      )}

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

      <div className="word-layout">
        <aside className="word-side">
          <div className="word-head">
            <div className="word-head-top">
              <h1 className="word-title serif">{data.word.lemma}</h1>
              <span className={`review-flag ${allSensesReviewed ? 'is-done' : 'is-pending'}`}>
                {allSensesReviewed
                  ? '已审核'
                  : senses.length > 0
                    ? `待审核 ${reviewedSenseCount}/${senses.length}`
                    : '待审核'}
              </span>
            </div>
            <div className="word-head-meta">
              {basic?.phonetic && <span className="mono muted">{basic.phonetic}</span>}
              {basic?.pos?.map((pos) => (
                <span key={pos} className="pos-chip">
                  {pos}
                </span>
              ))}
              {!basic?.phonetic && (!basic?.pos || basic.pos.length === 0) && (
                <span className="muted small">尚未生成基本信息</span>
              )}
            </div>
          </div>

          {!basicItem && !running && (
            <div className="card">
              <div className="card-body">
                <p className="muted small">
                  还没有生成词汇概览。让 AI 梳理基本信息与义项清单（不会自动审核通过）。
                </p>
                <button className="btn btn-primary btn-sm" onClick={startOverview} disabled={starting}>
                  {starting ? '启动中…' : '生成单词概览'}
                </button>
              </div>
            </div>
          )}

          {/* 当代词义地图：只复用已有义项，不生成新内容；超过 3 项时左侧提供展开/收起 */}
          <section className="side-section">
            {senses.length > 0 ? (
              <div className={`concept-map-wrap ${senses.length > 3 ? 'has-more' : ''}`}>
                {senses.length > 3 && (
                  <button
                    type="button"
                    className={`concept-map-rail ${mapExpanded ? 'expanded' : ''}`}
                    aria-expanded={mapExpanded}
                    aria-label={mapExpanded ? '收起义项列表' : `展开全部 ${senses.length} 个义项`}
                    title={mapExpanded ? '收起义项列表' : `展开全部 ${senses.length} 个义项`}
                    onClick={() => setMapExpanded((value) => !value)}
                  >
                    <svg className="concept-map-caret" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="m3 16 9-9 9 9"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
                <ol className="concept-map">
                  {(mapExpanded ? senses : senses.slice(0, 3)).map((item) => {
                    const payload = item.payload as unknown as SensePayload;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`concept-map-item ${activeSense?.id === item.id ? 'active' : ''}`}
                          title="在右侧查看该义项"
                          onClick={() => setActiveSenseId(item.id)}
                        >
                          <span className="concept-map-no">{displayNoById.get(item.id)}</span>
                          <span className="concept-map-gloss">{payload.cnGloss}</span>
                          <span className="mono concept-map-pos">{payload.pos}</span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : (
              <p className="concept-map-empty">
                还没有当代义项。生成单词概览后，这里会按常见程度列出义项；不会用旧的核心意义代替。
              </p>
            )}
          </section>

          {/* 词源与词义脉络：只做展示层合并（可折叠），数据字段不动 */}
          {basicItem && (
            <details
              className="side-fold"
              open={foldOpen}
              onToggle={(event) => setFoldOpen(event.currentTarget.open)}
            >
              <summary className="side-fold-summary">
                <span className="side-section-title">词源与词义脉络</span>
                <span className="side-fold-hint">
                  <span className="hint-idle">展开</span>
                  <span className="hint-open">收起</span>
                </span>
              </summary>
              <div className="side-fold-body">
                <PayloadView
                  kind="word_basic"
                  payload={basicItem.payload}
                  orderKeys={['etymology', 'semanticHistory']}
                />
                <div className="module-actions">
                  <ReviewActions item={basicItem} onChanged={handleItemChanged} />
                </div>
              </div>
            </details>
          )}
        </aside>

        <section className="word-main">
          <div className="section-title-row">
            <div className="section-title-left">
              <button
                className="section-title section-title-btn"
                type="button"
                title="点击：将当前义项下的内容全部审核通过"
                onClick={() => {
                  setApproveAllError(null);
                  setConfirmApproveAll(true);
                }}
              >
                义项研究
              </button>
              {senses.length > 1 && (
                <button
                  className={`section-toggle ${showTabs ? 'on' : ''}`}
                  type="button"
                  aria-expanded={showTabs}
                  title={showTabs ? '隐藏义项切换标签' : '显示义项切换标签'}
                  onClick={() => setShowTabs((value) => !value)}
                >
                  <svg className="module-caret" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="m3 16 9-9 9 9"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>

          </div>

          <div className="sense-panel">
            {senses.length > 0 && showTabs && (
              <div className="sense-tabs" role="tablist" aria-label="义项切换">
                {senses.map((item) => {
                  const payload = item.payload as unknown as SensePayload;
                  const active = activeSense?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={`sense-tab ${active ? 'active' : ''}`}
                      onClick={() => setActiveSenseId(item.id)}
                    >
                      <span className="sense-tab-no">{displayNoById.get(item.id) ?? payload.senseNo}</span>
                      <span className="sense-tab-gloss">{payload.cnGloss}</span>
                      {item.status !== 'approved' && (
                        <span className={`sense-tab-dot status-${item.status}`} aria-hidden="true" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="sense-scroll">
              {activeSense && (
                <SenseBlock
                  key={activeSense.id}
                  sense={activeSense}
                  displayNo={displayNoById.get(activeSense.id)}
                  items={data.items}
                  busy={Boolean(running)}
                  sourceEnabled={sourceEnabled}
                  onChanged={handleItemChanged}
                  onStartStudy={(senseId) => void startStudy(senseId)}
                  onStartSources={(senseId) => void startSources(senseId)}
                  onStartAntonyms={(senseId) => void startAntonyms(senseId)}
                />
              )}

              {senses.length === 0 && !running && (
                <div className="empty">还没有义项。生成单词概览后，AI 会给出义项清单。</div>
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
          </div>
        </section>
      </div>

      {confirmApproveAll && (
        <Modal
          title="是否将「义项研究」下的内容全部审核通过？"
          onClose={() => setConfirmApproveAll(false)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setConfirmApproveAll(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={approveAllBusy}
                onClick={() => void approveAllUnderSense()}
              >
                {approveAllBusy ? '提交中…' : `全部通过（${approveAllPending.length} 条）`}
              </button>
            </>
          }
        >
          <p className="hint">
            将把当前义项
            {activeSense
              ? `「${displayNoById.get(activeSense.id)}. ${String(
                  (activeSense.payload as unknown as SensePayload).cnGloss,
                )}」`
              : ''}
            及其下所有待审核内容一次性通过，包括已驳回的条目。此操作无法批量撤销，只能逐条「解除通过」。
          </p>
          {approveAllError && <div className="notice notice-error small">{approveAllError}</div>}
        </Modal>
      )}
    </div>
  );
}
