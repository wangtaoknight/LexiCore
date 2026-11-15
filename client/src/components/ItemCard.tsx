import type { ReactNode } from 'react';
import type { Item } from '../api/types';
import { EVIDENCE_LABEL, STATUS_LABEL } from '../ui/labels';
import { PayloadView } from './PayloadView';
import { ReviewActions } from './ReviewActions';

export function ItemCard({
  item,
  title,
  extra,
  hideKeys,
  before,
  onChanged,
  children,
}: {
  item: Item;
  title?: string;
  extra?: ReactNode;
  hideKeys?: string[];
  before?: ReactNode;
  onChanged: (item: Item) => void;
  children?: ReactNode;
}) {
  return (
    <div className={`card item-card item-card-${item.kind}`}>
      <div className="card-header">
        <div className="row">
          {title && <span className="item-title">{title}</span>}
          {extra}
        </div>
        <div className="row">
          <span className={`badge badge-${item.status}`}>{STATUS_LABEL[item.status]}</span>
          <span className="badge badge-evidence">{EVIDENCE_LABEL[item.evidenceType]}</span>
          {item.origin === 'human' && <span className="badge badge-neutral">人工修改</span>}
          <span className="muted small">v{item.currentVersion}</span>
        </div>
      </div>
      <div className="card-body">
        {before}
        <PayloadView kind={item.kind} payload={item.payload} hideKeys={hideKeys} />
        {children}
        <ReviewActions item={item} onChanged={onChanged} />
      </div>
    </div>
  );
}
