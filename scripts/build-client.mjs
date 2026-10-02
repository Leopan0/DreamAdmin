// 把浏览器 client half 打包成 lib/client.js。
//
// 产物是包在 DSH ModuleLoader 里的 CJS：
//   window.__ModuleLoader__.load({ id: "dream-admin", factory: (require) => { ... } })
//
// react / react-dom 保持 external（运行时由平台提供），JSX 走 automatic runtime
// 也指向 external 的 react/jsx-runtime，避免把 React 打进来。
//
// 样式走官方插件同款的 `dsh-css` esbuild 插件：`src/client/*.module.css` 被编译成
//   - 一个哈希类名作用域的 CSS 字符串（`hash_name`），
//   - 运行时段幂等注入 <style data-plugin data-plugin-css>，
//   - default 导出 原名 → 哈希名 的映射表。
// 语义与 dsh-web-ui-notify 的产物一致，因此插件样式永远不会和宿主互相污染。
//
// 运行：node scripts/build-client.mjs
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 包根目录：以脚本位置推导，避免依赖进程 cwd。 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientDir = 'src/client';

mkdirSync(join(root, 'lib'), { recursive: true });

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const pluginId = pkg.name;
const clientEntry = join(root, clientDir, 'index.ts');

/** tagId：与官方一致，形如 `<插件名>/<相对 src/client 的路径>`。 */
function tagIdFor(relativePath) {
  return `${pluginId}/${relativePath.replace(/\\/g, '/')}`;
}

/** 由 tagId 派生 6 位类名前缀（FNV-1a → base36），保证同文件同前缀。 */
function prefixFor(tagId) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < tagId.length; i += 1) {
    hash ^= tagId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(6, '0').slice(-6);
}

/** 去掉注释、压平换行与连续空白；保留选择器之间的单个空格（> + ~ 等组合符需要）。 */
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*\r?\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * 官方 dsh-css 插件的等价实现。把 `*.module.css` 变成一段自注入样式的 JS 模块，
 * 类名统一改写为 `<prefix>_<原名>`，避免与其他插件 / 宿主的类名冲突。
 */
function dshCssModules() {
  return {
    name: 'dsh-css',
    setup(builder) {
      builder.onResolve({ filter: /\.module\.css$/ }, (args) => {
        const abs = resolve(root, args.resolveDir ?? '.', args.path);
        return { path: `\0dsh-css:${abs}`, namespace: 'dsh-css' };
      });
      builder.onLoad({ filter: /.*/, namespace: 'dsh-css' }, (args) => {
        const abs = args.path.replace(/^\0dsh-css:/, '');
        const tagId = tagIdFor(relative(join(root, clientDir), abs));
        const source = readFileSync(abs, 'utf8');
        const prefix = prefixFor(tagId);
        const table = {};
        const css = minifyCss(source).replace(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g, (_match, name) => {
          if (table[name] === undefined) table[name] = `${prefix}_${name}`;
          return `.${table[name]}`;
        });
        const classes = Object.entries(table)
          .map(([name, hashed]) => `${JSON.stringify(name)}: ${JSON.stringify(hashed)}`)
          .join(', ');
        const contents = `const css = ${JSON.stringify(css)};
const tagId = ${JSON.stringify(tagId)};
if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {
  const tag = document.createElement('style');
  tag.dataset.plugin = ${JSON.stringify(pluginId)};
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
export default { ${classes} };
`;
        return { contents, loader: 'js', resolveDir: root };
      });
    }
  };
}

// 1) 先打包成临时 CJS 字符串。
const result = await build({
  entryPoints: [clientEntry],
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  jsx: 'automatic',
  jsxImportSource: 'react',
  loader: { '.ts': 'tsx' },
  plugins: [dshCssModules()],
  outfile: join(root, 'lib', '.client-raw.js'),
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    'react-dom/client',
  ],
  sourcemap: false,
  write: false,
  logLevel: 'info',
});

// 2) 包进 ModuleLoader，写出最终 lib/client.js。
const rawCode = result.outputFiles[0].text;

const wrapped = `/* dream-admin client bundle — built ${new Date().toISOString()} */
window.__ModuleLoader__.load({ id: ${JSON.stringify(pluginId)}, factory: function (require) {
  var module = { exports: {} };
  var exports = module.exports;
${rawCode}
  return module.exports;
} });
`;

writeFileSync(join(root, 'lib', 'client.js'), wrapped, 'utf8');
console.log('[build:client] lib/client.js ready');
