# DreamAdmin 插件计划

> 本插件由 DSH 插件开发助手（dsh-plugin-studio）生成。
> 每阶段决策确定后勾选对应项，未通过不得进入下一阶段。

## 阶段 ①：需求捕获

- [x] 插件名：`dream-admin`
- [x] 一句话目标：给 DSH 智能体提供「随工作区管理、用户可编辑、可选记忆梦境」的长期记忆。
- [x] 能力面清单：
  - 记忆库（Markdown + YAML frontmatter，工作区模式落点 `<工作区>/memory`）
  - 系统提示召回（`systemPrompt.context()` 动态注入）
  - 4 个模型工具（`memory_save` / `memory_search` / `memory_list` / `memory_forget`）
  - 记忆管理页（与「插件管理」同级的顶级面板 `main` + `sidebar.panellist`）
  - 记忆梦境（可开关、可选模型、按间隔调用）
  - HTTP 接口（`/dream-admin/*`，供管理页与外部脚本消费）
- [x] 目标 profile：web

## 阶段 ②：形态与分发决策

- [x] 形态：`bundle-client`（Node half + 浏览器 client half）
- [x] 分发方式：git 源（`github:Leopan0/DreamAdmin#main`）；本地开发用 `file:` 目录
- [x] 包管理器：pnpm

## 阶段 ③：配方装配

- [x] `src/index.ts` 已生成（含配方法代码）
- [x] `src/client/index.ts` 已生成（顶级面板配方：`main` keyed 槽 + `sidebar.panellist` list 槽；页内「记忆 / 设置」两页签，记忆为列表→详情二级导航）
- [x] `inject` 已覆盖所有服务：Node 侧 `['llm','tools','sessions','systemPrompt','webServer']`；client 侧 `['slots','locale']`
- [x] 冒烟功能就绪（`GET /dream-admin/health`；侧边栏「记忆管理」面板）
- [x] 未手改 `lib/`

## 阶段 ④：本地验证

- [ ] `pnpm install` 通过
- [ ] `pnpm run bundle` 通过
- [ ] `pnpm run gates` 通过
- [ ] `python3 <skill>/scripts/verify_plugin.py .` 通过

> 按用户规则「所有我能手动操作的，都不需要你操作（含编译、执行命令后验证）」，
> 以上均由用户自行执行，本阶段留空。

## 阶段 ⑤：安装与浏览器冒烟

- [ ] 安装成功（`dsh plugin --profile web add file:D:/HarnessPluginProject/DreamAdmin`）
- [ ] 启动日志无 `plugin tree failed to load`
- [ ] 浏览器无 `slot entry crashed`
- [ ] 冒烟功能可用（侧边栏出现「记忆管理」，能新建 / 编辑 / 删除记忆）

## 阶段 ⑥：发布

- [ ] git 仓库与 remote 就绪
- [x] README 使用真实安装 ref
- [x] 构建产物已入库（`lib/` 由 `pnpm run bundle` 产出后入库）
- [ ] 从目标 ref 重装验证通过

## 备注

- 降级说明：环境具备 node/pnpm，但按用户规则跳过了全部可执行验证（阶段 ④ 与
  阶段 ⑤ 的可执行部分），采用「代码优先交付」。
- 决策变更记录：
  - 阶段 ② 中曾考虑复用 `settings.section`（如 ContextDistiller 的做法），因需求 3
    明确要求「管理页面与插件管理同级、不在设置里」，改为 `main` keyed 槽 +
    `sidebar.panellist`。回退原因：`settings.section` 会渲染进设置页，与需求冲突。
  - 管理页首版为「左侧列表 + 右侧编辑器」同屏布局，后按用户反馈改为
    **列表页 → 详情页二级导航**（不再左右分栏），理由是窄面板下同屏分栏两侧都
    不可用，且「选一条记忆」本身就是一次明确的导航动作。
  - 「自进化」在界面统一改称**记忆梦境**；`evolve` 配置键保持不变，避免旧
    `config.json` 失效。
  - `store.dir` 的绝对路径语义从「仅在 workspace 作用域生效」扩展为
    「两种作用域都生效」，使设置页的「记忆目录」字段在 `global` 下也真正可用。

---

## 已核实的关键 DSH 事实（0.2.0-rc.2）

以下均在本地 DSH asar 解包产物中逐条核对，用于避免照搬 0.1.x 插件的旧写法。

### 顶级面板（需求 3 的落点）

- `main` 是 **keyed 槽**，注册必须带 `key`：
  ```js
  ctx.slots.inject('main', () => ctx.slots.register(
    { name: 'main', key: PANEL_ID, locale: NS, inject: () => ({ t }) },
    PageComponent
  ))
  ```
- `sidebar.panellist` 是 **list 槽**，注册必须带 `id` / `order` / `label`：
  ```js
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
    { name: 'sidebar.panellist', id: PANEL_ID, order: 30, locale: NS, label: () => t('panel') },
    IconComponent
  ))
  ```
- 两处 `PANEL_ID` 必须一致。
- 布局层 `MainPanel` 用 `renderSlot('main', {}, { entryKey: usePanelInfo(i => i.activePanelId) ?? 'conversation' })`
  选择要渲染的面板；`entryKey` 即注册时的 `key`。
- 组件 props = 框架 shares（`t` 来自 `locale: NS`、`renderSlot`、`owner`、session kit）+ `inject` 返回值。
- 侧边栏图标组件签名：`({ size }) => JSX`。
- 参照实现：`dsh-client-ui-plugin-manager/lib/client.js`（`PANEL_ID = "plugins"`、
  `order: 30`）、`dsh-client-ui-schedule/lib/client.js`（`order: 10`）。

### Node 侧 API

- `defineTool`（`@deepseek-ai/dsh-tools`）是**真实运行时导入**，做 ParameterSchemaSpec →
  JSON Schema 转换 + 执行期校验，**不能用手写普通对象替代**。
  `ctx.tools.register(def)` 返回 disposer。
- `ctx.llm.listProviders(): { id, name }[]`；
  `await ctx.llm.listModels(provider): { provider, id, name, description? }[]`。
- `ctx.llm.stream({ provider, model, messages, system?, maxTokens? })` → AsyncIterable，
  取 `chunk.type === 'text-delta'` 的 `chunk.text`。
- `ctx.systemPrompt.context({ name, order, text })` → disposer；`text` **支持函数形式**
  （装配流程先求值函数、再做 `{{}}` 插值）。该注册挂在 systemPrompt 服务上，
  **不随本插件 fiber 回收，必须手动 dispose**。
- `ctx.sessions.list()` → `Session[]`；`session.header.cwd`（绝对路径）、`session.header.createdAt`。
- `ctx.webServer.register({ kind: 'exact', path, handler(req, res) })` → disposer；重复 path 抛错。

### 两个运行期陷阱（已做防护）

1. **`{{` 插值抛错**：`renderContextSections` 会对 context 文本做 `{{variable}}` 插值，
   遇到 malformed / 未知引用会**抛错**，从而打断模型调用。用户可编辑的记忆正文一旦
   含 `{{` 就会命中。防护：`src/prompt.ts` 的 `neutralizeBraces()` 把 `{{` 替换为 `{ {`。
2. **进程 cwd 漂移**：无工作区上下文时若回落进程 cwd，记忆目录会随宿主启动位置变化。
   防护：`src/paths.ts` 一律回落 `<DSH_HOME>/dream-admin/memory`。

### 打包合同

- `type: module`、`main: lib/index.js`，exports 含 `"."` / `"./client"` /
  `"./cordis.patch.yml"` / `"./package.json"`。
- `dsh.bundle.patch` 指向 `cordis.patch.yml`；`dsh.client.platform: 'web'`。
- `files: ["lib", "cordis.patch.yml", "README.md"]`。
- **禁止在 dependencies / peerDependencies 声明 `@deepseek-ai/*`**（`schemastery`、`cordis` 例外），
  仅 devDependencies 允许；运行时 import 不受限（由宿主提供）。
- client bundle 为 CJS，包在 `window.__ModuleLoader__.load({ id, factory })` 中；
  `react` / `react-dom` / `react/jsx-runtime` 必须 external；JSX 用
  `jsx: 'automatic'` + `jsxImportSource: 'react'`。

---

## 存储格式决策（需求 2 + 需求 5）

选 **Markdown + YAML frontmatter**，一条记忆一个文件：

```markdown
---
id: "..."
title: "..."
tags: ["a", "b"]
created: "..."
updated: "..."
source: "manual" | "tool" | "evolve"
pinned: false
---
正文（Markdown）
```

理由：

- 需求 5「记忆可以受用户的编辑」不依赖专门 UI 即可成立——用户可用任何编辑器改，
  也能进 git 审阅。
- 无数据库、无 schema 迁移负担。
- frontmatter 读写用最小自实现（不引第三方 YAML），所有值以 JSON 标量写出，
  因此中文 / 引号 / 冒号内容都能无损往返。

目录解析优先级：显式工作区 → `global` 模式 → 最近活跃会话 cwd → 全局兜底。

`store.dir` 既是「工作区内的子目录名」也是「绝对路径覆盖」：为绝对路径时直接用该
目录，**两种作用域下都生效**（`global` 分支同样先看 `dir` 是否为绝对路径，
见 `globalMemoryRoot(dir?)`）。设置页的「记忆目录」输入框写的就是这个字段，因此
「跟随工作区」模式下也有默认目录，且用户随时可以改成固定路径。

配置的持久化：UI 改动写入 `<DSH_HOME>/dream-admin/config.json`，与工作区无关、
全局一份；`cordis.patch.yml` 的 `config:` 只提供初始默认值。所有配置节声明为
`volatile`，因此改配置不会重建运行中的插件实例，且即时生效。

自进化定时器（记忆梦境的执行器）采用**固定每分钟轮询 + 现算间隔**（而非
`setInterval(间隔)`），这样在管理页改间隔后立即生效；定时器 `unref()`，
不拖住宿主退出。

---

## 记忆梦境设计取舍（需求 4）

- **只允许 `update` / `merge`，不开放 `delete`**。删除是不可逆的高风险动作，
  交给用户（管理页 / `memory_forget`）显式执行更安全。
- id 必须在库中真实存在，否则忽略该 op——防止模型幻觉出不存在的条目。
- 单次输入有条数上限（60）与单条正文上限（2000 字符），单次最多 50 个 op。
- 系统提示显式禁止发明输入中不存在的事实，并要求保留可验证细节
  （路径、命令、标识符、数字、偏好与纠正）。
- 手动触发（管理页按钮 / `POST /dream-admin/evolve`）不受 `minMemories` 限制。
- provider / model 不硬编码，必须从 DSH 模型列表中选择；未配置时 `run()` 直接
  返回失败原因（HTTP 409），不会静默跳过。

---

## 管理页 UI/UX 决策（一轮重构）

方向：**systematic** —— 贴 DSH 宿主外观，密度优先，不做营销页式的表现力设计。
实现轨道（二轮重构后）：**官方样式方案** —— `src/client/dream-admin.module.css` 只写
宿主设计令牌（`--dsw-alias-*` / `--dsw-*`），经 `scripts/build-client.mjs` 的
`dsh-css` 插件编译成哈希作用域样式并在运行时注入 `<style data-plugin data-plugin-css>`
（与官方 `dsh-web-ui-notify` 产物同构）；组件里不再有内联样式对象 `S`，也不再有
`da-` 前缀的自有样式体系。**不新增依赖。**

信息架构：

| 决策 | 落点 |
|---|---|
| 记忆不再左右分栏 | `view === 'memory'` 下按 `draft` 是否为空二选一渲染：列表页 / 详情页 |
| 列表 → 详情二级导航 | 列表项点击调 `openMemory(id)` 置 `draft`；详情页头部「← 返回」置 `draft = null` |
| 工作区选择器位置 | 只在列表页头部显示，避免编辑中途切工作区导致上下文漂移 |
| 记忆目录移出记忆页 | 记忆页不再显示 `rootLine`；改为设置 → 存储卡片里的「记忆目录」行 |
| 设置组织 | 页内页签（记忆 / 设置）+ 分组卡片（存储 / 召回 / 记忆梦境）+ 行式设置项 |
| 自进化 → 记忆梦境 | 仅改**用户可见文案**与 schema 描述；配置键仍是 `evolve.*`，旧 config.json 不受影响 |
| 供应商 / 模型可编辑性 | 关闭时 `disabled`；开启后才可选，未选时卡片提示且运行按钮禁用 |
| 保存反馈 | 行内状态点四态：dirty(琥珀) / saving(强调色脉冲) / saved(绿，1.6s 后清除) / error(红) |
| 梦境结果码 | 服务端 reason 码在客户端映射为本地化文案，不再直接暴露 `too_many_memories` 这类枚举 |

实现要点（避免踩坑）：

- `row()` / `dot()` 用**普通函数调用**而非 `<Component/>`，`NumberField` 与 `Switch`
  定义为**模块级组件**——否则每次 render 生成新组件身份，输入框会失焦。
- 自动保存的 `commit()` 只把被改动的那一节（store / recall / evolve）用服务端回包
  覆盖，其余分节保留本地编辑，避免保存回包冲掉用户正在输入的值。
- `useCallback` 的依赖数组在 render 时立刻求值：被依赖的 `const`（如 `defaultDir`）
  必须声明在 `useCallback` **之前**，否则触发 TDZ `ReferenceError` 让整页白屏
  （2026-10-02 线上事故：`savePath` 依赖 `defaultDir` 但声明在其后）。
- 视觉一律走宿主令牌：宿主改令牌名只让外观退化、不会让渲染失败；颜色 / 间距 /
  控件高度（32px）逐项照搬宿主设置页与插件管理页的既有写法，不引入自有色板。

---

## 文件清单

| 路径 | 作用 |
|---|---|
| `package.json` | 打包合同：exports / dsh / files / scripts / 依赖 |
| `tsconfig.json` | Node half 声明产出：`emitDeclarationOnly`，`rootDir: src` |
| `tsconfig.client.json` | client half 类型检查：`noEmit` + DOM lib，覆盖 `src/client` |
| `cordis.patch.yml` | bundle patch 入口（裸 `insert` + 初始 config） |
| `scripts/build.mjs` | Node half → `lib/index.js`（ESM / node20） |
| `scripts/build-client.mjs` | client half → `lib/client.js`（CJS + ModuleLoader 包装 + `dsh-css` 模块） |
| `scripts/gates/run.mjs` | 一致性门禁 |
| `src/config.ts` | schemastery schema、解析、持久化 |
| `src/paths.ts` | 记忆根目录解析、工作区发现 |
| `src/store.ts` | 记忆库读写、前端 frontmatter 解析 |
| `src/prompt.ts` | 系统提示召回注入 |
| `src/tools.ts` | 4 个模型工具 |
| `src/evolve.ts` | 记忆梦境执行器（配置键仍是 `evolve`） |
| `src/routes.ts` | `/dream-admin/*` HTTP 接口 |
| `src/index.ts` | cordis 插件入口 |
| `src/css-modules.d.ts` | `*.module.css` 的 TS 声明 |
| `src/client/index.ts` | 浏览器侧顶级「记忆管理」面板 |
| `src/client/dream-admin.module.css` | 面板样式：只写宿主设计令牌，由 dsh-css 哈希作用域化 |
