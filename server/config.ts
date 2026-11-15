import 'dotenv/config';
import path from 'node:path';

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

const port = Number(readEnv('PORT') || 5174);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`环境变量 PORT 不合法: ${process.env.PORT}`);
}

export const PROJECT_ROOT = process.cwd();

export const config = {
  host: readEnv('HOST') || '127.0.0.1',
  port,
  dbPath: path.resolve(PROJECT_ROOT, readEnv('DB_PATH') || 'data/app.db'),
  appSecret: readEnv('APP_SECRET'),
  aiMode: readEnv('AI_MODE') === 'mock' ? ('mock' as const) : ('live' as const),
  dataDir: path.resolve(PROJECT_ROOT, 'data'),
  backupDir: path.resolve(PROJECT_ROOT, 'data/backups'),
};

export type AppConfig = typeof config;
