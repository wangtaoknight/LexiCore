/* 词典 API 冒烟测试（supertest，不启动端口） */
import request from 'supertest';
import { createApp } from '../server/app';

async function main(): Promise<void> {
  const app = createApp();

  const list = await request(app).get('/api/dicts');
  console.log('GET /dicts', list.status, 'root=', list.body.root, 'exists=', list.body.exists);
  for (const dict of list.body.dicts) {
    console.log(
      `  ${dict.id.padEnd(48)} ${dict.name} | mdx=${(dict.mdxSize / 1024 / 1024).toFixed(1)}MB mdd=${
        dict.hasMdd ? (dict.mddSize / 1024 / 1024).toFixed(1) + 'MB' : '无'
      } css=${dict.cssFiles.length} js=${dict.jsFiles.length} enabled=${dict.enabled}`,
    );
  }

  const started = Date.now();
  const lookup = await request(app).get('/api/dicts/lookup').query({ word: 'battery' });
  console.log(`\nGET /dicts/lookup battery (${Date.now() - started}ms)`, lookup.status);
  for (const item of lookup.body.results ?? []) {
    console.log(
      `  ${item.id.padEnd(48)} hit=${item.hit} key=${item.keyText} len=${item.length}${
        item.error ? ' ERR=' + item.error : ''
      }`,
    );
  }

  const render = await request(app).get('/api/dicts/OALD9EnEn/render').query({ word: 'battery' });
  console.log(`\nGET render OALD9 (${render.status}, ${render.text.length} 字符)`);
  console.log('  head:', render.text.slice(0, 220).replace(/\s+/g, ' '));
  console.log('  含 asset 重写:', render.text.includes('/api/dicts/OALD9EnEn/asset/'));
  console.log('  含 audio 重写:', render.text.includes('/api/dicts/OALD9EnEn/audio?key='));

  const audio = await request(app)
    .get('/api/dicts/OALD9EnEn/audio')
    .query({ key: 'media/english/uk_pron/b/bat/batte/battery__gb_1.mp3' });
  console.log(
    `\nGET audio mp3: ${audio.status} bytes=${audio.body?.length ?? 0} type=${audio.headers['content-type']}`,
  );

  const asset = await request(app).get('/api/dicts/OALD9EnEn/asset/OALD9EnEn.css');
  console.log(
    `GET asset css: ${asset.status} content-length=${asset.headers['content-length']} type=${asset.headers['content-type']}`,
  );

  const missing = await request(app).get('/api/dicts/OALD9EnEn/render').query({ word: 'zzzzqqq' });
  console.log(`GET render miss: ${missing.status} 含未收录=${missing.text.includes('未收录')}`);
}

void main();
