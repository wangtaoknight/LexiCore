import type { ReactNode } from 'react';
import type { Item } from '../api/types';
import { PayloadView } from './PayloadView';
import { ReviewActions } from './ReviewActions';

export function ItemCard({
  item,
  title,
  extra,
  hideKeys,
  orderKeys,
  before,
  onChanged,
  children,
}: {
  item: Item;
  title?: string;
  extra?: ReactNode;
  hideKeys?: string[];
  orderKeys?: string[];
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
      </div>
      <div className="card-body">
        {before}
        <PayloadView kind={item.kind} payload={item.payload} hideKeys={hideKeys} orderKeys={orderKeys} />
        {children}
        <ReviewActions item={item} onChanged={onChanged} />
      </div>
    </div>
  );
}
