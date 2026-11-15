/* eslint-disable no-console */
/**
 * 本机缺少 Python / MSVC 时，better-sqlite3 会回退到源码编译并失败。
 * 本脚本直接从镜像下载与当前 Node ABI 匹配的预编译二进制并解压。
 *
 * 用法：
 *   npm install --ignore-scripts
 *   npm run setup:sqlite
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { execFileSync } = require('node:child_process');

const pkgDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');

function verify() {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.exec('CREATE TABLE t(a)');
    db.close();
    console.log('✓ better-sqlite3 可用，无需安装预编译包');
    return true;
  } catch {
    return false;
  }
}

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('重定向次数过多'));
      return;
    }
    https
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          download(response.headers.location, dest, redirects + 1).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`下载失败，HTTP ${response.statusCode}`));
          return;
        }
        const stream = fs.createWriteStream(dest);
        response.pipe(stream);
        stream.on('finish', () => stream.close(() => resolve(dest)));
        stream.on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  if (verify()) return;

  if (!fs.existsSync(pkgDir)) {
    console.error('✗ 未找到 node_modules/better-sqlite3，请先运行 npm install --ignore-scripts');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  const abi = process.versions.modules;
  const file = `better-sqlite3-v${pkg.version}-node-v${abi}-${process.platform}-${process.arch}.tar.gz`;
  const url = `https://npmmirror.com/mirrors/better-sqlite3/v${pkg.version}/${file}`;
  const tmp = path.join(os.tmpdir(), file);

  console.log(`正在下载预编译二进制：${url}`);
  await download(url, tmp);
  execFileSync('tar', ['-xzf', tmp, '-C', pkgDir], { stdio: 'inherit' });
  fs.rmSync(tmp, { force: true });

  if (!verify()) {
    console.error('✗ 预编译二进制安装后仍不可用，请检查 Node 版本或手动编译环境');
    process.exit(1);
  }
  console.log('✓ 已安装 better-sqlite3 预编译二进制');
}

main().catch((error) => {
  console.error('✗ 安装失败：', error.message);
  process.exit(1);
});
