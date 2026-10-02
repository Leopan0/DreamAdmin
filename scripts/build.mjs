// 把 Node half 打包成单个 ESM 文件 lib/index.js。
//
// `packages: 'external'` 让所有 node_modules 导入保持外部化：
//   - @deepseek-ai/schemastery 是真正的运行时依赖（在 package.json 里声明，
//     随插件一起安装）；
//   - @deepseek-ai/dsh-tools 是 DSH 宿主提供的运行时模块（profile 已提供，
//     由 DSH 的加载器解析），同样保持外部化；
//   - 其余 @deepseek-ai/* 只做 import type，被 esbuild 擦除。
//
// 运行：node scripts/build.mjs
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('lib', { recursive: true });

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'lib/index.js',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info'
});

console.log('[build] lib/index.js ready');
