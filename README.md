# DreamAdmin · 记忆管理

[English](#english) | [中文](#中文)

---

## English

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that
gives your agent **workspace-scoped long-term memory**. Memories live as plain
Markdown files inside your project folder, are injected into the system prompt
on every turn, and are editable by both you and the model. An optional
**memory dream** loop uses a model of your choice to merge, dedupe and distill
the library over time.

Requires DSH **0.2.0-rc.2 or later** (the Desktop app and `dsh web` both work).

### Features

- **Workspace-scoped storage** — Memories follow the workspace folder
  (`<workspace>/memory` by default), so each project keeps its own history.
  With no workspace in context, or with `scope: global`, the library falls back
  to a single shared directory under the DSH data home. You can also pin the
  library to any absolute path from the settings page.
- **Plain Markdown + YAML frontmatter** — One file per memory. Readable, greppable,
  git-friendly, and editable in any editor. No database, no lock-in.
- **Automatic recall** — A dynamic `systemPrompt.context()` section injects
  pinned + most-recently-updated memories into every model turn. Fully
  controllable (toggle, count, character budget).
- **Four model tools** — `memory_save`, `memory_search`, `memory_list`,
  `memory_forget`, so the agent can record and retrieve on its own.
- **Memory dream (optional)** — Off by default. Turn the switch on first and the
  provider / model fields unlock; on the configured interval that model reviews
  the library and proposes `update` / `merge` operations (never deletions).
- **Top-level management page** — A "Memory Management" panel sits **next to the
  Plugin Manager in the sidebar** (a `main`-slot panel, not a Settings section).
  It has two tabs: **Memories** — a list page where selecting a memory opens a
  detail page (no left/right split) — and **Settings**, grouped cards for
  storage, recall and memory dream with inline save indicators.
- **Bilingual** — UI text follows the DSH interface locale (Chinese / English).

### Where memories live

Resolution order (first match wins):

1. An explicit workspace path passed by the caller (tool argument / HTTP query).
2. `scope: global` → `<dir>` when `dir` is absolute, otherwise
   `<DSH_HOME>/dream-admin/memory`.
3. The most recently active session's `header.cwd` → `<cwd>/<dir>` (`dir`
   defaults to `memory`; an absolute `dir` pins the store to that folder, shared
   by every workspace).
4. Fallback → `<DSH_HOME>/dream-admin/memory`.

`DSH_HOME` defaults to `~/.dsh`. The plugin **never writes to the process cwd**.

The folder is configured in **Settings → Storage → Memory folder**: leave the
input empty to use the default above, or type an absolute path to pin the
library somewhere else. The line underneath always shows the resolved path
actually in effect; **Use default** clears the override.

Each memory is a file such as `memory/fix-login-timeout-a1b2c3.md`:

```markdown
---
id: "fix-login-timeout-a1b2c3"
title: "登录接口超时排查"
tags: ["auth", "timeout"]
created: "2026-10-02T07:00:00.000Z"
updated: "2026-10-02T08:12:00.000Z"
source: "manual"
pinned: false
---
网关默认 30s 超时，改到 60s 后不再复现。根因是下游批量查询。
```

You can edit these files by hand at any time; the plugin re-reads them on the
next scan (mtime-cached).

### How it works

```
workspace folder ──► <workspace>/memory/*.md ──► recall ──► system prompt
                            ▲                     ▲
                   memory_save / management UI    │
                            │                     │
                       memory dream ──────────────┘
                  (model of your choice: update / merge)
```

### Install

**Desktop app**: open the Plugins page → install from GitHub with
`github:Leopan0/DreamAdmin`.

**Web (`dsh web`)**:

```bash
# From a local directory (development)
dsh plugin --profile web add file:/path/to/DreamAdmin

# From GitHub
dsh plugin --profile web add "github:Leopan0/DreamAdmin#main"
```

Restart `dsh web` after installing.

### Open the management page

After installing, a **Memory Management** entry appears in the left sidebar, at
the same level as the Plugin Manager.

- **Memories** tab — pick the workspace in the header, search or create a memory
  from the list page, then click an entry to open its detail page (title, tags,
  pinned, body). Detail pages have Back, Save and Delete; the list is not shown
  alongside the editor.
- **Settings** tab — three cards: **Storage** (scope + memory folder),
  **Recall** (injection toggle, count, character budget) and **Memory dream**.

Every setting row saves on change and shows a status dot: amber = unsaved,
pulsing accent = saving, green = saved, red = failed.

### Tools available to the model

| Tool | Arguments | Purpose |
|---|---|---|
| `memory_save` | `body` (req), `title`, `tags[]`, `id`, `pinned`, `workspace` | Create or overwrite a memory. |
| `memory_search` | `query` (req), `limit`, `workspace` | Keyword search over title / tags / body. |
| `memory_list` | `limit`, `workspace` | List memories (pinned first, then newest). |
| `memory_forget` | `id` (req), `workspace` | Delete a memory. Irreversible. |

### Memory dream

Off by default. Flip the switch in **Settings → Memory dream** first — the
**provider** and **model** dropdowns stay disabled until it is on, and they are
loaded from the live DSH model list (`ctx.llm.listProviders` / `listModels`).
If the switch is on but no model has been chosen yet, the card says so and the
run button stays disabled.

Once configured, the plugin calls that provider/model on the interval. The model
receives the current library (capped) plus a system prompt that forbids inventing
facts, and returns a JSON list of `update` / `merge` operations. **Only `update`
and `merge` are allowed — the model cannot delete memories.** Unknown ids are
ignored. Changes are written back as normal memory files with `source: evolve`.

You can also run a pass immediately with **Dream now**; the last run time, the
result summary and a collapsible log appear under the button.

### Configuration reference

All sections are declared `volatile`, so the management page edits apply to the
running plugin immediately and are persisted to
`<DSH_HOME>/dream-admin/config.json` (survive restarts). A `cordis.patch.yml`
`config:` block works identically and only supplies the initial defaults.

#### `store` — where memories are kept

| Field | Type | Default | Meaning |
|---|---|---|---|
| `dir` | string | `"memory"` | Directory name relative to the workspace root, or an absolute path to force one fixed directory (honoured in both scopes). |
| `scope` | `"workspace"` \| `"global"` | `"workspace"` | `workspace`: follow the current workspace folder (`<workspace>/<dir>`). `global`: all workspaces share one directory (`<DSH_HOME>/dream-admin/memory`, or the absolute `dir`). |

#### `recall` — system-prompt injection

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `true` | Inject memories into the system prompt each turn. |
| `limit` | number | `5` | Max memories injected per turn (0-50). |
| `maxChars` | number | `4000` | Character budget for the injected block; excess is truncated. `0` = unlimited. |

#### `evolve` — memory dream

The config key keeps the historical name `evolve`; the UI calls it *memory dream*.

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `false` | Turn the memory dream loop on/off. Provider and model only become selectable once this is on. |
| `provider` | string | `""` | Provider route, chosen from the DSH model list. |
| `model` | string | `""` | Model id under that provider. |
| `intervalMinutes` | number | `30` | Interval between automatic runs (1-1440). |
| `minMemories` | number | `3` | Skip automatic runs when the library holds fewer than this many memories (manual runs are unaffected). |
| `maxTokens` | number | `4096` | Max output tokens for one dream call. |
| `prompt` | string | built-in | System prompt used for the dream call. |

### HTTP API

The management page talks to these exact routes under `/dream-admin/`:

| Method | Path | Purpose |
|---|---|---|
| GET | `/dream-admin/health` | Status + resolved config + current memory root. |
| GET | `/dream-admin/config` | Current config view (includes the server-resolved defaults). |
| POST | `/dream-admin/config` | Merge a config override (persisted to disk). |
| GET | `/dream-admin/models` | Provider / model directory for the dropdowns. |
| GET | `/dream-admin/workspaces` | Known workspace candidates. |
| GET | `/dream-admin/memories` | List (`?workspace=&q=&limit=`). |
| GET | `/dream-admin/memory` | Read one (`?id=&workspace=`). |
| POST | `/dream-admin/memory` | Create / overwrite (`{id?, workspace?, title, body, tags, pinned}`). |
| DELETE | `/dream-admin/memory` | Delete (`?id=&workspace=`). |
| POST | `/dream-admin/evolve` | Run one memory-dream pass now. |

### Verify

```bash
curl http://localhost:<port>/dream-admin/health
# {"status":"ok","plugin":"dream-admin","root":"...","recall":{...},"evolve":{...}}
```

### Develop

```bash
pnpm install
pnpm run bundle    # Node half + client half + types
pnpm run gates     # consistency checks
```

### License

MIT.

---

## 中文

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件，
给智能体带来**随工作区管理的长期记忆**。记忆以普通 Markdown 文件的形式存放在
你的项目文件夹里，每一轮对话都会注入系统提示，你和模型都可以编辑。可选的
**记忆梦境**会按间隔调用你指定的模型，自动合并、去重、提炼记忆库。

要求 DSH **0.2.0-rc.2 或更高版本**（桌面版与 `dsh web` 均可）。

### 功能

- **随工作区存储** — 记忆跟着工作区文件夹走（默认 `<工作区>/memory`），每个
  项目各留各的历史。没有工作区上下文、或配置 `scope: global` 时，回落到 DSH
  数据目录下的共享目录；也可以在设置页把记忆固定到任意绝对路径。
- **Markdown + YAML frontmatter** — 一条记忆一个文件。可读、可 grep、可入库
  git、可用任意编辑器改，无数据库、无锁定。
- **自动召回** — 通过动态 `systemPrompt.context()` 把「置顶 + 最近更新」的记忆
  注入每个模型轮次。开关、条数、字符预算全部可调。
- **四个模型工具** — `memory_save` / `memory_search` / `memory_list` /
  `memory_forget`，模型可自行记录与检索。
- **记忆梦境（可选）** — 默认关闭。先打开开关，供应商 / 模型的下拉框才会解锁；
  之后按间隔调用所选模型，对记忆库做 `update` / `merge` 整理（**不开放删除**）。
- **顶级管理页** — 左侧栏「记忆管理」与「插件管理」**同级**（走 `main` 槽的
  顶级面板，不是设置页的一个分区）。页内分两个页签：**记忆**是列表页，点一条
  进入详情页（不再左右分栏）；**设置**用分组卡片承载存储、召回与记忆梦境，
  每行设置带行内保存状态点。
- **中英双语** — UI 文案跟随 DSH 界面语言自动切换。

### 记忆存在哪

解析优先级（命中即止）：

1. 调用方显式给出的工作区路径（工具参数 / HTTP 查询参数）；
2. `scope: global` → `dir` 为绝对路径时即该目录，否则
   `<DSH_HOME>/dream-admin/memory`；
3. 最近活跃会话的 `header.cwd` → `<cwd>/<dir>`（`dir` 默认 `memory`；为绝对
   路径时直接用该目录，此时各工作区共用）；
4. 兜底 → `<DSH_HOME>/dream-admin/memory`。

`DSH_HOME` 默认 `~/.dsh`。本插件**绝不写进程 cwd**。

记忆目录在「**设置 → 存储 → 记忆目录**」里配置：留空即用上面的默认目录，填一个
绝对路径可把记忆固定到别处；下方一行始终显示当前真正生效的解析结果，点「恢复
默认」即清空自定义。

每条记忆是一个文件，例如 `memory/fix-login-timeout-a1b2c3.md`：

```markdown
---
id: "fix-login-timeout-a1b2c3"
title: "登录接口超时排查"
tags: ["auth", "timeout"]
created: "2026-10-02T07:00:00.000Z"
updated: "2026-10-02T08:12:00.000Z"
source: "manual"
pinned: false
---
网关默认 30s 超时，改到 60s 后不再复现。根因是下游批量查询。
```

你可以随时手工编辑这些文件；插件下次扫描时会重新读取（按 mtime 缓存）。

### 工作原理

```
工作区文件夹 ──► <工作区>/memory/*.md ──► 召回 ──► 系统提示
                       ▲                   ▲
            memory_save / 管理页           │
                       │                   │
                   记忆梦境 ───────────────┘
             （你选的模型：update / merge）
```

### 安装

**桌面版**：打开插件管理页 → 从 GitHub 安装 `github:Leopan0/DreamAdmin`。

**Web（`dsh web`）**：

```bash
# 本地目录（开发）
dsh plugin --profile web add file:/path/to/DreamAdmin

# 从 GitHub
dsh plugin --profile web add "github:Leopan0/DreamAdmin#main"
```

安装后重启 `dsh web`。

### 打开管理页

安装后左侧栏会出现「**记忆管理**」入口，与「插件管理」同级。

- **记忆**页签 — 顶部选工作区；在列表页搜索或新建，点某一条进入详情页（标题、
  标签、置顶、正文）。详情页有「返回 / 保存 / 删除」，列表不会和编辑器挤在一起。
- **设置**页签 — 三张卡片：**存储**（作用域 + 记忆目录）、**召回**（注入开关、
  条数、字符上限）、**记忆梦境**。

每个设置项改完即存，并在右侧显示状态点：琥珀 = 未保存、强调色脉冲 = 保存中、
绿色 = 已保存、红色 = 保存失败。

### 提供给模型的工具

| 工具 | 参数 | 用途 |
|---|---|---|
| `memory_save` | `body`（必填）、`title`、`tags[]`、`id`、`pinned`、`workspace` | 新建或覆盖一条记忆。 |
| `memory_search` | `query`（必填）、`limit`、`workspace` | 按标题 / 标签 / 正文做关键词检索。 |
| `memory_list` | `limit`、`workspace` | 列出记忆（置顶优先，然后按更新时间倒序）。 |
| `memory_forget` | `id`（必填）、`workspace` | 删除一条记忆。不可撤销。 |

### 记忆梦境

默认关闭。先到「**设置 → 记忆梦境**」打开开关——**供应商**与**模型**下拉框在
开启前是禁用的；选项来自 DSH 实时模型列表（`ctx.llm.listProviders` /
`listModels`）。如果已开启但还没选模型，卡片会给出提示，运行按钮保持禁用。

配置好后，插件按间隔调用所选 provider/model。模型会收到当前记忆库（有条数 /
长度上限）和一段禁止编造事实的系统提示，返回一份 JSON 形式的 `update` /
`merge` 操作列表。**只允许 `update` 与 `merge`，模型无法删除记忆**；不存在的
id 会被忽略。改动会以普通记忆文件写回，`source` 标为 `evolve`。

也可以点「**立即入梦**」手动触发一次；按钮下方显示上次入梦时间、结果摘要，以及
一份可折叠的梦境记录。

### 配置项

所有配置节都声明为 `volatile`：管理页的修改即时对运行中的插件生效，并持久化到
`<DSH_HOME>/dream-admin/config.json`（重启不丢）。`cordis.patch.yml` 的
`config:` 块写法完全等效，且只提供「初始默认值」。

#### `store` — 记忆存放位置

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `dir` | string | `"memory"` | 工作区内的目录名，或一个绝对路径以固定目录（两种作用域下都生效）。 |
| `scope` | `"workspace"` \| `"global"` | `"workspace"` | `workspace`：跟随当前工作区文件夹（`<工作区>/<dir>`）；`global`：所有工作区共用一个目录（`<DSH_HOME>/dream-admin/memory`，`dir` 为绝对路径时即该目录）。 |

#### `recall` — 系统提示注入

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 是否每轮把记忆注入系统提示。 |
| `limit` | number | `5` | 每轮注入的记忆条数上限（0-50）。 |
| `maxChars` | number | `4000` | 注入文本的字符预算，超出即截断。`0` = 不限制。 |

#### `evolve` — 记忆梦境

配置键沿用历史名 `evolve`，界面里叫**记忆梦境**。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `false` | 是否开启记忆梦境循环；只有开启后供应商与模型才可选。 |
| `provider` | string | `""` | provider 路由，从 DSH 模型列表中选择。 |
| `model` | string | `""` | 该 provider 下的模型 id。 |
| `intervalMinutes` | number | `30` | 自动执行的间隔（分钟，1-1440）。 |
| `minMemories` | number | `3` | 记忆条数低于该值时跳过自动执行（手动触发不受限）。 |
| `maxTokens` | number | `4096` | 单次梦境调用的最大输出 token 数。 |
| `prompt` | string | 内置 | 梦境调用使用的系统提示。 |

### HTTP 接口

管理页通过 `/dream-admin/` 下的这些 exact 路由通信：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/dream-admin/health` | 状态 + 解析后的配置 + 当前记忆根目录。 |
| GET | `/dream-admin/config` | 当前配置视图（含服务端解析出的默认值）。 |
| POST | `/dream-admin/config` | 合并一份配置覆盖（落盘持久化）。 |
| GET | `/dream-admin/models` | provider / model 目录，供下拉框使用。 |
| GET | `/dream-admin/workspaces` | 已知工作区候选。 |
| GET | `/dream-admin/memories` | 列表（`?workspace=&q=&limit=`）。 |
| GET | `/dream-admin/memory` | 读单条（`?id=&workspace=`）。 |
| POST | `/dream-admin/memory` | 新建 / 覆盖（`{id?, workspace?, title, body, tags, pinned}`）。 |
| DELETE | `/dream-admin/memory` | 删除（`?id=&workspace=`）。 |
| POST | `/dream-admin/evolve` | 立即执行一次记忆梦境。 |

### 验证

```bash
curl http://localhost:<port>/dream-admin/health
# {"status":"ok","plugin":"dream-admin","root":"...","recall":{...},"evolve":{...}}
```

### 开发

```bash
pnpm install
pnpm run bundle    # Node 侧 + client 侧 + 类型
pnpm run gates     # 一致性检查
```

### 许可证

MIT。
