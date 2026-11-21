import { Fragment, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { Item } from '../api/types';
import { FREQ_LABEL, SOURCE_TYPE_LABEL } from '../ui/labels';
import { ExampleText } from './ExampleText';
import { Modal } from './Modal';
import { PayloadView } from './PayloadView';
import { ReviewActions } from './ReviewActions';

type SensePayload = {
  senseNo: number;
  pos: string;
  posTags?: string[];
  cnGloss: string;
  enDefinition?: string;
  frequency: string;
  cet6Importance: string;
  sourceUrl?: string | null;
};

function bySeq(a: Item, b: Item): number {
  return a.seq - b.seq;
}

const CARET = (
  <svg className="module-caret" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m3 16 9-9 9 9" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** ③ 典型例句 / ④ 固定搭配 默认展示的条数，超出时才出现展开/折叠按钮 */
const LIST_PAGE_SIZE = 4;

export function SenseBlock({
  sense,
  displayNo,
  items,
  busy,
  sourceEnabled,
  onChanged,
  onStartStudy,
  onStartSources,
  onStartAntonyms,
}: {
  sense: Item;
  /** 界面重排后的显示编号（1..N），缺省时回退到 payload.senseNo */
  displayNo?: number;
  items: Item[];
  busy: boolean;
  sourceEnabled: boolean;
  onChanged: (item: Item) => void;
  onStartStudy: (senseId: string) => void;
  onStartSources: (senseId: string) => void;
  onStartAntonyms: (senseId: string) => void;
}) {
  const payload = sense.payload as unknown as SensePayload;
  const children = items.filter((item) => item.parentId === sense.id);

  const concepts = children.filter((item) => item.kind === 'sense_concept').sort(bySeq);
  // 例句按句长排序：短的优先展示
  const examples = children
    .filter((item) => item.kind === 'example')
    .sort((a, b) => String(a.payload.en ?? '').length - String(b.payload.en ?? '').length);
  const collocations = children.filter((item) => item.kind === 'collocation').sort(bySeq);
  const synonyms = children.filter((item) => item.kind === 'synonym').sort(bySeq);
  const antonyms = children.filter((item) => item.kind === 'antonym').sort(bySeq);
  const phrases = collocations.map((item) => String(item.payload.phrase ?? ''));
  const posTags = Array.isArray(payload.posTags) ? payload.posTags.map(String).filter(Boolean) : [];
  const sourceUrl =
    typeof payload.sourceUrl === 'string' && payload.sourceUrl ? payload.sourceUrl : null;
  // 英文释义句末补英文句号（不动库里的数据，只在展示时补齐）
  const defText = (() => {
    const text = String(payload.enDefinition ?? '').trim();
    if (!text) return '';
    return /[.!?]$/.test(text) ? text : `${text}.`;
  })();

  const [showCn, setShowCn] = useState(false);
  const [cnText, setCnText] = useState<string | null>(null);
  const [cnLoading, setCnLoading] = useState(false);
  const [cnError, setCnError] = useState<string | null>(null);
  const [conceptOpen, setConceptOpen] = useState(false);
  const [showAllExamples, setShowAllExamples] = useState(false);
  const [showAllCollocations, setShowAllCollocations] = useState(false);
  const [openExamples, setOpenExamples] = useState<Record<string, boolean>>({});
  const [openPairs, setOpenPairs] = useState<Record<string, boolean>>({});
  const [askAntonyms, setAskAntonyms] = useState(false);
  const [moduleAction, setModuleAction] = useState<{
    label: string;
    items: Item[];
    /** 单条模块（①②）在弹窗里还要能修改/追问/看历史 */
    focusItem?: Item;
  } | null>(null);
  const [moduleBusy, setModuleBusy] = useState(false);
  const [moduleError, setModuleError] = useState<string | null>(null);
  const [moduleComment, setModuleComment] = useState('');

  const modulePending = moduleAction
    ? moduleAction.items.filter((item) => item.status !== 'approved')
    : [];

  const visibleExamples = showAllExamples ? examples : examples.slice(0, LIST_PAGE_SIZE);
  const visibleCollocations = showAllCollocations
    ? collocations
    : collocations.slice(0, LIST_PAGE_SIZE);

  /** 模块级批量审核：全部通过 / 全部驳回（作用于本模块未通过的条目） */
  async function runModuleAction(decision: 'approve' | 'reject') {
    if (!moduleAction) return;
    const targets = modulePending;
    if (targets.length === 0) {
      setModuleAction(null);
      return;
    }
    setModuleBusy(true);
    setModuleError(null);
    try {
      for (const item of targets) {
        if (decision === 'approve') await api.post(`/items/${item.id}/approve`);
        else await api.post(`/items/${item.id}/reject`, { comment: moduleComment });
      }
      const first = moduleAction.items[0];
      setModuleAction(null);
      onChanged(first);
    } catch (err) {
      setModuleError(errorMessage(err));
    } finally {
      setModuleBusy(false);
    }
  }

  function openModuleAction(label: string, moduleItems: Item[], focusItem?: Item) {
    setModuleError(null);
    setModuleComment('');
    setModuleAction({ label, items: moduleItems, focusItem });
  }

  /** 同(反)义词：词与折叠按钮并列，解释默认收起，展开后单独占一行 */
  function pairItem(item: Item, noteText: string) {
    const isOpen = Boolean(openPairs[item.id]);
    return (
      <Fragment key={item.id}>
        <div className="word-pair-item">
          <span className="word-pair-word">{String(item.payload.word ?? '')}</span>
          <button
            className={`inline-caret ${isOpen ? 'on' : ''}`}
            type="button"
            aria-expanded={isOpen}
            title={isOpen ? '隐藏解释' : '显示解释'}
            onClick={() => setOpenPairs((previous) => ({ ...previous, [item.id]: !previous[item.id] }))}
          >
            {CARET}
          </button>
          <div className="module-actions">
            <ReviewActions item={item} hide={['approve', 'reject']} onChanged={onChanged} />
          </div>
        </div>
        {isOpen && (
          <p className="word-pair-note">{noteText.trim() || '（暂无对比说明）'}</p>
        )}
      </Fragment>
    );
  }

  async function toggleTranslation() {
    if (showCn) {
      setShowCn(false);
      return;
    }
    setShowCn(true);
    if (cnText || cnLoading) return;
    setCnLoading(true);
    setCnError(null);
    try {
      const result = await api.post<{ text: string }>(`/items/${sense.id}/translate`);
      setCnText(result.text);
    } catch (err) {
      setCnError(errorMessage(err));
    } finally {
      setCnLoading(false);
    }
  }

  return (
    <div className="sense-block">
      {/* 当前义项：编号 + 译法 + 词性细节 */}
      <header className="sense-head">
        <span className="sense-head-no">{displayNo ?? payload.senseNo}</span>
        <div className="sense-head-main">
          <h3 className="sense-head-gloss">{payload.cnGloss}</h3>
          <div className="sense-head-tags">
            <span className="pos-chip mono">{payload.pos}</span>
            {posTags.map((tag) => (
              <span className="tag-chip" key={tag}>
                {tag}
              </span>
            ))}
            {payload.frequency && (
              <span className="badge badge-neutral">
                {FREQ_LABEL[payload.frequency] ?? payload.frequency}
              </span>
            )}
            {posTags.length === 0 && <span className="muted small">词性细节待补充</span>}
          </div>
        </div>
      </header>

      {/* 1. 英文释义（句末带句号，翻译按钮紧跟其后） */}
      <section className="sense-module">
        <div className="module-head">
          <h4 className="module-title">
            <button
              className="module-title-btn"
              type="button"
              title="点击：审核本模块内容（全部通过 / 全部驳回 / 修改 / 追问）"
              onClick={() => openModuleAction('英文释义', [sense], sense)}
            >
              ① 英文释义
            </button>
          </h4>
          <button
            className={`inline-btn ${showCn ? 'on' : ''}`}
            type="button"
            aria-expanded={showCn}
            onClick={() => void toggleTranslation()}
          >
            {showCn ? '隐藏翻译' : '翻译'}
          </button>
          {sourceUrl && (
            <a
              className="module-src module-head-end"
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              title="打开来源网页"
            >
              原文
            </a>
          )}
        </div>
        <p className="module-text-en">{defText}</p>
        {showCn &&
          (cnLoading ? (
            <p className="muted small">翻译中…</p>
          ) : cnError ? (
            <div className="notice notice-error small">{cnError}</div>
          ) : cnText ? (
            <p className="module-text-cn">{cnText}</p>
          ) : null)}
      </section>

      {/* 2. 中文概念解释（细节可折叠） */}
      {concepts.map((item) => (
        <section className="sense-module" key={item.id}>
          <div className="module-head">
            <h4 className="module-title">
              <button
                className="module-title-btn"
                type="button"
                title="点击：审核本模块内容（全部通过 / 全部驳回 / 修改 / 追问）"
                onClick={() => openModuleAction('中文释义', [item], item)}
              >
                ② 中文释义
              </button>
            </h4>
            <button
              className={`module-toggle ${conceptOpen ? 'on' : ''}`}
              type="button"
              aria-expanded={conceptOpen}
              title={conceptOpen ? '收起细节' : '展开细节：适用范围、边界、误解、场景'}
              onClick={() => setConceptOpen((value) => !value)}
            >
              {CARET}
            </button>
          </div>
          <p className="module-text">{String(item.payload.conceptCn ?? '')}</p>
          {item.payload.cnContrast ? (
            <p className="module-text-sub">{String(item.payload.cnContrast)}</p>
          ) : null}
          {conceptOpen && (
            <div className="module-extra">
              <PayloadView
                kind="sense_concept"
                payload={item.payload}
                orderKeys={[
                  'describedObject',
                  'scope',
                  'boundary',
                  'misconceptions',
                  'grammarPatterns',
                  'scenarios',
                ]}
              />
            </div>
          )}
        </section>
      ))}

      {/* 3. 典型例句（短的优先，默认 4 条；译文与来源默认折叠） */}
      {examples.length > 0 && (
        <section className="sense-module">
          <div className="module-head">
            <h4 className="module-title">
              <button
                className="module-title-btn"
                type="button"
                title="点击：批量审核本模块内容（全部通过 / 全部驳回）"
                onClick={() => openModuleAction('典型例句', examples)}
              >
                ③ 典型例句
              </button>
            </h4>
            {examples.length > LIST_PAGE_SIZE && (
              <button
                className="link-btn"
                type="button"
                onClick={() => setShowAllExamples((value) => !value)}
              >
                {showAllExamples
                  ? `折叠全部 ${examples.length} 条`
                  : `展开全部 ${examples.length} 条`}
              </button>
            )}
            <span className="muted small module-head-end">按句长排序</span>
          </div>
          {visibleExamples.map((item, index) => {
              const en = String(item.payload.en ?? '');
              const cn = String(item.payload.cn ?? '');
              const sourceType = String(item.payload.sourceType ?? '');
              const sourceTitle = item.payload.sourceTitle ? String(item.payload.sourceTitle) : '';
              const exampleUrl = item.payload.sourceUrl ? String(item.payload.sourceUrl) : '';
              const isOpen = Boolean(openExamples[item.id]);
              const sourceLabel = sourceType
                ? SOURCE_TYPE_LABEL[sourceType] ?? sourceType
                : '来源未记录';
              const inline = Array.isArray(item.payload.collocationsInSentence)
                ? (item.payload.collocationsInSentence as unknown[]).map(String)
                : [];
              return (
                <div className="example-row" key={item.id}>
                  <span className="example-no">{index + 1}</span>
                  <div className="example-main">
                    <p className="example-en">
                      <ExampleText text={en} phrases={[...phrases, ...inline]} />
                      <button
                        className={`inline-caret ${isOpen ? 'on' : ''}`}
                        type="button"
                        aria-expanded={isOpen}
                        title={isOpen ? '隐藏译文' : '显示译文'}
                        onClick={() =>
                          setOpenExamples((previous) => ({
                            ...previous,
                            [item.id]: !previous[item.id],
                          }))
                        }
                      >
                        {CARET}
                      </button>
                      {exampleUrl ? (
                        <a
                          className="example-source"
                          href={exampleUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={sourceTitle || sourceLabel}
                        >
                          {sourceLabel}
                        </a>
                      ) : (
                        <span className="example-source is-plain" title={sourceTitle || '来源未记录'}>
                          {sourceLabel}
                        </span>
                      )}
                    </p>
                    {isOpen && cn && <p className="example-cn">{cn}</p>}
                    <div className="module-actions">
                      <ReviewActions item={item} hide={['approve', 'reject']} onChanged={onChanged} />
                    </div>
                  </div>
                </div>
              );
          })}
          <div className="module-foot">
            {sourceEnabled && (
              <button
                className="link-btn"
                type="button"
                disabled={busy}
                onClick={() => onStartSources(sense.id)}
              >
                联网核实例句
              </button>
            )}
          </div>
        </section>
      )}

      {/* 4. 常见语法结构与搭配（只留搭配 + 一条例句） */}
      {collocations.length > 0 && (
        <section className="sense-module">
          <div className="module-head">
            <h4 className="module-title">
              <button
                className="module-title-btn"
                type="button"
                title="点击：批量审核本模块内容（全部通过 / 全部驳回）"
                onClick={() => openModuleAction('固定搭配', collocations)}
              >
                ④ 固定搭配
              </button>
            </h4>
            {collocations.length > LIST_PAGE_SIZE && (
              <button
                className="link-btn"
                type="button"
                onClick={() => setShowAllCollocations((value) => !value)}
              >
                {showAllCollocations
                  ? `折叠全部 ${collocations.length} 条`
                  : `展开全部 ${collocations.length} 条`}
              </button>
            )}
          </div>
          {visibleCollocations.map((item) => {
            const phrase = String(item.payload.phrase ?? '');
            const cn = String(item.payload.cn ?? '');
            const exampleEn = String(item.payload.exampleEn ?? '');
            const exampleCn = String(item.payload.exampleCn ?? '');
            return (
              <div className="colloc-row" key={item.id}>
                <p className="colloc-phrase">
                  <ExampleText text={phrase} phrases={[phrase]} />
                  {cn && <span className="colloc-cn">{cn}</span>}
                </p>
                {exampleEn && (
                  <p className="example-en">
                    <ExampleText text={exampleEn} phrases={[phrase]} />
                  </p>
                )}
                {exampleCn && <p className="example-cn">{exampleCn}</p>}
                <div className="module-actions">
                  <ReviewActions item={item} hide={['approve', 'reject']} onChanged={onChanged} />
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* 5. 同（反）义词：同 / 反各占一行，词在同一行内并列；无反义词时可点提示让 AI 补充 */}
      {(synonyms.length > 0 || antonyms.length > 0) && (
        <section className="sense-module">
          <div className="module-head">
            <h4 className="module-title">
              <button
                className="module-title-btn"
                type="button"
                title="点击：批量审核本模块内容（全部通过 / 全部驳回）"
                onClick={() => openModuleAction('同(反)义词', [...synonyms, ...antonyms])}
              >
                {antonyms.length > 0 ? '⑤ 同(反)义词' : '⑤ 同义词'}
              </button>
            </h4>
            <span className="muted small module-head-end">
              {synonyms.length} 个同义词
              {antonyms.length > 0 ? ` · ${antonyms.length} 个反义词` : ' · 暂无反义词'}
            </span>
          </div>
          <div className="word-pair-groups">
            <div className="word-pair-group">
              <span className="word-pair-label">同</span>
              <div className="word-pair-words">
                {synonyms.length === 0 && <span className="muted small">暂无同义词</span>}
                {synonyms.map((item) => pairItem(item, String(item.payload.difference ?? '')))}
              </div>
            </div>
            <div className="word-pair-group">
              <span className="word-pair-label">反</span>
              <div className="word-pair-words">
                {antonyms.length === 0 ? (
                  <button className="link-btn" type="button" onClick={() => setAskAntonyms(true)}>
                    ＋ 让 AI 补充反义词
                  </button>
                ) : (
                  antonyms.map((item) =>
                    pairItem(item, String(item.payload.opposition ?? item.payload.difference ?? '')),
                  )
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {askAntonyms && (
        <Modal
          title="是否为该义项补充反义词？"
          onClose={() => setAskAntonyms(false)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setAskAntonyms(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => {
                  setAskAntonyms(false);
                  onStartAntonyms(sense.id);
                }}
              >
                是，让 AI 研究
              </button>
            </>
          }
        >
          <p className="hint">
            AI 只针对当前义项寻找反义词候选，结果以「待审核」写入，不会自动通过；若模型认为没有合适的反义词，会明确提示。
          </p>
        </Modal>
      )}

      {moduleAction && (
        <Modal
          title={`「${moduleAction.label}」批量审核`}
          onClose={() => setModuleAction(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setModuleAction(null)}>
                取消
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={moduleBusy || modulePending.length === 0}
                onClick={() => void runModuleAction('reject')}
              >
                全部驳回（{modulePending.length} 条）
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={moduleBusy || modulePending.length === 0}
                onClick={() => void runModuleAction('approve')}
              >
                {moduleBusy ? '提交中…' : `全部通过（${modulePending.length} 条）`}
              </button>
            </>
          }
        >
          <p className="hint">
            共 {moduleAction.items.length} 条，其中待审核 {modulePending.length} 条。通过后可对单条「解除通过」撤销；
            驳回意见可选，仅在「全部驳回」时写入，作为重新分析的依据。
          </p>
          <textarea
            className="textarea"
            rows={2}
            value={moduleComment}
            onChange={(event) => setModuleComment(event.target.value)}
            placeholder="驳回意见（可选）：例如：例句过长且不含目标搭配，请换成更短的句子。"
          />
          {moduleAction.focusItem && (
            <div className="modal-review">
              <span className="muted small">这条内容的其它操作：</span>
              <ReviewActions
                item={moduleAction.focusItem}
                hide={['approve', 'reject']}
                onChanged={onChanged}
              />
            </div>
          )}
          {moduleError && <div className="notice notice-error small">{moduleError}</div>}
        </Modal>
      )}

      {/* 尚未生成任何深入内容时的入口 */}
      {children.length === 0 && (
        <div className="study-cta">
          <p className="muted small" style={{ margin: 0 }}>
            还没有深入内容。生成后会得到概念解释、例句与固定搭配的候选，每一项都可以单独审核。
          </p>
          <div className="row">
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={busy}
              onClick={() => onStartStudy(sense.id)}
            >
              深入研究此义项
            </button>
            {sourceEnabled && (
              <button
                className="btn btn-sm"
                type="button"
                disabled={busy}
                onClick={() => onStartSources(sense.id)}
              >
                联网核实例句
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
