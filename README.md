# DreamAdmin · 记忆管理

[English](#english) | [中文](#中文)

---

## English

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that
gives your agent **long-term memory as plain Markdown**: injected into the system
prompt on every turn, editable by both you and the model, grouped per workspace
or per repository. Three optional model-driven loops keep it useful — **capture**
(distil memories from past sessions), **semantic recall** (rewrite search terms
so paraphrases still match) and **memory dream** (merge / dedupe the library).

Requires DSH **0.2.0-rc.2 or later** (the Desktop app and `dsh web` both work).

### Features

- **Workspace or repository grouping** — `store.groupBy`:
  - `workspace` (default): one library per workspace folder, `<workspace>/memory`;
  - `peer`: one library per **repository identity** (git `origin`, normalised), so
    several clones / worktrees of the same repo share their memory. Stored under
    `<DSH_HOME>/dream-admin/peers/<peer>/memory`.
  With no workspace in context the library falls back to
  `<DSH_HOME>/dream-admin/memory`. The plugin **never writes the process cwd**.
- **Layered recall (token-friendly)** — each turn injects only title + tags +
  one-line **summary** + the owning workspace, never the body. The model calls
  `memory_read` when it needs details. Summaries come from capture / dream, and
  fall back to the body's first sentence for free.
- **BM25 keyword search** — CJK-aware (character-bigram) scoring over
  title / tags / summary / body, so 「包管理」 also matches 「包管理器」.
- **Semantic recall (optional)** — the model you pick rewrites the query into
  synonyms, near-synonyms and cross-language variants, which are blended into the
  keyword score. Note: DSH exposes **no embeddings API**, so this is
  model-assisted rewriting rather than vector search. Off or unset → keyword-only.
- **Memory capture (optional)** — periodically reads each workspace's past
  sessions (including closed ones) and distils durable facts into memories.
  Only `create` / `update` are allowed; nothing is deleted.
- **Memory dream (optional)** — periodically merges, dedupes and rewrites the
  existing library. Only `update` / `merge` are allowed — the model **cannot
  delete** a memory.
- **Plain Markdown + YAML frontmatter** — one file per memory. Readable,
  greppable, git-friendly, editable in any editor. No database, no lock-in.
- **Top-level management page** — a "Memory Management" panel sits **next to the
  Plugin Manager in the sidebar** (a `main`-slot panel, not a Settings section).
- **Bilingual** — UI text follows the DSH interface locale (Chinese / English).

### Where memories live

Resolution order (first match wins):

1. An explicit workspace path passed by the caller (tool argument / HTTP query).
2. The most recently active session's `header.cwd`.
3. Fallback → `<DSH_HOME>/dream-admin/memory`.

For a resolved workspace the root depends on `store.groupBy`:

| `groupBy` | Root |
|---|---|
| `workspace` (default) | `<workspace>/memory` |
| `peer` | `<DSH_HOME>/dream-admin/peers/<peer>/memory` |

`DSH_HOME` defaults to `~/.dsh`. The settings card always shows the resolved path
currently in effect.

A `peer` is derived from the repository: the `origin` remote URL is normalised to
`host-owner-repo` (e.g. `github-com-leopan0-dreamadmin`); when there is no git
remote the directory path is used instead (`dir-<slug>`). Worktrees are followed
through `.git` → `gitdir` → `commondir`, so a worktree and its main checkout share
one peer. All of this is read from `.git/config` — no git process is spawned.

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
workspace: "D:\\HarnessPluginProject\\DreamAdmin"
peer: "github-com-leopan0-dreamadmin"
summary: "网关 30s 超时导致登录失败，改到 60s 后不再复现。"
---
网关默认 30s 超时，改到 60s 后不再复现。根因是下游批量查询。
```

`workspace` / `peer` / `summary` are optional and are back-filled the next time a
memory is written. You can edit these files by hand at any time; the plugin
re-reads them on the next scan (mtime-cached).

### How it works

```
                  ┌─ capture (model): past sessions ─► new memories
workspace folder ─┤
  or repo peer    ├─ recall: title + tags + summary ──► system prompt
                  │                              ▲
                  ├─ memory_search (BM25 + optional model rewrite)
                  │        └─ memory_read ────────┘  (full body on demand)
                  └─ dream (model): update / merge
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
  from the list page, then click an entry to open its detail page. Each list item
  shows its owning workspace / peer tag and its summary; the detail page also
  shows the workspace and workspace identity, plus Back / Save / Delete.
- **Settings** tab — five cards:
  - **Storage** — grouping (`workspace` / `peer`) and the resolved path;
  - **Recall** — injection toggle, count, character budget;
  - **Semantic recall** — toggle, provider / model, rewrite weight;
  - **Capture memories** — toggle, provider / model, interval, limits, and a
    "Capture now" button with the last run summary;
  - **Memory dream** — toggle, provider / model, interval, minimum library size,
    and a "Dream now" button.

Every setting row saves on change and shows a status dot: amber = unsaved,
pulsing accent = saving, green = saved, red = failed.

### Tools available to the model

| Tool | Arguments | Purpose |
|---|---|---|
| `memory_search` | `query` (req), `limit`, `workspace` | BM25 keyword search; blended with model rewrite when semantic recall is on. |
| `memory_read` | `id` (req), `workspace` | Read one memory's full body and metadata. |
| `memory_list` | `limit`, `workspace` | List memories (pinned first, then newest). |
| `memory_forget` | `id` (req), `workspace` | Delete a memory. Irreversible. |

There is no `memory_save` tool: writing memories is done by the capture loop, the
management page, or by editing the Markdown files directly.

### Model-driven features

All three loops share the same configuration style: **turn the switch on first —
the provider / model dropdowns stay disabled until then, and they are loaded from
the live DSH model list** (`ctx.llm.listProviders` / `listModels`). If a switch is
on but no model has been chosen yet, the card says so.

| Loop | Reads | Writes | Manual trigger |
|---|---|---|---|
| **Capture memories** | Past sessions of each workspace | `create` / `update` | `/记忆`, the **Capture now** button, `POST /dream-admin/capture` |
| **Semantic recall** | Your search query | — (rewrites the query only) | automatic on every search |
| **Memory dream** | The existing library | `update` / `merge` | `/入梦`, the **Dream now** button, `POST /dream-admin/evolve` |

Capture runs on a per-workspace schedule; dream runs on a global schedule. Both
skip automatic runs until their interval has elapsed. A manual `/记忆` or `/入梦`
ignores those gates, but still requires a provider and model to be configured.

The composer entries are the Chinese commands `/记忆` and `/入梦` — client-side
command contributions that POST this plugin's HTTP endpoints and surface the
result as a composer notice. No host command is registered, so the `/` menu lists
only these two. The trade-off: manual runs need a provider/model configured in
the settings (there is no fallback to the current conversation model), and results
show as a notice instead of a host flow node.

### Configuration reference

All sections are declared `volatile`, so management-page edits apply to the
running plugin immediately and are persisted to
`<DSH_HOME>/dream-admin/config.json` (they survive restarts). A `cordis.patch.yml`
`config:` block works identically and only supplies the initial defaults.

#### `store` — where memories are kept

| Field | Type | Default | Meaning |
|---|---|---|---|
| `groupBy` | `"workspace"` \| `"peer"` | `"workspace"` | `workspace`: one library per workspace folder (`<workspace>/memory`). `peer`: one library per repository identity (`<DSH_HOME>/dream-admin/peers/<peer>/memory`), shared by every clone / worktree of that repo. |

#### `recall` — system-prompt injection

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `true` | Inject memories into the system prompt each turn. |
| `limit` | number | `5` | Max memories injected per turn (0-50). |
| `maxChars` | number | `4000` | Character budget for the injected block; excess is truncated. `0` = unlimited. |

#### `search` — semantic recall

| Field | Type | Default | Meaning |
|---|---|---|---|
| `semantic` | boolean | `false` | Turn query rewriting on. Provider and model only become selectable once this is on. |
| `provider` | string | `""` | Provider route used for rewriting, chosen from the DSH model list. |
| `model` | string | `""` | Model id under that provider. |
| `weight` | number | `0.35` | Weight of the rewritten-term score when blended with the original term (0 = original only, 1 = rewritten only). |
| `maxTokens` | number | `256` | Max output tokens for one rewrite call. |
| `prompt` | string | built-in | System prompt used for the rewrite call. |

#### `capture` — distil memories from sessions

| Field | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `false` | Turn the capture loop on/off. Provider and model only become selectable once this is on. |
| `provider` | string | `""` | Provider route, chosen from the DSH model list. |
| `model` | string | `""` | Model id under that provider. |
| `intervalMinutes` | number | `30` | Interval between automatic runs, per workspace (1-1440). |
| `maxSessions` | number | `20` | Max recent sessions scanned per workspace per run. |
| `maxMessages` | number | `200` | Max recent messages taken from one session. |
| `maxChars` | number | `24000` | Character budget for the session transcript sent to the model. `0` = unlimited. |
| `maxTokens` | number | `4096` | Max output tokens for one capture call. |
| `prompt` | string | built-in | System prompt used for the capture call. |

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
| GET | `/dream-admin/health` | Status + resolved config + current memory root + `semanticReady`. |
| GET | `/dream-admin/config` | Current config view. |
| POST | `/dream-admin/config` | Merge a config override (persisted to disk). |
| GET | `/dream-admin/models` | Provider / model directory for the dropdowns. |
| GET | `/dream-admin/workspaces` | Known workspace candidates, with their derived peers. |
| GET | `/dream-admin/memories` | List / search (`?workspace=&q=&limit=`). |
| GET | `/dream-admin/memory` | Read one (`?id=&workspace=`). |
| POST | `/dream-admin/memory` | Create / overwrite (`{id?, workspace?, title, body, tags, pinned}`). |
| DELETE | `/dream-admin/memory` | Delete (`?id=&workspace=`). |
| POST | `/dream-admin/capture` | Run one capture pass now. |
| POST | `/dream-admin/evolve` | Run one memory-dream pass now. |

### Verify

```bash
curl http://localhost:<port>/dream-admin/health
# {"status":"ok","plugin":"dream-admin","root":"...","search":{...},"semanticReady":false,...}
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
给智能体带来**以普通 Markdown 存放的长期记忆**：每轮对话注入系统提示，你和模型
都能编辑，并按「工作区」或「仓库身份」分组。三条可选的模型闭环让它持续有用 ——
**整理记忆**（从历史会话提炼）、**语义召回**（改写检索词让「换个说法」也能命中）、
**记忆梦境**（合并 / 去重记忆库）。

要求 DSH **0.2.0-rc.2 或更高版本**（桌面版与 `dsh web` 均可）。

### 功能

- **按工作区或仓库分组** —— `store.groupBy`：
  - `workspace`（默认）：每个工作区目录一份记忆，落在 `<工作区>/memory`；
  - `peer`：每个**仓库身份**一份记忆（归一化后的 git `origin`），同一仓库的多个
    clone / worktree 共用，落在 `<DSH_HOME>/dream-admin/peers/<peer>/memory`。
  没有工作区上下文时回落到 `<DSH_HOME>/dream-admin/memory`。本插件**绝不写进程 cwd**。
- **分层召回（省 token）** —— 每轮只注入「标题 + 标签 + 一句话摘要 + 归属工作区」，
  不注入正文；模型需要细节时用 `memory_read` 按 id 取。摘要由整理记忆 / 入梦生成，
  没有时零成本地从正文首句推导。
- **BM25 关键词检索** —— 支持中文（按二字滑窗切分），对标题 / 标签 / 摘要 / 正文
  分别加权，因此「包管理」也能命中「包管理器」。
- **语义召回（可选）** —— 用你选的模型把检索词改写成同义 / 近义 / 中英文相关词，
  再按权重融合进关键词分数。注意：DSH **不提供 embeddings 接口**，所以这里是
  「模型改写」而非向量检索。未开启或未选模型时只用关键词。
- **整理记忆（可选）** —— 按间隔读取每个工作区的历史会话（含已关闭的会话），
  把值得长期记住的事实提炼成记忆。只允许 `create` / `update`，不删除任何东西。
- **记忆梦境（可选）** —— 按间隔合并、去重、改写已有记忆。只允许 `update` /
  `merge`，模型**无法删除**记忆。
- **Markdown + YAML frontmatter** —— 一条记忆一个文件。可读、可 grep、可入库
  git、可用任意编辑器改，无数据库、无锁定。
- **顶级管理页** —— 左侧栏「记忆管理」与「插件管理」**同级**（走 `main` 槽的
  顶级面板，不是设置页的一个分区）。
- **中英双语** —— UI 文案跟随 DSH 界面语言自动切换。

### 记忆存在哪

解析优先级（命中即止）：

1. 调用方显式给出的工作区路径（工具参数 / HTTP 查询参数）；
2. 最近活跃会话的 `header.cwd`；
3. 兜底 → `<DSH_HOME>/dream-admin/memory`。

命中工作区后，根目录取决于 `store.groupBy`：

| `groupBy` | 根目录 |
|---|---|
| `workspace`（默认） | `<工作区>/memory` |
| `peer` | `<DSH_HOME>/dream-admin/peers/<peer>/memory` |

`DSH_HOME` 默认 `~/.dsh`。设置卡片始终显示当前真正生效的解析路径。

`peer` 由仓库推导：把 `origin` remote 归一化成 `host-owner-repo`（例如
`github-com-leopan0-dreamadmin`）；没有 git remote 时退回目录路径（`dir-<slug>`）。
worktree 会沿 `.git` → `gitdir` → `commondir` 找到主仓库的 config，因此 worktree
与主检出共用同一个 peer。以上都只读 `.git/config`，不启动 git 进程。

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
workspace: "D:\\HarnessPluginProject\\DreamAdmin"
peer: "github-com-leopan0-dreamadmin"
summary: "网关 30s 超时导致登录失败，改到 60s 后不再复现。"
---
网关默认 30s 超时，改到 60s 后不再复现。根因是下游批量查询。
```

`workspace` / `peer` / `summary` 都是可选字段，会在下次写入该条记忆时自动补齐。
你可以随时手工编辑这些文件；插件下次扫描时会重新读取（按 mtime 缓存）。

### 工作原理

```
                  ┌─ 整理记忆（模型）：历史会话 ─► 新记忆
工作区目录 / 仓库 peer ─┤
                  ├─ 召回：标题 + 标签 + 摘要 ──► 系统提示
                  │                          ▲
                  ├─ memory_search（BM25 + 可选模型改写）
                  │        └─ memory_read ────┘（按需取正文）
                  └─ 记忆梦境（模型）：update / merge
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

- **记忆**页签 —— 顶部选工作区；在列表页搜索或新建，点某一条进入详情页。列表项会
  显示归属工作区 / peer 标签与摘要；详情页额外显示工作区与工作区身份，并带
  「返回 / 保存 / 删除」。
- **设置**页签 —— 五张卡片：
  - **存储** —— 分组方式（`workspace` / `peer`）与当前生效路径；
  - **召回** —— 注入开关、条数、字符上限；
  - **语义召回** —— 开关、供应商 / 模型、改写权重；
  - **整理记忆** —— 开关、供应商 / 模型、间隔、各项上限，以及「立即整理」按钮与
    上次结果摘要；
  - **记忆梦境** —— 开关、供应商 / 模型、间隔、最少条数，以及「立即入梦」按钮。

每个设置项改完即存，并在右侧显示状态点：琥珀 = 未保存、强调色脉冲 = 保存中、
绿色 = 已保存、红色 = 保存失败。

### 提供给模型的工具

| 工具 | 参数 | 用途 |
|---|---|---|
| `memory_search` | `query`（必填）、`limit`、`workspace` | BM25 关键词检索；开启语义召回后融入模型改写词。 |
| `memory_read` | `id`（必填）、`workspace` | 读取一条记忆的完整正文与元信息。 |
| `memory_list` | `limit`、`workspace` | 列出记忆（置顶优先，然后按更新时间倒序）。 |
| `memory_forget` | `id`（必填）、`workspace` | 删除一条记忆。不可撤销。 |

没有 `memory_save` 工具：写入记忆由整理记忆闭环、管理页或直接编辑 Markdown 文件完成。

### 模型驱动的三件事

三者共用同一套配置方式：**先打开开关，供应商 / 模型下拉框才会解锁**，选项来自
DSH 实时模型列表（`ctx.llm.listProviders` / `listModels`）。若已开启但尚未选模型，
卡片会给出提示。

| 闭环 | 读取 | 写入 | 手动触发 |
|---|---|---|---|
| **整理记忆** | 各工作区的历史会话 | `create` / `update` | `/记忆`、「立即整理」按钮、`POST /dream-admin/capture` |
| **语义召回** | 你的检索词 | —（只改写检索词） | 每次检索自动 |
| **记忆梦境** | 现有记忆库 | `update` / `merge` | `/入梦`、「立即入梦」按钮、`POST /dream-admin/evolve` |

整理记忆按工作区各自计时，入梦按全局计时；两者都要等间隔到点才会自动执行。手动输入
`/记忆` 或 `/入梦` 不受间隔限制，但仍需先在设置里配置好供应商与模型。

对话框入口只有中文命令 `/记忆` 与 `/入梦`：它们是客户端命令贡献项，直接 POST 本插件的
HTTP 接口，并把结果作为输入框提示显示。不再注册宿主命令，所以 `/` 菜单里只有这两条。
代价：手动触发需要在设置里为对应功能配好 provider/model（不走「当前对话模型」回退），
结果以提示形式显示，而不是宿主的流程节点。

### 配置项

所有配置节都声明为 `volatile`：管理页的修改即时对运行中的插件生效，并持久化到
`<DSH_HOME>/dream-admin/config.json`（重启不丢）。`cordis.patch.yml` 的
`config:` 块写法完全等效，且只提供「初始默认值」。

#### `store` — 记忆存放位置

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `groupBy` | `"workspace"` \| `"peer"` | `"workspace"` | `workspace`：每个工作区目录一份记忆（`<工作区>/memory`）；`peer`：每个仓库身份一份记忆（`<DSH_HOME>/dream-admin/peers/<peer>/memory`），同一仓库的多个 clone / worktree 共用。 |

#### `recall` — 系统提示注入

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `true` | 是否每轮把记忆注入系统提示。 |
| `limit` | number | `5` | 每轮注入的记忆条数上限（0-50）。 |
| `maxChars` | number | `4000` | 注入文本的字符预算，超出即截断。`0` = 不限制。 |

#### `search` — 语义召回

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `semantic` | boolean | `false` | 是否开启检索词改写；只有开启后供应商与模型才可选。 |
| `provider` | string | `""` | 改写使用的 provider 路由，从 DSH 模型列表中选择。 |
| `model` | string | `""` | 该 provider 下的模型 id。 |
| `weight` | number | `0.35` | 改写词分数与原词分数融合时的权重（0 = 只用原词，1 = 只用改写词）。 |
| `maxTokens` | number | `256` | 单次改写调用的最大输出 token 数。 |
| `prompt` | string | 内置 | 改写调用使用的系统提示。 |

#### `capture` — 整理记忆

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `enabled` | boolean | `false` | 是否开启整理记忆循环；只有开启后供应商与模型才可选。 |
| `provider` | string | `""` | provider 路由，从 DSH 模型列表中选择。 |
| `model` | string | `""` | 该 provider 下的模型 id。 |
| `intervalMinutes` | number | `30` | 自动执行的间隔（分钟，1-1440），每个工作区各自计时。 |
| `maxSessions` | number | `20` | 每个工作区单次最多扫描多少个最近的历史会话。 |
| `maxMessages` | number | `200` | 单条会话最多取最近多少条消息。 |
| `maxChars` | number | `24000` | 送进模型的会话转录字符上限。`0` = 不限制。 |
| `maxTokens` | number | `4096` | 单次整理调用的最大输出 token 数。 |
| `prompt` | string | 内置 | 整理调用使用的系统提示。 |

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
| GET | `/dream-admin/health` | 状态 + 解析后的配置 + 当前记忆根目录 + `semanticReady`。 |
| GET | `/dream-admin/config` | 当前配置视图。 |
| POST | `/dream-admin/config` | 合并一份配置覆盖（落盘持久化）。 |
| GET | `/dream-admin/models` | provider / model 目录，供下拉框使用。 |
| GET | `/dream-admin/workspaces` | 已知工作区候选，含推导出的 peer。 |
| GET | `/dream-admin/memories` | 列表 / 检索（`?workspace=&q=&limit=`）。 |
| GET | `/dream-admin/memory` | 读单条（`?id=&workspace=`）。 |
| POST | `/dream-admin/memory` | 新建 / 覆盖（`{id?, workspace?, title, body, tags, pinned}`）。 |
| DELETE | `/dream-admin/memory` | 删除（`?id=&workspace=`）。 |
| POST | `/dream-admin/capture` | 立即执行一次整理记忆。 |
| POST | `/dream-admin/evolve` | 立即执行一次记忆梦境。 |

### 验证

```bash
curl http://localhost:<port>/dream-admin/health
# {"status":"ok","plugin":"dream-admin","root":"...","search":{...},"semanticReady":false,...}
```

### 开发

```bash
pnpm install
pnpm run bundle    # Node 侧 + client 侧 + 类型
pnpm run gates     # 一致性检查
```

### 许可证

MIT。
