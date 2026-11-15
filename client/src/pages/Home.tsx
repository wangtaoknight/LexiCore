import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Word, WordListResponse } from '../api/types';
import { formatDate } from '../ui/labels';

export default function HomePage() {
  const navigate = useNavigate();
  const [data, setData] = useState<WordListResponse | null>(null);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await api.get<WordListResponse>('/words');
    setData(next);
  }, []);

  useEffect(() => {
    refresh().catch((err) => setError(errorMessage(err)));
  }, [refresh]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const word = input.trim();
    if (!word) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<{ word: Word; hasOverview: boolean }>('/words', { word });
      setInput('');
      navigate(`/words/${result.word.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const stats = data?.stats;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">单词研究</h1>
          <p className="page-desc">
            输入一个英文单词，先由 AI 辅助梳理义项清单；
            针对每个义项，由人工逐条审核后进入知识库。
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={handleSubmit}>
            <input
              className="input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="输入英文单词，例如 ambition"
              autoFocus
            />
            <button className="btn btn-primary" type="submit" disabled={submitting || !input.trim()}>
              {submitting ? '创建中…' : '开始研究'}
            </button>
          </form>
          {error && (
            <div className="notice notice-error" style={{ marginTop: 12 }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.studiedWordCount}</div>
            <div className="stat-label">已生成概览的单词</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.wordCount}</div>
            <div className="stat-label">单词总数</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--warn)' }}>
              {stats.pendingItemCount}
            </div>
            <div className="stat-label">待审核内容</div>
          </div>
          <div className="stat-card">
            <div className="stat-value" style={{ color: 'var(--ok)' }}>
              {stats.approvedItemCount}
            </div>
            <div className="stat-label">已通过内容</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">单词列表</h2>
          <span className="muted small">{data?.words.length ?? 0} 个单词</span>
        </div>
        {data && data.words.length === 0 ? (
          <div className="empty">还没有研究记录，先输入一个单词开始。</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>单词</th>
                <th>义项</th>
                <th>待审核</th>
                <th>已通过</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              {data?.words.map((word) => (
                <tr key={word.id}>
                  <td>
                    <Link className="word-lemma" to={`/words/${word.id}`}>
                      {word.lemma}
                    </Link>
                    {word.status === 'queued' && (
                      <span className="badge badge-neutral" style={{ marginLeft: 8 }}>
                        待生成
                      </span>
                    )}
                  </td>
                  <td>{word.senseCount}</td>
                  <td>
                    {word.pendingCount > 0 ? (
                      <span className="badge badge-pending">{word.pendingCount}</span>
                    ) : (
                      <span className="muted">0</span>
                    )}
                  </td>
                  <td>{word.approvedCount}</td>
                  <td className="muted small">{formatDate(word.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
