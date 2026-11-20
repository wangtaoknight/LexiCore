import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Word, WordListResponse } from '../api/types';
import { Modal } from '../components/Modal';
import { fuzzyBestMatch } from '../ui/fuzzy';

type Filter = 'pending' | 'all' | 'approved';

type LookupResponse = {
  valid: boolean;
  word: string;
  existing: { id: string; lemma: string; status: string } | null;
};

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m20 20-3.2-3.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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
  const [pendingWord, setPendingWord] = useState<string | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);

  const refresh = useCallback(async () => {
    const next = await api.get<WordListResponse>('/words');
    setData(next);
  }, []);

  useEffect(() => {
    refresh().catch((err) => setError(errorMessage(err)));
  }, [refresh]);

  async function createAndGo(lemma: string) {
    const result = await api.post<{ word: Word; hasOverview: boolean }>('/words', { word: lemma });
    setInput('');
    setPendingWord(null);
    navigate(`/words/${result.word.id}`);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const word = input.trim();
    if (!word) return;
    setSubmitting(true);
    setError(null);
    try {
      const lookup = await api.get<LookupResponse>(
        `/words/lookup?word=${encodeURIComponent(word)}`,
      );
      if (!lookup.valid) {
        setError('请输入合法的英文单词（只能包含字母、空格、连字符或撇号）');
        return;
      }
      if (lookup.existing) {
        setInput('');
        navigate(`/words/${lookup.existing.id}`);
        return;
      }
      setPendingWord(lookup.word);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmCreate() {
    if (!pendingWord) return;
    setSubmitting(true);
    setError(null);
    try {
      await createAndGo(pendingWord);
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

  // 输入 ≥2 个字符时，在词库中找唯一最佳匹配（含拼写容错）
  const suggestion = useMemo(() => {
    const query = input.trim();
    if (hintDismissed || query.length < 2) return null;
    const match = fuzzyBestMatch(
      query,
      words.map((word) => word.lemma),
    );
    if (!match) return null;
    const word = words.find((entry) => entry.lemma === match.lemma);
    return word ? { match, word } : null;
  }, [input, words, hintDismissed]);

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
      <section className="hero-search">
        <form className="search-form" onSubmit={handleSubmit}>
          <div className="search-field">
            <span className="search-icon">
              <SearchIcon />
            </span>
            <input
              className="search-input"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setHintDismissed(false);
                if (error) setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setHintDismissed(true);
              }}
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
        {suggestion && (
          <button
            type="button"
            className={`match-card ${suggestion.match.kind}`}
            onClick={() => navigate(`/words/${suggestion.word.id}`)}
          >
            <span className="match-tag">
              {suggestion.match.kind === 'exact'
                ? '词库中已有'
                : suggestion.match.kind === 'strong'
                  ? '最接近'
                  : '是否想找'}
            </span>
            <span className="match-lemma">{suggestion.word.lemma}</span>
            {suggestion.word.phonetic && (
              <span className="match-phonetic mono">{suggestion.word.phonetic}</span>
            )}
            {suggestion.word.senses[0] && (
              <span className="match-gloss">{suggestion.word.senses[0].cnGloss}</span>
            )}
            <span className="match-go">进入 →</span>
          </button>
        )}
        {/* <p className="search-hint">
          AI 生成的内容会先进入待审核状态，只有你逐条通过后才会进入正式知识库。
        </p> */}
        {error && (
          <div className="notice notice-error" style={{ marginTop: 10 }}>
            {error}
          </div>
        )}
      </section>

      <section className={`word-panel tone-${filter}`} aria-label="单词库">
        <div className="word-panel-top">
          <div className="panel-heading">
            <h2 className="panel-title">单词库</h2>
            <p className="panel-subtitle">
              共 {words.length} 个单词 · 已全部通过 {approvedWords.length} 个
            </p>
          </div>
          <div className="stat-strip" role="tablist" aria-label="按审核状态筛选">
            {filterCards.map((card) => (
              <button
                key={card.key}
                type="button"
                role="tab"
                aria-selected={filter === card.key}
                title={card.hint}
                className={`stat-seg tone-${card.key} ${filter === card.key ? 'active' : ''}`}
                onClick={() => setFilter(card.key)}
              >
                <span className="seg-value">{card.value}</span>
                <span className="seg-label">{card.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel-toolbar">
          <div className="toolbar-left">
            <span className={`toolbar-dot tone-${filter}`} />
            <span className="toolbar-title">
              {filter === 'pending' ? '待审核单词' : filter === 'approved' ? '已通过单词' : '全部单词'}
            </span>
            <span className="toolbar-count">{visible.length}</span>
          </div>
          <span className="toolbar-hint">
            {filter === 'pending'
              ? '尚未全部通过，已生成义项的排在前面'
              : filter === 'approved'
                ? '全部内容都已通过审核'
                : queuedCount > 0
                  ? `其中 ${queuedCount} 个待生成概览`
                  : '按最近更新排序'}
          </span>
        </div>

        {visible.length === 0 ? (
          <div className="empty">{emptyText}</div>
        ) : (
          <div className="table-wrap">
            <table className="modern-table">
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
                      {word.status === 'queued' && (
                        <span className="badge badge-neutral">待生成</span>
                      )}
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
                            <span className="sense-entry" key={`${sense.senseNo}-${senseIndex}`}>
                              <span className="sense-index">{sense.senseNo}.</span>
                              <span>{sense.cnGloss}</span>
                              {senseIndex < word.senses.length - 1 ? (
                                <span className="sense-sep">；</span>
                              ) : null}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pendingWord && (
        <Modal
          title="该单词不在当前词库中"
          onClose={() => setPendingWord(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setPendingWord(null)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={submitting}
                onClick={() => void confirmCreate()}
              >
                {submitting ? '创建中…' : '继续研究'}
              </button>
            </>
          }
        >
          <p className="dialog-lead">「{pendingWord}」不在当前词库中，是否继续研究？</p>
          <p className="hint">继续后会为它创建新的词条，并从零开始生成研究内容。</p>
          {error && <div className="notice notice-error small">{error}</div>}
        </Modal>
      )}
    </div>
  );
}
