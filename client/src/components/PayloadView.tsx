import type { ItemKind } from '../api/types';
import { FIELD_SPECS, labelForValue } from '../ui/fields';

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
}: {
  kind: ItemKind;
  payload: Record<string, unknown>;
  hideKeys?: string[];
}) {
  const specs = FIELD_SPECS[kind].filter(
    (spec) => spec.key !== 'evidenceType' && !hideKeys.includes(spec.key),
  );

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
