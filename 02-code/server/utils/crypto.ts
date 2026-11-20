import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';

let cachedKey: Buffer | null = null;

/**
 * 加密密钥来源：
 * 1. 环境变量 APP_SECRET（推荐）
 * 2. 本地文件 data/secret.key（首次运行自动生成）
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (config.appSecret) {
    cachedKey = crypto.createHash('sha256').update(config.appSecret, 'utf8').digest();
    return cachedKey;
  }

  const keyPath = path.join(config.dataDir, 'secret.key');
  if (fs.existsSync(keyPath)) {
    cachedKey = Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'base64');
    return cachedKey;
  }

  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(keyPath, generated.toString('base64'), { mode: 0o600 });
  cachedKey = generated;
  return cachedKey;
}

/** AES-256-GCM，输出 iv:tag:cipher（均为 base64） */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(stored: string): string {
  const [ivB64, tagB64, dataB64] = stored.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('加密数据格式不正确');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getKey(),
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function maskSecret(plain: string): string {
  if (plain.length <= 8) return '••••••••';
  return `••••••${plain.slice(-4)}`;
}

/** 仅供测试使用 */
export function resetCryptoKeyCache(): void {
  cachedKey = null;
}
