import { useEffect, useState } from 'react';
import { errorMessage } from '../api/client';

type DictSummary = {
  index: number;
  id: string;
  name: string;
  /** 设置页为词典配置的简称；为空时自动截断 */
  shortName: string;
  hit: boolean;
  keyText: string | null;
  matchedWord: string | null;
  length: number;
  error?: string;
};

type DictViewMode = 'filter' | 'list';
type DictPanelMode = 'drawer' | 'popup';

/**
 * 标签文案：优先用设置里的简称；否则取前两个词（中文取前两个字）。
 * "Cambridge Advanced Learner's Dictionary 4th" → "Cambridge Advanced"
 * "LongmanDictionaryOfContemporaryEnglish6thEnEn" → "Longman Dictionary"
 * "朗文双解" → "朗文"
 */
function labelOf(item: DictSummary): string {
  if (item.shortName) return item.shortName;
  const words = item.name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 2).join(' ');
  const camel = item.name.split(/(?=[A-Z])/).filter(Boolean);
  if (camel.length >= 2) return camel.slice(0, 2).join(' ');
  return item.name.slice(0, 2) || '词典';
}

/**
 * 词典查询面板：双击单词标题时打开。
 * - filter 模式：右侧竖向词典跳转栏（带编号），主区只渲染当前词典的 iframe；
 * - list 模式：所有词典自上而下堆叠，可逐个展开；
 * - panelMode 控制面板靠边展示（drawer）还是居中弹出（popup）。
 * 正文用 iframe 加载 /api/dicts/:id/render，词典自带 CSS/JS 与站点样式完全隔离，
 * 喇叭图标由服务端重写为音频路由。
 */
export function DictPanel({ word, onClose }: { word: string; onClose: () => void }) {
  const [items, setItems] = useState<DictSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<DictViewMode>('filter');
  const [panelMode, setPanelMode] = useState<DictPanelMode>('drawer');
  const [fontScale, setFontScale] = useState(100);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    fetch(`/api/dicts/lookup?word=${encodeURIComponent(word)}`)
      .then(async (response) => {
        const body = (await response.json()) as {
          results?: DictSummary[];
          viewMode?: DictViewMode;
          panelMode?: DictPanelMode;
          fontScale?: number;
          error?: { message?: string };
        };
        if (!response.ok) throw new Error(body.error?.message ?? `查询失败（HTTP ${response.status}）`);
        return {
          results: body.results ?? [],
          viewMode: body.viewMode ?? 'filter',
          panelMode: body.panelMode ?? 'drawer',
          fontScale: body.fontScale ?? 100,
        };
      })
      .then(({ results, viewMode: mode, panelMode: panel, fontScale: scale }) => {
        if (cancelled) return;
        setItems(results);
        setViewMode(mode);
        setPanelMode(panel);
        setFontScale(scale);
        const firstHit = results.find((item) => item.hit);
        setActiveId(firstHit?.id ?? results[0]?.id ?? null);
        setOpened(new Set(firstHit ? [firstHit.id] : []));
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [word]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hitCount = items?.filter((item) => item.hit).length ?? 0;
  const activeItem = items?.find((item) => item.id === activeId) ?? null;

  /** 面板呈现方式就地切换：先改本地状态，再静默写回设置（下次打开仍生效） */
  async function switchPanelMode(mode: DictPanelMode) {
    if (mode === panelMode) return;
    setPanelMode(mode);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dictPanelMode: mode }),
      });
    } catch {
      // 保存失败不影响当前会话的显示效果
    }
  }

  /** 筛选 / 列表就地切换，同样写回设置作为下次默认值 */
  async function switchViewMode(mode: DictViewMode) {
    if (mode === viewMode) return;
    setViewMode(mode);
    if (mode === 'filter' && !activeId && items && items.length > 0) {
      const firstHit = items.find((item) => item.hit) ?? items[0];
      setActiveId(firstHit.id);
    }
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dictViewMode: mode }),
      });
    } catch {
      // 保存失败不影响当前会话的显示效果
    }
  }

  const frameFor = (item: DictSummary, extraClass = '') => (
    <iframe
      key={`${item.id}:${fontScale}`}
      className={`dict-frame${extraClass}`}
      title={`${item.name} · ${word}`}
      src={`/api/dicts/${encodeURIComponent(item.id)}/render?word=${encodeURIComponent(word)}&fs=${fontScale}`}
      sandbox="allow-scripts allow-same-origin allow-popups"
    />
  );

  const missNotice = (
    <p className="muted small">所有启用的词典都未收录该词。可能需要在设置页新增词典或检查词形（如 running → run）。</p>
  );

  return (
    <div
      className={`dict-overlay${panelMode === 'popup' ? ' is-popup' : ''}`}
      role="presentation"
      onClick={onClose}
    >
      <aside
        className={`dict-panel is-${panelMode}`}
        onClick={(event) => event.stopPropagation()}
        aria-label="词典查询"
      >
        <header className="dict-panel-head">
          <span className="dict-panel-meta">
            {items ? `本地词典 ${hitCount}/${items.length} 本收录` : '正在查询本地词典…'}
          </span>
          <div className="dict-quick-toggles">
            <button
              type="button"
              className="dict-toggle-btn"
              title={
                viewMode === 'filter'
                  ? '当前为筛选模式，点击切换为列表模式（所有词典依次展开）'
                  : '当前为列表模式，点击切换为筛选模式（右侧编号栏切换单本词典）'
              }
              onClick={() => void switchViewMode(viewMode === 'filter' ? 'list' : 'filter')}
            >
              {viewMode === 'filter' ? '列表' : '筛选'}
            </button>
            <button
              type="button"
              className="dict-toggle-btn"
              title={
                panelMode === 'drawer'
                  ? '当前为靠边显示，点击切换为弹出式（居中显示）'
                  : '当前为弹出显示，点击切换为靠边式（贴右侧全高展开）'
              }
              onClick={() => void switchPanelMode(panelMode === 'drawer' ? 'popup' : 'drawer')}
            >
              {panelMode === 'drawer' ? '弹出' : '靠边'}
            </button>
          </div>
        </header>

        <div className="dict-panel-main">
          <div className={`dict-panel-body${viewMode === 'filter' ? ' is-filter' : ''}`}>
            {error && <div className="notice notice-error">{error}</div>}
            {!error && !items && <div className="empty">正在读取 MDX 词条…</div>}

            {items && viewMode === 'filter' && activeItem && (
              <div className="dict-filter-view">
                <div className="dict-filter-head">
                  <span className="dict-filter-no">{activeItem.index}</span>
                  <span className="dict-filter-name" title={activeItem.name}>
                    {activeItem.name}
                  </span>
                  {activeItem.hit ? (
                    activeItem.keyText && activeItem.keyText.toLowerCase() !== word.toLowerCase() ? (
                      <span className="badge badge-neutral">
                        {activeItem.keyText}
                        {activeItem.matchedWord && activeItem.matchedWord !== activeItem.keyText
                          ? ` ← ${activeItem.matchedWord}`
                          : ''}
                      </span>
                    ) : null
                  ) : (
                    <span className="muted small">
                      {activeItem.error ? `读取失败：${activeItem.error}` : '未收录'}
                    </span>
                  )}
                </div>
                {activeItem.hit ? (
                  frameFor(activeItem, ' is-filter')
                ) : (
                  <div className="empty">这本词典没有收录「{word}」，可切换右侧其他词典查看。</div>
                )}
              </div>
            )}

            {items && viewMode === 'list' &&
              items.map((item) => (
                <details
                  className="dict-entry"
                  key={item.id}
                  open={opened.has(item.id)}
                  onToggle={(event) => {
                    const isOpen = (event.target as HTMLDetailsElement).open;
                    if (isOpen && !opened.has(item.id)) {
                      setOpened((previous) => new Set(previous).add(item.id));
                    }
                  }}
                >
                  <summary className="dict-entry-head">
                    <span className="dict-entry-name">
                      <span className="dict-entry-no">{item.index}</span>
                      {item.name}
                    </span>
                    {item.hit ? (
                      item.keyText && item.keyText.toLowerCase() !== word.toLowerCase() ? (
                        <span className="badge badge-neutral">
                          {item.keyText}
                          {item.matchedWord && item.matchedWord !== item.keyText
                            ? ` ← ${item.matchedWord}`
                            : ''}
                        </span>
                      ) : null
                    ) : (
                      <span className="muted small">{item.error ? `读取失败：${item.error}` : '未收录'}</span>
                    )}
                  </summary>
                  {item.hit && opened.has(item.id) && frameFor(item)}
                </details>
              ))}

            {items && hitCount === 0 && !error && missNotice}
          </div>

          {items && items.length > 0 && viewMode === 'filter' && (
            <nav className="dict-rail" aria-label="词典切换">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={activeId === item.id}
                  title={item.shortName ? `${item.name}（简称：${item.shortName}）` : item.name}
                  className={`dict-rail-item${activeId === item.id ? ' is-active' : ''}${
                    item.hit ? '' : ' is-miss'
                  }`}
                  onClick={() => setActiveId(item.id)}
                >
                  <span className="dict-rail-no">{item.index}</span>
                  <span className="dict-rail-label">{labelOf(item)}</span>
                </button>
              ))}
            </nav>
          )}
        </div>

        <button className="dict-close-fab" type="button" onClick={onClose} title="关闭（Esc）">
          关闭
        </button>
      </aside>
    </div>
  );
}
