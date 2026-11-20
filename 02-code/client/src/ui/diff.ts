import type { ItemKind } from '../api/types';
import { FIELD_SPECS, labelForValue } from './fields';

export type DiffRow = {
  key: string;
  label: string;
  oldText: string;
  newText: string;
  changed: boolean;
};

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join('\n');
  return String(value);
}

export function diffPayload(
  kind: ItemKind,
  current: Record<string, unknown>,
  previous: Record<string, unknown>,
): DiffRow[] {
  return FIELD_SPECS[kind].map((spec) => {
    const currentValue = current[spec.key];
    const previousValue = previous[spec.key];
    const currentText =
      spec.type === 'select' && currentValue !== undefined && currentValue !== null
        ? labelForValue(spec, currentValue)
        : toText(currentValue);
    const previousText =
      spec.type === 'select' && previousValue !== undefined && previousValue !== null
        ? labelForValue(spec, previousValue)
        : toText(previousValue);
    return {
      key: spec.key,
      label: spec.label,
      oldText: previousText,
      newText: currentText,
      changed: currentText !== previousText,
    };
  });
}
