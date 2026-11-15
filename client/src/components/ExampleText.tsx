import type { ReactNode } from 'react';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 把例句中的固定搭配高亮显示 */
export function ExampleText({ text, phrases }: { text: string; phrases: string[] }): ReactNode {
  const cleaned = Array.from(
    new Set(
      phrases
        .map((phrase) => phrase.trim())
        .filter((phrase) => phrase.length > 1 && !phrase.includes('sth') && !phrase.includes('sb')),
    ),
  ).sort((a, b) => b.length - a.length);

  if (cleaned.length === 0) return <>{text}</>;

  const pattern = new RegExp(`(${cleaned.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(pattern);
  const lowerSet = new Set(cleaned.map((phrase) => phrase.toLowerCase()));

  return (
    <>
      {parts.map((part, index) =>
        lowerSet.has(part.toLowerCase()) ? (
          <mark className="hl" key={index}>
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}
