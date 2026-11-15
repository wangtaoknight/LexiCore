import type { Item } from '../api/types';
import { FREQ_LABEL, IMPORTANCE_LABEL, itemTitle } from '../ui/labels';
import { ExampleText } from './ExampleText';
import { ItemCard } from './ItemCard';

type SensePayload = {
  senseNo: number;
  pos: string;
  cnGloss: string;
  frequency: string;
  cet6Importance: string;
};

function bySeq(a: Item, b: Item): number {
  return a.seq - b.seq;
}

function SectionTitle({ title, count }: { title: string; count?: number }) {
  return (
    <h3 className="child-section-title">
      {title}
      {typeof count === 'number' && <span className="muted small">（{count}）</span>}
    </h3>
  );
}

export function SenseBlock({
  sense,
  items,
  busy,
  sourceEnabled,
  onChanged,
  onStartStudy,
  onStartSources,
}: {
  sense: Item;
  items: Item[];
  busy: boolean;
  sourceEnabled: boolean;
  onChanged: (item: Item) => void;
  onStartStudy: (senseId: string) => void;
  onStartSources: (senseId: string) => void;
}) {
  const payload = sense.payload as unknown as SensePayload;
  const children = items.filter((item) => item.parentId === sense.id);

  const concepts = children.filter((item) => item.kind === 'sense_concept').sort(bySeq);
  const histories = children.filter((item) => item.kind === 'sense_history').sort(bySeq);
  const examples = children.filter((item) => item.kind === 'example').sort(bySeq);
  const collocations = children.filter((item) => item.kind === 'collocation').sort(bySeq);
  const synonyms = children.filter((item) => item.kind === 'synonym').sort(bySeq);
  const antonyms = children.filter((item) => item.kind === 'antonym').sort(bySeq);
  const phrases = collocations.map((item) => String(item.payload.phrase ?? ''));

  return (
    <div className="sense-block">
      <ItemCard
        item={sense}
        title={`${payload.senseNo}. ${payload.cnGloss}`}
        extra={
          <>
            <span className="mono muted small">{payload.pos}</span>
            <span className="badge badge-neutral">
              {FREQ_LABEL[payload.frequency] ?? payload.frequency}
            </span>
            <span className="badge badge-neutral">
              {IMPORTANCE_LABEL[payload.cet6Importance] ?? payload.cet6Importance}
            </span>
          </>
        }
        hideKeys={['senseNo', 'cnGloss']}
        onChanged={onChanged}
      />

      <div className="children-wrap">
        <div className="sense-toolbar">
          <button
            className="btn btn-sm"
            type="button"
            disabled={busy || !sourceEnabled}
            title={sourceEnabled ? undefined : '需先在「设置与数据」中开启例句联网核实'}
            onClick={() => onStartSources(sense.id)}
          >
            联网核实例句
          </button>
          <span className="hint">
            搜索网页后逐字比对原文，找不到出处或与原文不符的句子不会写入。
          </span>
        </div>

        {children.length === 0 && (
          <div className="study-cta">
            <p className="muted small" style={{ margin: 0 }}>
              还没有深入内容。生成后会得到：概念解释、词义历史、3–5 条例句、固定搭配、近义词与反义词，
              每一项都可以单独审核。
            </p>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={busy}
              onClick={() => onStartStudy(sense.id)}
            >
              深入研究此义项
            </button>
          </div>
        )}

        {concepts.map((item) => (
          <ItemCard key={item.id} item={item} title="概念解释" onChanged={onChanged} />
        ))}

        {histories.map((item) => (
          <ItemCard key={item.id} item={item} title="词义历史" onChanged={onChanged} />
        ))}

        {examples.length > 0 && (
          <>
            <SectionTitle title="例句" count={examples.length} />
            {examples.map((item) => {
              const payloadData = item.payload;
              const en = String(payloadData.en ?? '');
              const cn = String(payloadData.cn ?? '');
              const inline = Array.isArray(payloadData.collocationsInSentence)
                ? (payloadData.collocationsInSentence as unknown[]).map(String)
                : [];
              return (
                <ItemCard
                  key={item.id}
                  item={item}
                  title="例句"
                  hideKeys={['en', 'cn']}
                  before={
                    <div className="example-block">
                      <p className="example-en">
                        <ExampleText text={en} phrases={[...phrases, ...inline]} />
                      </p>
                      <p className="example-cn">{cn}</p>
                    </div>
                  }
                  onChanged={onChanged}
                />
              );
            })}
          </>
        )}

        {collocations.length > 0 && (
          <>
            <SectionTitle title="固定搭配" count={collocations.length} />
            {collocations.map((item) => {
              const phrase = String(item.payload.phrase ?? '');
              const exampleEn = String(item.payload.exampleEn ?? '');
              return (
                <ItemCard
                  key={item.id}
                  item={item}
                  title={phrase}
                  hideKeys={['phrase', 'exampleEn']}
                  before={
                    exampleEn ? (
                      <div className="example-block">
                        <p className="example-en">
                          <ExampleText text={exampleEn} phrases={[phrase]} />
                        </p>
                      </div>
                    ) : undefined
                  }
                  onChanged={onChanged}
                />
              );
            })}
          </>
        )}

        {synonyms.length > 0 && (
          <>
            <SectionTitle title="近义词" count={synonyms.length} />
            {synonyms.map((item) => (
              <ItemCard key={item.id} item={item} title={itemTitle(item)} onChanged={onChanged} />
            ))}
          </>
        )}

        {antonyms.length > 0 && (
          <>
            <SectionTitle title="反义词" count={antonyms.length} />
            {antonyms.map((item) => (
              <ItemCard key={item.id} item={item} title={itemTitle(item)} onChanged={onChanged} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
