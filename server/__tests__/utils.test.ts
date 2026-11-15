import { describe, expect, it } from 'vitest';
import { parseJsonLoose } from '../utils/json';
import { containsQuote, normalizeForMatch } from '../utils/textMatch';

describe('parseJsonLoose', () => {
  it('解析纯 JSON', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it('解析代码围栏包裹的 JSON', () => {
    expect(parseJsonLoose('```json\n{"a":2}\n```')).toEqual({ a: 2 });
  });

  it('解析前后带说明文字的 JSON', () => {
    expect(parseJsonLoose('好的，结果如下：{"a":3} 以上。')).toEqual({ a: 3 });
  });

  it('非法内容抛出错误', () => {
    expect(() => parseJsonLoose('not json at all')).toThrow('不是合法 JSON');
  });
});

describe('例句原文校验', () => {
  it('忽略大小写、空白与破折号差异', () => {
    const source = 'The  airline — decided to suspend all flights during the storm.';
    expect(containsQuote(source, 'the airline - decided to suspend all flights')).toBe(true);
  });

  it('改写后的句子无法通过校验', () => {
    const source = 'The airline decided to suspend all flights during the storm.';
    expect(containsQuote(source, 'The airline chose to stop every flight because of the storm.')).toBe(
      false,
    );
  });

  it('过短的片段不视为有效引用', () => {
    expect(containsQuote('suspend all flights', 'suspend')).toBe(false);
  });

  it('normalize 结果稳定', () => {
    expect(normalizeForMatch('  Hello\u00a0 World  ')).toBe('hello world');
  });
});
