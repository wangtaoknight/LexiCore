import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Item, ItemVersion, Job } from '../api/types';
import { diffPayload } from '../ui/diff';
import { FIELD_SPECS, formToPayload, payloadToForm } from '../ui/fields';
import { formatDate } from '../ui/labels';
import { Modal } from './Modal';

const CHANGE_SOURCE_LABEL: Record<ItemVersion['changeSource'], string> = {
  ai_initial: 'AI 初始生成',
  ai_revision: 'AI 重新分析',
  human_edit: '人工修改',
};

export function ReviewActions({
  item,
  onChanged,
}: {
  item: Item;
  onChanged: (item: Item) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'reject' | 'edit' | 'history' | 'reanalyze' | 'ask' | null>(null);
  const [comment, setComment] = useState('');
  const [form, setForm] = useState<Record<string, string>>({});
  const [versions, setVersions] = useState<ItemVersion[] | null>(null);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);
  const [reanalyzeComment, setReanalyzeComment] = useState('');
  const [reanalyzeJob, setReanalyzeJob] = useState<Job | null>(null);
  const [reanalyzeJobId, setReanalyzeJobId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  });

  useEffect(() => {
    if (!reanalyzeJobId) return;
    const source = new EventSource(`/api/jobs/${reanalyzeJobId}/stream`);
    source.onmessage = (event) => {
      const next = JSON.parse(event.data) as Job;
      setReanalyzeJob(next);
      if (next.status !== 'running') {
        source.close();
        setReanalyzeJobId(null);
        void api
          .get<{ item: Item }>(`/items/${item.id}`)
          .then((result) => onChangedRef.current(result.item))
          .catch(() => undefined);
      }
    };
    source.onerror = () => {
      source.close();
      setReanalyzeJobId(null);
    };
    return () => source.close();
  }, [reanalyzeJobId, item.id]);

  async function run(request: () => Promise<{ item: Item }>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const result = await request();
      onChanged(result.item);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function openHistory() {
    setMode('history');
    setVersions(null);
    try {
      const result = await api.get<{ versions: ItemVersion[] }>(`/items/${item.id}/versions`);
      setVersions(result.versions);
      const previous = result.versions.find((version) => version.versionNo !== item.currentVersion);
      setCompareVersion(previous?.versionNo ?? result.versions[0]?.versionNo ?? null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function openReanalyze() {
    setReanalyzeComment('');
    setMode('reanalyze');
    try {
      const result = await api.get<{ versions: ItemVersion[] }>(`/items/${item.id}/versions`);
      const lastFeedback = result.versions.find((version) => version.feedback)?.feedback;
      if (lastFeedback) setReanalyzeComment(lastFeedback);
    } catch {
      // 预填失败不影响重新分析
    }
  }

  async function submitReanalyze() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ job: Job }>(`/items/${item.id}/reanalyze`, {
        comment: reanalyzeComment,
      });
      setReanalyzeJob(result.job);
      setReanalyzeJobId(result.job.id);
      setMode(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitAsk() {
    if (!question.trim()) return;
    setAsking(true);
    setAnswer(null);
    setError(null);
    try {
      const result = await api.post<{ answer: string }>(`/items/${item.id}/explain`, {
        question: question.trim(),
      });
      setAnswer(result.answer);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAsking(false);
    }
  }

  const selected = versions?.find((version) => version.versionNo === compareVersion) ?? null;
  const diffRows =
    selected && selected.versionNo !== item.currentVersion
      ? diffPayload(item.kind, item.payload, selected.payload)
      : [];

  return (
    <>
      <div className="review-actions">
        {item.status !== 'approved' && (
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={busy || item.status === 'reanalyzing'}
            onClick={() => void run(() => api.post<{ item: Item }>(`/items/${item.id}/approve`))}
          >
            通过
          </button>
        )}
        {item.status !== 'approved' && (
          <button
            className="btn btn-danger btn-sm"
            type="button"
            disabled={busy || item.status === 'reanalyzing'}
            onClick={() => {
              setComment('');
              setMode('reject');
            }}
          >
            驳回
          </button>
        )}
        {item.status === 'approved' && (
          <button
            className="btn btn-sm"
            type="button"
            disabled={busy}
            onClick={() => void run(() => api.post<{ item: Item }>(`/items/${item.id}/unpublish`))}
          >
            解除通过
          </button>
        )}
        {item.status !== 'approved' && (
          <button
            className="btn btn-sm"
            type="button"
            disabled={busy || Boolean(reanalyzeJobId)}
            onClick={() => void openReanalyze()}
          >
            重新分析
          </button>
        )}
        <button
          className="btn btn-sm"
          type="button"
          disabled={busy}
          onClick={() => {
            setForm(payloadToForm(item.kind, item.payload));
            setMode('edit');
          }}
        >
          修改
        </button>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          onClick={() => {
            setQuestion('');
            setAnswer(null);
            setMode('ask');
          }}
        >
          追问
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => void openHistory()}>
          历史 v{item.currentVersion}
        </button>
      </div>

      {error && !mode && (
        <div className="notice notice-error small" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}

      {reanalyzeJob && (
        <div
          className={
            reanalyzeJob.status === 'failed'
              ? 'job-box notice-error'
              : reanalyzeJob.status === 'succeeded'
                ? 'job-box job-box-done'
                : 'job-box'
          }
          style={{ marginTop: 10 }}
        >
          <div className="row">
            <strong>
              {reanalyzeJob.status === 'running'
                ? '重新分析中…'
                : reanalyzeJob.status === 'failed'
                  ? '重新分析失败（已恢复原状态）'
                  : '重新分析完成，已生成新版本'}
            </strong>
            {reanalyzeJob.status === 'running' && <span className="spinner" />}
          </div>
          {reanalyzeJob.progress.map((line, index) => (
            <div key={`${index}-${line}`} className="muted small">
              · {line}
            </div>
          ))}
          {reanalyzeJob.error && <div className="small danger-text">{reanalyzeJob.error}</div>}
        </div>
      )}

      {mode === 'reject' && (
        <Modal
          title="驳回这条内容"
          onClose={() => setMode(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setMode(null)}>
                取消
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={busy}
                onClick={async () => {
                  const ok = await run(() =>
                    api.post<{ item: Item }>(`/items/${item.id}/reject`, { comment }),
                  );
                  if (ok) setMode(null);
                }}
              >
                {busy ? '提交中…' : '确认驳回'}
              </button>
            </>
          }
        >
          <p className="hint">
            驳回意见会永久保存，并在「重新分析」时作为修改依据。写清楚问题比简单否定更有用。
          </p>
          <textarea
            className="textarea"
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="例如：这个概念解释过于宽泛，没有说明与 assume 的区别。"
          />
          {error && <div className="notice notice-error small">{error}</div>}
        </Modal>
      )}

      {mode === 'edit' && (
        <Modal
          title="人工修改（保存后需要重新审核）"
          onClose={() => setMode(null)}
          wide
          footer={
            <>
              <button className="btn" type="button" onClick={() => setMode(null)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={async () => {
                  const payload = formToPayload(item.kind, form);
                  const ok = await run(() =>
                    api.patch<{ item: Item }>(`/items/${item.id}`, { payload }),
                  );
                  if (ok) setMode(null);
                }}
              >
                {busy ? '保存中…' : '保存并重新提交审核'}
              </button>
            </>
          }
        >
          <div className="stack">
            {FIELD_SPECS[item.kind].map((spec) => (
              <div className="field" key={spec.key}>
                <label className="label" htmlFor={`field-${spec.key}`}>
                  {spec.label}
                </label>
                {spec.type === 'textarea' || spec.type === 'list' ? (
                  <textarea
                    id={`field-${spec.key}`}
                    className="textarea"
                    rows={spec.rows ?? 3}
                    value={form[spec.key] ?? ''}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, [spec.key]: event.target.value }))
                    }
                  />
                ) : spec.type === 'select' ? (
                  <select
                    id={`field-${spec.key}`}
                    className="select"
                    value={form[spec.key] ?? ''}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, [spec.key]: event.target.value }))
                    }
                  >
                    {spec.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`field-${spec.key}`}
                    className="input"
                    value={form[spec.key] ?? ''}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, [spec.key]: event.target.value }))
                    }
                  />
                )}
                {spec.type === 'list' && <span className="hint">每行一条</span>}
                {spec.nullable && <span className="hint">可留空</span>}
              </div>
            ))}
            {error && <div className="notice notice-error small">{error}</div>}
          </div>
        </Modal>
      )}

      {mode === 'history' && (
        <Modal
          title="版本与审核记录"
          onClose={() => setMode(null)}
          wide
          footer={
            <button className="btn" type="button" onClick={() => setMode(null)}>
              关闭
            </button>
          }
        >
          {!versions && <div className="empty">加载版本中…</div>}
          {versions && (
            <div className="history-layout">
              <div className="history-list">
                {versions.map((version) => (
                  <label
                    key={version.id}
                    className={
                      version.versionNo === compareVersion ? 'history-item active' : 'history-item'
                    }
                  >
                    <input
                      type="radio"
                      name={`version-${item.id}`}
                      checked={version.versionNo === compareVersion}
                      onChange={() => setCompareVersion(version.versionNo)}
                    />
                    <span>
                      <strong>v{version.versionNo}</strong>{' '}
                      <span className="muted small">
                        {CHANGE_SOURCE_LABEL[version.changeSource]} ·{' '}
                        {formatDate(version.createdAt)}
                      </span>
                      {version.feedback && (
                        <span className="block small">驳回意见：{version.feedback}</span>
                      )}
                      {version.note && <span className="block small">修改说明：{version.note}</span>}
                    </span>
                  </label>
                ))}
              </div>
              <div className="history-diff">
                {selected && selected.versionNo === item.currentVersion ? (
                  <div className="empty">当前版本就是 v{selected.versionNo}，没有差异。</div>
                ) : selected ? (
                  <>
                    <p className="hint">
                      对比：v{selected.versionNo} → 当前 v{item.currentVersion}
                    </p>
                    {diffRows.map((row) => (
                      <div
                        key={row.key}
                        className={row.changed ? 'diff-row changed' : 'diff-row'}
                      >
                        <div className="diff-label">{row.label}</div>
                        {row.changed ? (
                          <div className="diff-pair">
                            <div className="diff-old">{row.oldText || '（空）'}</div>
                            <div className="diff-new">{row.newText || '（空）'}</div>
                          </div>
                        ) : (
                          <div className="muted small">未修改</div>
                        )}
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="empty">选择一个版本查看差异</div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}

      {mode === 'reanalyze' && (
        <Modal
          title="重新分析这条内容"
          onClose={() => setMode(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setMode(null)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={() => void submitReanalyze()}
              >
                {busy ? '提交中…' : '开始重新分析'}
              </button>
            </>
          }
        >
          <p className="hint">
            AI 会结合当前内容、历史意见与同义项上下文重写这一条，生成新版本；旧版本永久保留在「历史」中。
          </p>
          <textarea
            className="textarea"
            rows={4}
            value={reanalyzeComment}
            onChange={(event) => setReanalyzeComment(event.target.value)}
            placeholder="说明哪里不准确、需要补充什么。例如：边界写得过于宽泛，没有说明与 halt 的区别。"
          />
          {error && <div className="notice notice-error small">{error}</div>}
        </Modal>
      )}

      {mode === 'ask' && (
        <Modal
          title="追问这条内容"
          onClose={() => setMode(null)}
          footer={
            <button className="btn" type="button" onClick={() => setMode(null)}>
              关闭
            </button>
          }
        >
          <div className="stack">
            <div className="field">
              <label className="label" htmlFor={`question-${item.id}`}>
                问题
              </label>
              <textarea
                id={`question-${item.id}`}
                className="textarea"
                rows={3}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="例如：这个义项和 assume 的区别到底是什么？"
              />
            </div>
            <div className="row">
              <button
                className="btn btn-primary btn-sm"
                type="button"
                disabled={asking || !question.trim()}
                onClick={() => void submitAsk()}
              >
                {asking ? '思考中…' : '提问'}
              </button>
              <span className="hint">追问结果不会写入数据库，仅用于帮助理解。</span>
            </div>
            {answer && <div className="notice" style={{ whiteSpace: 'pre-wrap' }}>{answer}</div>}
            {error && <div className="notice notice-error small">{error}</div>}
          </div>
        </Modal>
      )}
    </>
  );
}
