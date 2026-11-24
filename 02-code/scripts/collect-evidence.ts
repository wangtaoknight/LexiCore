/* 原型验证：抓取一个单词的多词典证据并打印摘要
 * 用法：npx tsx scripts/collect-evidence.ts battery [--force]
 */
import { writeFileSync } from 'node:fs';
import { collectWordEvidence, renderEvidenceForPrompt } from '../server/dictionaries';

async function main(): Promise<void> {
  const word = process.argv[2] ?? 'battery';
  const force = process.argv.includes('--force');
  const json = process.argv.includes('--json');

  const started = Date.now();
  const evidence = await collectWordEvidence(word, { force });
  const elapsed = Date.now() - started;

  console.log(`\n=== ${word} ===  用时 ${elapsed}ms`);
  for (const source of evidence.sources) {
    const senses = source.senses?.length ?? 0;
    const examples = source.senses?.reduce((sum, sense) => sum + sense.examples.length, 0) ?? 0;
    console.log(
      `${source.source.padEnd(10)} ok=${String(source.ok).padEnd(5)} ${String(source.ms).padStart(5)}ms` +
        (source.cached ? ' (缓存)' : '') +
        (source.ok
          ? ` 义项=${senses} 例句=${examples}` +
            (source.skell
              ? ` 搭配组=${source.skell.collocations.length} 近义=${source.skell.similar.length} 语料例=${source.skell.examples.length}`
              : '')
          : ` 错误=${source.error}`),
    );
  }

  const prompt = renderEvidenceForPrompt(evidence);
  console.log(`\n--- 供 AI 使用的证据文本（${prompt.length} 字符）---\n`);
  console.log(prompt.slice(0, 4000));

  if (json) {
    const file = `.tmp-evidence-${word.replace(/[^a-z0-9]+/gi, '_')}.json`;
    writeFileSync(file, JSON.stringify(evidence, null, 1), 'utf8');
    console.log(`\n已写入 ${file}`);
  }
}

void main();
