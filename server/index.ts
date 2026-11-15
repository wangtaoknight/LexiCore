import { createApp } from './app';
import { config } from './config';
import { runMigrations } from './db/migrate';

function bootstrap(): void {
  const applied = runMigrations();
  if (applied.length > 0) {
    console.log(`[db] 已应用迁移: ${applied.join(', ')}`);
  }

  const app = createApp();
  app.listen(config.port, config.host, () => {
    console.log(`[server] 已启动 http://${config.host}:${config.port}`);
    console.log(`[server] AI 模式: ${config.aiMode === 'mock' ? 'mock（离线样例）' : 'live'}`);
  });
}

bootstrap();
