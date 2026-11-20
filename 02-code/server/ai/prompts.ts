import fs from 'node:fs';
import path from 'node:path';

const PROMPTS_DIR = path.join(process.cwd(), 'server', 'ai', 'prompts');

export function loadPrompt(name: string): string {
  const file = path.join(PROMPTS_DIR, name);
  if (!fs.existsSync(file)) {
    throw new Error(`提示词模板不存在: ${file}`);
  }
  return fs.readFileSync(file, 'utf8');
}

export function fillPrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '');
}
