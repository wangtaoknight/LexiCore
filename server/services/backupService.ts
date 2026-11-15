import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config';
import { closeDb, getDb, reopenDb } from '../db';
import { getSchemaVersion, runMigrations } from '../db/migrate';
import { badRequest, notFound } from '../errors';

export type BackupInfo = {
  name: string;
  size: number;
  createdAt: string;
};

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function createBackup(prefix = 'backup'): BackupInfo {
  fs.mkdirSync(config.backupDir, { recursive: true });
  const name = `${prefix}-${timestamp()}.db`;
  const target = path.join(config.backupDir, name);
  // VACUUM INTO 生成一致的完整快照，且同步完成，便于恢复流程使用
  getDb().exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const stat = fs.statSync(target);
  return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
}

export function listBackups(): BackupInfo[] {
  if (!fs.existsSync(config.backupDir)) return [];
  return fs
    .readdirSync(config.backupDir)
    .filter((name) => name.endsWith('.db'))
    .map((name) => {
      const stat = fs.statSync(path.join(config.backupDir, name));
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function resolveBackupPath(name: string): string {
  const safe = path.basename(name);
  if (!/^[A-Za-z0-9._-]+\.db$/.test(safe)) {
    throw badRequest('备份文件名不合法');
  }
  const full = path.join(config.backupDir, safe);
  if (!fs.existsSync(full)) throw notFound('备份文件不存在');
  return full;
}

export function validateSqliteDatabase(file: string): { schemaVersion: string | null } {
  let probe: Database.Database | null = null;
  try {
    probe = new Database(file, { readonly: true, fileMustExist: true });
    const tables = (
      probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
        name: string;
      }>
    ).map((row) => row.name);

    for (const required of ['words', 'items', 'item_versions', 'schema_migrations']) {
      if (!tables.includes(required)) {
        throw badRequest(`不是本系统的数据库文件（缺少表 ${required}）`);
      }
    }
    const row = probe
      .prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
      .get() as { version: string } | undefined;
    return { schemaVersion: row?.version ?? null };
  } catch (error) {
    if (error instanceof Error && error.message.includes('本系统')) throw error;
    throw badRequest(`无法读取数据库文件：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    probe?.close();
  }
}

export function restoreFromFile(uploadedPath: string): {
  preRestoreBackup: string;
  schemaVersion: string | null;
  appliedMigrations: string[];
} {
  validateSqliteDatabase(uploadedPath);

  const preRestore = createBackup('pre-restore');

  closeDb();
  for (const suffix of ['-wal', '-shm']) {
    const extra = `${config.dbPath}${suffix}`;
    if (fs.existsSync(extra)) fs.unlinkSync(extra);
  }
  fs.copyFileSync(uploadedPath, config.dbPath);

  reopenDb();
  const applied = runMigrations();

  return {
    preRestoreBackup: preRestore.name,
    schemaVersion: getSchemaVersion(),
    appliedMigrations: applied,
  };
}
