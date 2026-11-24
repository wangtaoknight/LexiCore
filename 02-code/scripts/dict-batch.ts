/* 批量抽样：评估抓取成功率与耗时
 * 用法：npx tsx scripts/dict-batch.ts battery suspend foundation habitat zzzzqqq
 */
import { collectWordEvidence } from '../server/dictionaries';

async function main(): Promise<void> {
  const words = process.argv.slice(2);
  const list = words.length > 0 ? words : ['battery', 'suspend', 'foundation', 'habitat'];
  const rows: string[] = [];

  for (const word of list) {
    const started = Date.now();
    const evidence = await collectWordEvidence(word, { force: true });
    const elapsed = Date.now() - started;
    const parts = evidence.sources.map((source) => {
      if (!source.ok) return `${source.source}:✗`;
      const senses = source.senses?.length ?? 0;
      const extras = source.skell
        ? `c${source.skell.collocations.length}/s${source.skell.similar.length}/e${source.skell.examples.length}`
        : `s${senses}`;
      return `${source.source}:${extras}`;
    });
    rows.push(`${word.padEnd(14)} ${String(elapsed).padStart(5)}ms  ${parts.join('  ')}`);
  }

  console.log(rows.join('\n'));
}

void main();
