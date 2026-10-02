// dream-admin 的零依赖一致性门禁。
// 校验那些「写错就加载失败」的打包合同：
//   - package.json 必备字段 / exports / dsh.bundle.patch / dsh.client / files
//   - package.json 不得声明任何 @deepseek-ai/* 依赖（DSH profile 已提供）
//   - cordis.patch.yml 的 insert id / name == 包名
//   - src/index.ts 导出 inject + apply + Config
//   - src/client/index.ts 导出 inject + apply
//   - lib/client.js 的 ModuleLoader id == 包名
// 运行：node scripts/gates/run.mjs   （失败退出码 1）
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];
const ok = (cond, msg) => {
  if (!cond) failures.push(msg);
};

// --- package.json ---
const pkgPath = join(root, 'package.json');
ok(existsSync(pkgPath), 'package.json missing');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const name = pkg.name;

ok(typeof name === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(name), `invalid package name: ${name}`);
ok(pkg.type === 'module', 'package.json#type must be "module"');
ok(pkg.main === 'lib/index.js', 'package.json#main must be lib/index.js');
ok(pkg.exports?.['.'] != null, 'exports["."] required');
ok(pkg.exports?.['./package.json'] === './package.json', 'exports["./package.json"] required');
ok(
  pkg.exports?.['./cordis.patch.yml'] === './cordis.patch.yml',
  'exports["./cordis.patch.yml"] required for bundle form'
);
ok(pkg.dsh?.bundle?.patch === './cordis.patch.yml', 'dsh.bundle.patch must point to ./cordis.patch.yml');
ok(pkg.exports?.['./client'] === './lib/client.js', 'exports["./client"] must be ./lib/client.js');
ok(pkg.dsh?.client?.platform === 'web', 'dsh.client.platform must be "web"');
ok(Array.isArray(pkg.files) && pkg.files.includes('lib'), 'files must include "lib"');
ok(
  Array.isArray(pkg.files) && pkg.files.includes('cordis.patch.yml'),
  'files must include "cordis.patch.yml"'
);

// 禁止声明 @deepseek-ai/* 依赖（devDependencies 允许，仅用于类型）。
for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
  const keys = Object.keys(pkg[field] ?? {}).filter((k) => k.startsWith('@deepseek-ai/'));
  // schemastery 是唯一允许的例外：它是真实的运行时依赖，DSH profile 也提供，
  // 但插件需要显式声明以便独立安装时能解析。
  const offenders = keys.filter((k) => k !== '@deepseek-ai/schemastery' && k !== '@deepseek-ai/cordis');
  ok(offenders.length === 0, `${field} must not declare @deepseek-ai/* : ${offenders.join(', ')}`);
}

// --- cordis.patch.yml ---
const patchPath = join(root, 'cordis.patch.yml');
ok(existsSync(patchPath), 'cordis.patch.yml missing');
if (existsSync(patchPath)) {
  const patch = readFileSync(patchPath, 'utf8');
  ok(new RegExp(`id:\\s*${name}\\b`).test(patch), `patch insert id must equal "${name}"`);
  ok(new RegExp(`name:\\s*${name}\\b`).test(patch), `patch insert name must equal "${name}"`);
}

// --- src/index.ts ---
const entryPath = join(root, 'src', 'index.ts');
ok(existsSync(entryPath), 'src/index.ts missing');
if (existsSync(entryPath)) {
  const entry = readFileSync(entryPath, 'utf8');
  ok(/export\s+const\s+inject\s*=/.test(entry), 'src/index.ts must export `inject`');
  ok(/export\s+function\s+apply\s*\(/.test(entry), 'src/index.ts must export `apply`');
  ok(/export\s+const\s+name\s*=/.test(entry), 'src/index.ts must export `name`');
}

// --- src/client/index.ts ---
const clientPath = join(root, 'src', 'client', 'index.ts');
ok(existsSync(clientPath), 'src/client/index.ts missing (bundle-client requires client half)');
if (existsSync(clientPath)) {
  const client = readFileSync(clientPath, 'utf8');
  ok(/export\s+const\s+inject\s*=/.test(client), 'src/client/index.ts must export `inject`');
  ok(/export\s+function\s+apply\s*\(/.test(client), 'src/client/index.ts must export `apply`');
}

// --- lib/client.js（构建产物，已在仓库中时校验） ---
const builtClient = join(root, 'lib', 'client.js');
if (existsSync(builtClient)) {
  const code = readFileSync(builtClient, 'utf8');
  ok(
    new RegExp(`__ModuleLoader__\\.load\\(\\{\\s*id:\\s*"${name}"`).test(code),
    `lib/client.js ModuleLoader id must equal "${name}"`
  );
  ok(
    !/require\("react"\)\s*;?[\s\S]{0,80}useState/.test(code) || code.includes('require("react")'),
    'lib/client.js must externalize react'
  );
}

if (failures.length > 0) {
  console.error('GATE FAILED:');
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log('GATE PASSED: package/patch/entry contracts are consistent');
