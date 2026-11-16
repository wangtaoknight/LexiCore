import type { ItemKind } from '../api/types';
import { FIELD_SPECS, labelForValue } from '../ui/fields';
import type { FieldSpec } from '../ui/fields';

function renderValue(value: unknown, spec: (typeof FIELD_SPECS)[ItemKind][number]) {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return (
      <ul className="payload-list">
        {value.map((entry, index) => (
          <li key={`${index}-${String(entry)}`}>{String(entry)}</li>
        ))}
      </ul>
    );
  }
  if (spec.type === 'select') {
    return <p className="payload-text">{labelForValue(spec, value)}</p>;
  }
  const text = String(value);
  return <p className="payload-text">{text}</p>;
}

export function PayloadView({
  kind,
  payload,
  hideKeys = [],
  orderKeys,
}: {
  kind: ItemKind;
  payload: Record<string, unknown>;
  hideKeys?: string[];
  /** 指定字段的展示顺序；给出时只展示这些字段 */
  orderKeys?: string[];
}) {
  let specs = FIELD_SPECS[kind].filter(
    (spec) => spec.key !== 'evidenceType' && !hideKeys.includes(spec.key),
  );

  if (orderKeys) {
    specs = orderKeys
      .map((key) => specs.find((spec) => spec.key === key))
      .filter((spec): spec is FieldSpec => Boolean(spec));
  }

  return (
    <div className="payload">
      {specs.map((spec) => {
        const value = payload[spec.key];
        if (value === null || value === undefined || value === '') return null;
        if (Array.isArray(value) && value.length === 0) return null;
        return (
          <div className="payload-row" key={spec.key}>
            <div className="payload-label">{spec.label}</div>
            <div className="payload-value">{renderValue(value, spec)}</div>
          </div>
        );
      })}
    </div>
  );
}
