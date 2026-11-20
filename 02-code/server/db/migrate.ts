import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { getDb } from './index';

const MIGRATIONS_DIR = path.join(process.cwd(), 'server', 'db', 'migrations');

export function runMigrations(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`找不到迁移目录: ${MIGRATIONS_DIR}（请在项目根目录执行）`);
  }
  const db = getDb();
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)',
  );

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{
    version: string;
  }>;
  const applied = new Set(appliedRows.map((row) => row.version));

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        version,
        new Date().toISOString(),
      );
    });
    apply();
    ran.push(version);
  }
  return ran;
}

export function getSchemaVersion(): string | null {
  const db = getDb();
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!tableExists) return null;
  const row = db
    .prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
    .get() as { version: string } | undefined;
  return row?.version ?? null;
}

if (require.main === module) {
  try {
    const ran = runMigrations();
    console.log(
      ran.length > 0 ? `已应用迁移: ${ran.join(', ')}` : '数据库已是最新版本，无需迁移',
    );
    console.log(`数据库文件: ${config.dbPath}`);
  } catch (error) {
    console.error('迁移失败:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
