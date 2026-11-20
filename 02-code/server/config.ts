import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

const port = Number(readEnv('PORT') || 5174);
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`环境变量 PORT 不合法: ${process.env.PORT}`);
}

export const PROJECT_ROOT = process.cwd();

/**
 * 待研究词表（backlog import）的源文件。
 * - 可用 `VOCABULARY_IMPORT_FILE` 覆盖（相对路径按当前工作目录解析）
 * - 未配置时按候选列表探测，默认落在仓库 `04-data/fixtures/vocabulary copy.txt`
 */
function resolveVocabularyImportFile(): string {
  const configured = readEnv('VOCABULARY_IMPORT_FILE');
  if (configured) return path.resolve(PROJECT_ROOT, configured);

  const candidates = [
    // 从 02-code/ 启动（npm 脚本的默认工作目录）
    path.resolve(PROJECT_ROOT, '..', '04-data', 'fixtures', 'vocabulary copy.txt'),
    // 从仓库根目录启动
    path.resolve(PROJECT_ROOT, '04-data', 'fixtures', 'vocabulary copy.txt'),
    // 兼容旧位置
    path.resolve(PROJECT_ROOT, 'vocabulary copy.txt'),
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? candidates[0];
}

export const config = {
  host: readEnv('HOST') || '127.0.0.1',
  port,
  dbPath: path.resolve(PROJECT_ROOT, readEnv('DB_PATH') || 'data/app.db'),
  appSecret: readEnv('APP_SECRET'),
  aiMode: readEnv('AI_MODE') === 'mock' ? ('mock' as const) : ('live' as const),
  dataDir: path.resolve(PROJECT_ROOT, 'data'),
  backupDir: path.resolve(PROJECT_ROOT, 'data/backups'),
  vocabularyImportFile: resolveVocabularyImportFile(),
};

export type AppConfig = typeof config;
