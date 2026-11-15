import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Word, WordListResponse } from '../api/types';

type Filter = 'pending' | 'all' | 'approved';

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [data, setData] = useState<WordListResponse | null>(null);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');

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

  const words = useMemo(() => data?.words ?? [], [data]);
  // 待审核 = 还没有「全部内容都通过审核」的单词；已生成义项的排前面，待生成的排后面
  const pendingWords = useMemo(() => {
    const notApproved = words.filter(
      (word) => !(word.itemCount > 0 && word.approvedCount === word.itemCount),
    );
    return [...notApproved].sort(
      (a, b) => Number(a.status === 'queued') - Number(b.status === 'queued'),
    );
  }, [words]);
  const approvedWords = useMemo(
    () => words.filter((word) => word.itemCount > 0 && word.approvedCount === word.itemCount),
    [words],
  );
  const queuedCount = useMemo(
    () => words.filter((word) => word.status === 'queued').length,
    [words],
  );

  const visible =
    filter === 'pending' ? pendingWords : filter === 'approved' ? approvedWords : words;

  const filterCards: Array<{ key: Filter; title: string; hint: string; value: number }> = [
    { key: 'pending', title: '待审核', hint: '个单词尚未全部通过', value: pendingWords.length },
    { key: 'all', title: '单词总数', hint: '个单词已收录', value: words.length },
    { key: 'approved', title: '已审核通过', hint: '个单词内容已全部通过', value: approvedWords.length },
  ];

  const emptyText =
    filter === 'pending'
      ? '当前没有待审核的单词。所有内容都已通过，或还没有添加单词。'
      : filter === 'approved'
        ? '还没有全部通过审核的单词。一条条审核通过后，单词会出现在这里。'
        : '还没有研究记录，先输入一个单词开始。';

  return (
    <div className="page home-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">单词研究</h1>
          <p className="page-desc">
            输入一个英文单词，先由 AI 辅助梳理义项清单；针对每个义项，由人工逐条审核后进入知识库。
          </p>
        </div>
      </div>

      <section className="hero-search">
        <form className="search-form" onSubmit={handleSubmit}>
          <div className="search-field">
            <span className="search-icon">
              <SearchIcon />
            </span>
            <input
              className="search-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="输入英文单词，例如 ambition"
              autoFocus
            />
          </div>
          <button
            className="btn research-btn"
            type="submit"
            disabled={submitting || !input.trim()}
          >
            {submitting ? '创建中…' : '开始研究'}
            {!submitting && <span aria-hidden="true">→</span>}
          </button>
        </form>
        <p className="search-hint">
          AI 生成的内容会先进入待审核状态，只有你逐条通过后才会进入正式知识库。
        </p>
        {error && (
          <div className="notice notice-error" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
      </section>

      <section className="filter-cards" aria-label="单词列表筛选">
        {filterCards.map((card) => (
          <button
            key={card.key}
            type="button"
            className={`filter-card tone-${card.key} ${filter === card.key ? 'active' : ''}`}
            aria-pressed={filter === card.key}
            onClick={() => setFilter(card.key)}
          >
            <span className="filter-top">
              <span className="filter-title">{card.title}</span>
              <ChevronIcon />
            </span>
            <span className="filter-value">{card.value}</span>
            <span className="filter-hint">{card.hint}</span>
          </button>
        ))}
      </section>

      <section className={`card word-table-card tone-${filter}`}>
        <div className="card-header">
          <div>
            <h2 className="card-title">
              {filter === 'pending' ? '待审核单词' : filter === 'approved' ? '已通过单词' : '全部单词'}
            </h2>
            <p className="card-subtitle">
              {filter === 'pending'
                ? '尚未全部通过审核的单词，已生成义项的排在前面'
                : filter === 'approved'
                  ? '全部内容都已通过审核的单词'
                  : `版本库中的全部单词${queuedCount > 0 ? `（其中 ${queuedCount} 个待生成概览）` : ''}`}
            </p>
          </div>
          <span className="badge badge-neutral">{visible.length} 个单词</span>
        </div>

        {visible.length === 0 ? (
          <div className="empty">{emptyText}</div>
        ) : (
          <table className="table word-table">
            <thead>
              <tr>
                <th className="col-idx" scope="col" aria-label="序号" />
                <th>单词</th>
                <th>音标</th>
                <th>词性</th>
                <th>义项</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((word, index) => (
                <tr
                  key={word.id}
                  className={word.status === 'queued' ? 'row-queued' : undefined}
                  onClick={() => navigate(`/words/${word.id}`)}
                >
                  <td className="col-idx">{index + 1}</td>
                  <td>
                    <span className="word-lemma">{word.lemma}</span>
                    {word.status === 'queued' && <span className="badge badge-neutral">待生成</span>}
                  </td>
                  <td className="mono muted small">{word.phonetic || '—'}</td>
                  <td>
                    {word.pos.length > 0 ? (
                      word.pos.map((pos, posIndex) => (
                        <span className="pos-chip" key={`${pos}-${posIndex}`}>
                          {pos}
                        </span>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td className="sense-cell">
                    {word.senses.length === 0 ? (
                      <span className="muted small">尚未生成义项</span>
                    ) : (
                      <span className="sense-line">
                        {word.senses.map((sense, senseIndex) => (
                          <span key={`${sense.senseNo}-${senseIndex}`}>
                            {sense.senseNo}. {sense.cnGloss}
                            {senseIndex < word.senses.length - 1 ? '；' : ''}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
