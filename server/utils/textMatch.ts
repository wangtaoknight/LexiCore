/** 统一文本后再做包含性校验，避免引号、破折号或空白差异造成误判 */
export function normalizeForMatch(text: string): string {
  return text
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function containsQuote(source: string, quote: string): boolean {
  const normalizedQuote = normalizeForMatch(quote);
  if (normalizedQuote.length < 8) return false;
  return normalizeForMatch(source).includes(normalizedQuote);
}
