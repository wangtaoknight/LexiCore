import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import type { Item, ReviewQueueResponse } from '../api/types';
import { ItemCard } from '../components/ItemCard';
import { KIND_LABEL, itemTitle } from '../ui/labels';

const STATUS_OPTIONS = [
  { value: 'pending', label: '待审核' },
  { value: 'rejected', label: '已驳回' },
  { value: 'approved', label: '已通过' },
  { value: 'all', label: '全部' },
];

export default function ReviewPage() {
  const [status, setStatus] = useState('pending');
  const [kind, setKind] = useState('');
  const [data, setData] = useState<ReviewQueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status });
    if (kind) params.set('kind', kind);
    const next = await api.get<ReviewQueueResponse>(`/review/queue?${params.toString()}`);
    setData(next);
  }, [status, kind]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [load]);

  function handleChanged(item: Item) {
    if (status === 'all') {
      setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((entry) =>
                entry.id === item.id ? { ...item, lemma: entry.lemma } : entry,
              ),
            }
          : prev,
      );
      return;
    }
    // 状态筛选下，条目状态变化后直接移出队列
    setData((prev) =>
      prev
        ? { ...prev, items: prev.items.filter((entry) => entry.id !== item.id) }
        : prev,
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">审核中心</h1>
          <p className="page-desc">
            所有 AI 生成内容都必须人工通过才会进入正式知识库。逐条审核，不用整词接受或拒绝。
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-body row">
          <div className="field" style={{ width: 180 }}>
            <label className="label" htmlFor="status">
              审核状态
            </label>
            <select
              id="status"
              className="select"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ width: 200 }}>
            <label className="label" htmlFor="kind">
              内容类型
            </label>
            <select
              id="kind"
              className="select"
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="">全部类型</option>
              {Object.entries(KIND_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="spacer" />
          <span className="muted small">{data ? `${data.total} 条` : ''}</span>
        </div>
      </div>

      {error && (
        <div className="notice notice-error" style={{ marginTop: 14 }}>
          {error}
        </div>
      )}

      {loading && <div className="empty">加载中…</div>}

      {!loading && data && data.items.length === 0 && (
        <div className="card">
          <div className="empty">
            当前筛选条件下没有内容。
            {status === 'pending' && ' 去单词页生成一些研究内容吧。'}
          </div>
        </div>
      )}

      {!loading &&
        data?.items.map((item) => (
          <div key={item.id} style={{ marginTop: 14 }}>
            <div className="queue-meta">
              <Link to={`/words/${item.wordId}`} className="word-lemma">
                {item.lemma}
              </Link>
              <span className="badge badge-neutral">{KIND_LABEL[item.kind]}</span>
            </div>
            <ItemCard
              item={item}
              title={itemTitle(item)}
              onChanged={handleChanged}
              hideKeys={item.kind === 'sense' ? ['senseNo', 'cnGloss'] : []}
            />
          </div>
        ))}
    </div>
  );
}
