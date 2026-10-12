// src/config.ts
import z from "@deepseek-ai/schemastery";
import { mkdirSync as mkdirSync2, readFileSync as readFileSync2, writeFileSync } from "node:fs";
import { dirname, join as join3 } from "node:path";

// src/paths.ts
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join as join2, resolve as resolve2, sep } from "node:path";

// src/peers.ts
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
function resolvePeer(workspace) {
  if (typeof workspace !== "string" || workspace.trim().length === 0) return void 0;
  const abs = resolve(workspace.trim());
  const remote = readGitRemote(abs);
  if (remote !== void 0) {
    const normalized = normalizeRemote(remote);
    if (normalized.length > 0) return normalized;
  }
  return `dir-${slug(abs)}`;
}
function readGitRemote(workspace) {
  try {
    const entry = join(workspace, ".git");
    if (!existsSync(entry)) return void 0;
    const configs = statSync(entry).isDirectory() ? [join(entry, "config")] : worktreeConfigs(entry);
    for (const config of configs) {
      const remote = readRemoteFrom(config);
      if (remote !== void 0) return remote;
    }
    return void 0;
  } catch {
    return void 0;
  }
}
function worktreeConfigs(entry) {
  try {
    const match = readFileSync(entry, "utf8").match(/gitdir:\s*(.+)/);
    if (match === null) return [];
    const gitdir = resolve(match[1].trim());
    const configs = [join(gitdir, "config")];
    const common = join(gitdir, "commondir");
    if (existsSync(common)) {
      const relative = readFileSync(common, "utf8").trim();
      if (relative.length > 0) configs.unshift(join(resolve(gitdir, relative), "config"));
    }
    return configs;
  } catch {
    return [];
  }
}
function readRemoteFrom(config) {
  try {
    let inOrigin = false;
    for (const line of readFileSync(config, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("[")) {
        inOrigin = /^\[remote\s+"origin"\]$/.test(trimmed);
        continue;
      }
      if (!inOrigin) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      if (trimmed.slice(0, eq).trim() === "url") return trimmed.slice(eq + 1).trim();
    }
    return void 0;
  } catch {
    return void 0;
  }
}
function normalizeRemote(remote) {
  let value = remote.trim().toLowerCase();
  value = value.replace(/^[a-z+]+:\/\//, "");
  value = value.replace(/^[^@/]+@/, "");
  value = value.replace(/^www\./, "");
  value = value.replace(/^([^/:]+):\d+\//, "$1/");
  value = value.replace(/^([^/]+):(?!\/)/, "$1/");
  value = value.replace(/\.git$/, "");
  value = value.replace(/\/+$/, "");
  return slug(value);
}
function slug(value) {
  const result = value.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return result.length > 0 ? result : "unknown";
}

// src/paths.ts
function dshHome() {
  const raw = process.env["DSH_HOME"];
  if (typeof raw === "string" && raw.trim().length > 0) return resolve2(raw.trim());
  return join2(homedir(), ".dsh");
}
var MEMORY_DIR_NAME = "memory";
function globalMemoryRoot() {
  return join2(dshHome(), "dream-admin", MEMORY_DIR_NAME);
}
function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
  return dir;
}
function isAbsolutePath(value) {
  return typeof value === "string" && value.trim().length > 0 && isAbsolute(value.trim());
}
function displayName(dir) {
  const parts = dir.split(sep).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? dir;
}
function workspaceMemoryRoot(workspace) {
  return join2(workspace, MEMORY_DIR_NAME);
}
function peerMemoryRoot(peer) {
  return join2(dshHome(), "dream-admin", "peers", peer, MEMORY_DIR_NAME);
}
function listWorkspaces(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const ordered = [...list].sort((a, b) => createdAt(b) - createdAt(a));
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const session of ordered) {
    const cwd = session?.header?.cwd;
    if (!isAbsolutePath(cwd)) continue;
    const path = resolve2(cwd.trim());
    if (seen.has(path)) continue;
    seen.add(path);
    result.push({ path, name: displayName(path), source: "session" });
  }
  return result;
}
function createdAt(session) {
  const value = session?.header?.createdAt;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
var DEFAULT_WORKSPACE_DIR = "default-workspace";
function registryWorkspaces(registry) {
  let list;
  try {
    list = registry.list();
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const item of list) {
    const raw = item ?? {};
    if (!isAbsolutePath(raw.path)) continue;
    const path = resolve2(raw.path.trim());
    if (seen.has(path)) continue;
    seen.add(path);
    const title = typeof raw.title === "string" && raw.title.trim().length > 0 ? raw.title.trim() : displayName(path);
    result.push({ path, name: title, source: "workspace" });
  }
  return result;
}
function isDefaultWorkspace(path) {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
  return (parts[parts.length - 1] ?? "") === DEFAULT_WORKSPACE_DIR;
}
function createRootResolver(deps) {
  const workspaceRoot = (workspace) => {
    if (deps.groupBy() === "peer") {
      const peer = resolvePeer(workspace);
      if (peer !== void 0) return peerMemoryRoot(peer);
    }
    return workspaceMemoryRoot(workspace);
  };
  return (workspace) => {
    if (isAbsolutePath(workspace)) return workspaceRoot(workspace.trim());
    const active = listWorkspaces(deps.sessions())[0];
    if (active !== void 0) return workspaceRoot(active.path);
    return globalMemoryRoot();
  };
}

// src/config.ts
var PLUGIN_NAME = "dream-admin";
var DEFAULT_RECALL_LIMIT = 5;
var DEFAULT_RECALL_MAX_CHARS = 4e3;
var DEFAULT_SEMANTIC_WEIGHT = 0.35;
var DEFAULT_SEMANTIC_MAX_TOKENS = 256;
var DEFAULT_SEMANTIC_PROMPT = [
  "\u4F60\u662F DreamAdmin \u8BB0\u5FC6\u5E93\u7684\u68C0\u7D22\u52A9\u624B\u3002\u8F93\u5165\u662F\u68C0\u7D22\u8BCD\uFF0C\u4F60\u8981\u628A\u5B83\u6269\u5199\u6210\u4E00\u7EC4\u8BED\u4E49\u76F8\u5173\u3001\u53EF\u80FD\u51FA\u73B0\u5728\u957F\u671F\u8BB0\u5FC6\u91CC\u7684\u8BCD\u3002",
  "\u786C\u6027\u89C4\u5219\uFF1A",
  "1. \u53EA\u505A\u6269\u5199\uFF1A\u7ED9\u540C\u4E49\u8BCD\u3001\u8FD1\u4E49\u8BCD\u3001\u5E38\u89C1\u7F29\u5199\uFF0C\u4EE5\u53CA\u5FC5\u8981\u65F6\u7684\u4E2D\u82F1\u6587\u5BF9\u7167\u3002",
  "2. \u4E0D\u8981\u89E3\u91CA\uFF0C\u4E0D\u8981\u8F93\u51FA\u4E0E\u68C0\u7D22\u65E0\u5173\u7684\u8BCD\uFF0C\u4E0D\u8981\u7F16\u9020\u4E8B\u5B9E\u3002",
  "3. \u6700\u591A 8 \u4E2A\u8BCD\uFF0C\u5C3D\u91CF\u77ED\u3002",
  "4. \u53EA\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6587\u5B57\u3001\u4E0D\u8981 Markdown \u4EE3\u7801\u56F4\u680F\uFF1A",
  '{ "terms": ["...", "..."] }',
  '\u65E0\u6CD5\u6269\u5199\u65F6\u8F93\u51FA {"terms":[]}\u3002'
].join("\n");
var DEFAULT_EVOLVE_AT_HOUR = 3;
var DEFAULT_EVOLVE_MIN_MEMORIES = 3;
var DEFAULT_EVOLVE_MAX_TOKENS = 4096;
var DEFAULT_EVOLVE_PROMPT = [
  "\u4F60\u662F DreamAdmin \u8BB0\u5FC6\u5E93\u7684\u6574\u7406\u5F15\u64CE\u3002\u8F93\u5165\u662F\u4E00\u6279\u957F\u671F\u8BB0\u5FC6\u6761\u76EE\uFF08Markdown + \u5143\u6570\u636E\uFF09\u3002",
  "\u4F60\u7684\u4EFB\u52A1\uFF1A\u628A\u91CD\u590D\u3001\u8FC7\u65F6\u3001\u53EF\u4EE5\u5408\u5E76\u7684\u6761\u76EE\u6574\u7406\u6210\u66F4\u7CBE\u70BC\u3001\u66F4\u4E00\u81F4\u7684\u4E00\u7EC4\u8BB0\u5FC6\u3002",
  "",
  "\u786C\u6027\u89C4\u5219\uFF1A",
  "1. \u53EA\u505A\u5408\u5E76\u3001\u53BB\u91CD\u3001\u7EA0\u9519\u3001\u8865\u5168\u8868\u8FF0\uFF1B\u7EDD\u5BF9\u4E0D\u8981\u53D1\u660E\u8F93\u5165\u4E2D\u4E0D\u5B58\u5728\u7684\u4E8B\u5B9E\u3002",
  "2. \u53EF\u4EE5\u6539\u5199\u6807\u9898\u4E0E\u6B63\u6587\uFF0C\u4F46\u5FC5\u987B\u4FDD\u7559\u6240\u6709\u53EF\u9A8C\u8BC1\u7684\u7EC6\u8282\uFF08\u8DEF\u5F84\u3001\u547D\u4EE4\u3001\u6807\u8BC6\u7B26\u3001\u6570\u5B57\u3001\u7528\u6237\u504F\u597D\u4E0E\u7EA0\u6B63\uFF09\u3002",
  "3. \u5DF2\u7ECF\u88AB\u65B0\u8BB0\u5FC6\u53D6\u4EE3\u7684\u65E7\u7ED3\u8BBA\uFF0C\u5408\u5E76\u5230\u6700\u65B0\u6761\u76EE\u91CC\uFF0C\u4E0D\u8981\u4FDD\u7559\u81EA\u76F8\u77DB\u76FE\u7684\u4E24\u4EFD\u3002",
  "4. \u4E0D\u786E\u5B9A\u7684\u6761\u76EE\u539F\u6837\u4FDD\u7559\uFF08\u4E0D\u8F93\u51FA\u5B83\u7684 op\uFF09\u3002",
  "5. \u6BCF\u6761 op \u90FD\u8981\u7ED9\u51FA summary\uFF1A\u4E00\u53E5\u8BDD\uFF08\u4E0D\u8D85\u8FC7 60 \u5B57\uFF09\u6982\u62EC\u8BE5\u6761\u8BB0\u5FC6\u8981\u70B9\uFF0C\u4F9B\u7CFB\u7EDF\u63D0\u793A\u5206\u5C42\u53EC\u56DE\u4F7F\u7528\u3002",
  "",
  "\u53EA\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6587\u5B57\u3001\u4E0D\u8981 Markdown \u4EE3\u7801\u56F4\u680F\uFF1A",
  "{",
  '  "ops": [',
  '    { "op": "update", "id": "<\u5DF2\u5B58\u5728\u7684 id>", "title": "...", "tags": ["..."], "summary": "...", "body": "..." },',
  '    { "op": "merge", "ids": ["<id1>", "<id2>"], "keep": "<id1>", "title": "...", "tags": ["..."], "summary": "...", "body": "..." }',
  "  ]",
  "}",
  "",
  '\u6CA1\u6709\u4EFB\u4F55\u6539\u52A8\u65F6\u8F93\u51FA {"ops":[]}\u3002'
].join("\n");
var DEFAULT_CAPTURE_INTERVAL_MINUTES = 30;
var DEFAULT_CAPTURE_MAX_SESSIONS = 20;
var DEFAULT_CAPTURE_MAX_MESSAGES = 200;
var DEFAULT_CAPTURE_MAX_CHARS = 24e3;
var DEFAULT_CAPTURE_MAX_TOKENS = 4096;
var DEFAULT_CAPTURE_PROMPT = [
  "\u4F60\u662F DreamAdmin \u7684\u8BB0\u5FC6\u6574\u7406\u5F15\u64CE\u3002\u8F93\u5165\u662F\u67D0\u4E2A\u5DE5\u4F5C\u533A\u6700\u8FD1\u7684\u4F1A\u8BDD\u8BB0\u5F55\uFF08\u7528\u6237\u4E0E\u52A9\u624B\u7684\u5BF9\u8BDD\uFF09\uFF0C\u4EE5\u53CA\u8BE5\u5DE5\u4F5C\u533A\u5DF2\u6709\u7684\u957F\u671F\u8BB0\u5FC6\u7D22\u5F15\u3002",
  "\u4F60\u7684\u4EFB\u52A1\uFF1A\u4ECE\u5BF9\u8BDD\u4E2D\u63D0\u70BC\u51FA\u503C\u5F97\u957F\u671F\u8BB0\u4F4F\u7684\u4E8B\u5B9E\u3001\u504F\u597D\u3001\u7EA6\u5B9A\u4E0E\u7ED3\u8BBA\uFF0C\u5199\u6210\u65B0\u7684\u8BB0\u5FC6\u6761\u76EE\uFF0C\u6216\u66F4\u65B0\u5DF2\u6709\u7684\u6761\u76EE\u3002",
  "",
  "\u786C\u6027\u89C4\u5219\uFF1A",
  "1. \u53EA\u8BB0\u5F55\u53EF\u9A8C\u8BC1\u3001\u957F\u671F\u6709\u6548\u7684\u4FE1\u606F\uFF1A\u7528\u6237\u504F\u597D\u3001\u9879\u76EE\u7EA6\u5B9A\u3001\u5173\u952E\u4E8B\u5B9E\u3001\u7ED3\u8BBA\u3001\u7EA0\u9519\uFF0C\u4EE5\u53CA\u8DEF\u5F84 / \u547D\u4EE4 / \u6807\u8BC6\u7B26\u7B49\u7EC6\u8282\u3002",
  "2. \u4E0D\u8981\u8BB0\u5F55\u4E00\u6B21\u6027\u95F2\u804A\u3001\u4E34\u65F6\u72B6\u6001\u3001\u5BD2\u6684\uFF0C\u4E5F\u4E0D\u8981\u8BB0\u5F55\u6A21\u578B\u81EA\u5DF1\u7684\u63A8\u7406\u8FC7\u7A0B\u3002",
  "3. \u82E5\u67D0\u6761\u4FE1\u606F\u5DF2\u88AB\u300C\u5DF2\u6709\u8BB0\u5FC6\u7D22\u5F15\u300D\u91CC\u7684\u6761\u76EE\u8986\u76D6\uFF0C\u7528 update \u5E76\u7ED9\u51FA\u5BF9\u5E94 id\uFF1B\u5426\u5219\u7528 create \u65B0\u5EFA\u3002\u4F18\u5148\u590D\u7528\uFF0C\u907F\u514D\u5236\u9020\u91CD\u590D\u6761\u76EE\u3002",
  "4. \u7EDD\u5BF9\u4E0D\u8981\u53D1\u660E\u5BF9\u8BDD\u4E2D\u4E0D\u5B58\u5728\u7684\u4E8B\u5B9E\u3002",
  "5. \u6BCF\u6761\u8BB0\u5FC6\u8981\u81EA\u6D3D\u3001\u7CBE\u7B80\uFF08\u51E0\u53E5\u8BDD\u5230\u4E00\u5C0F\u6BB5\uFF09\uFF0C\u6807\u9898\u77ED\u800C\u5177\u4F53\uFF0C\u53EF\u5E26\u5C11\u91CF\u6807\u7B7E\u3002",
  "6. \u5FC5\u987B\u5199 summary\uFF1A\u4E00\u53E5\u8BDD\uFF08\u4E0D\u8D85\u8FC7 60 \u5B57\uFF09\u6982\u62EC\u8981\u70B9\uFF0C\u4F9B\u7CFB\u7EDF\u63D0\u793A\u5206\u5C42\u53EC\u56DE\u4F7F\u7528\uFF0C\u4E0D\u8981\u91CD\u590D\u6807\u9898\u3002",
  '7. \u6CA1\u6709\u503C\u5F97\u8BB0\u5F55\u7684\u5185\u5BB9\u65F6\u8F93\u51FA {"ops":[]}\u3002',
  "",
  "\u53EA\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6587\u5B57\u3001\u4E0D\u8981 Markdown \u4EE3\u7801\u56F4\u680F\uFF1A",
  "{",
  '  "ops": [',
  '    { "op": "create", "title": "...", "tags": ["..."], "summary": "...", "body": "..." },',
  '    { "op": "update", "id": "<\u5DF2\u5B58\u5728\u7684 id>", "title": "...", "tags": ["..."], "summary": "...", "body": "..." }',
  "  ]",
  "}"
].join("\n");
var Config = z.object({
  store: z.object({
    groupBy: z.union([z.const("workspace"), z.const("peer")]).default("workspace").description(
      "workspace\uFF1A\u6BCF\u4E2A\u5DE5\u4F5C\u533A\u76EE\u5F55\u5404\u4E00\u4EFD\u8BB0\u5FC6\uFF08<\u5DE5\u4F5C\u533A>/memory\uFF09\uFF1Bpeer\uFF1A\u6309\u4ED3\u5E93\u8EAB\u4EFD\u5206\u7EC4\uFF0C\u540C\u4E00\u4ED3\u5E93\u7684\u591A\u4E2A clone / worktree \u5171\u7528\u4E00\u4EFD\uFF08\u843D\u5728 DSH \u6570\u636E\u76EE\u5F55\u7684 peers/<peer>/ \u4E0B\uFF09\u3002"
    )
  }).default({ groupBy: "workspace" }).volatile(),
  recall: z.object({
    enabled: z.boolean().default(true).description("\u6BCF\u6B21\u5BF9\u8BDD\u662F\u5426\u81EA\u52A8\u5E26\u4E0A\u957F\u671F\u8BB0\u5FC6\uFF08\u6BCF\u4E2A\u6A21\u578B\u8F6E\u6B21\u91CD\u65B0\u88C5\u914D\uFF09\u3002"),
    limit: z.number().step(1).min(0).max(50).default(DEFAULT_RECALL_LIMIT).description("\u6BCF\u6B21\u6700\u591A\u5E26\u4E0A\u51E0\u6761\u8BB0\u5FC6\u3002"),
    maxChars: z.number().step(1).min(0).default(DEFAULT_RECALL_MAX_CHARS).description("\u6BCF\u6B21\u5E26\u4E0A\u7684\u8BB0\u5FC6\u6B63\u6587\u5B57\u7B26\u4E0A\u9650\uFF0C\u8D85\u51FA\u5373\u622A\u65AD\u30020 \u8868\u793A\u4E0D\u9650\u5236\u3002")
  }).default({ enabled: true, limit: DEFAULT_RECALL_LIMIT, maxChars: DEFAULT_RECALL_MAX_CHARS }).volatile(),
  search: z.object({
    semantic: z.boolean().default(false).description(
      "\u5F00\u542F\u8BED\u4E49\u53EC\u56DE\uFF1A\u7528\u6240\u9009\u6A21\u578B\u628A\u68C0\u7D22\u8BCD\u6269\u5199\u6210\u540C\u4E49 / \u8FD1\u4E49 / \u4E2D\u82F1\u6587\u76F8\u5173\u8BCD\uFF0C\u878D\u5408\u8FDB\u5173\u952E\u8BCD\u68C0\u7D22\uFF0C\u8BA9\u300C\u6362\u4E2A\u8BF4\u6CD5\u300D\u4E5F\u80FD\u547D\u4E2D\u3002\u5F00\u542F\u540E\u624D\u80FD\u9009\u62E9\u4F9B\u5E94\u5546\u4E0E\u6A21\u578B\u3002"
    ),
    provider: z.string().default("").description("\u8BED\u4E49\u53EC\u56DE\u6269\u5199\u4F7F\u7528\u7684 provider \u8DEF\u7531\uFF08\u4ECE DSH \u6A21\u578B\u5217\u8868\u4E2D\u9009\u62E9\uFF09\uFF1B\u7559\u7A7A\u65F6\u68C0\u7D22\u53EA\u7528\u5173\u952E\u8BCD\u3002"),
    model: z.string().default("").description("\u8BE5 provider \u4E0B\u7684\u6A21\u578B id\uFF1B\u7559\u7A7A\u65F6\u68C0\u7D22\u53EA\u7528\u5173\u952E\u8BCD\u3002"),
    weight: z.number().step(0.05).min(0).max(1).default(DEFAULT_SEMANTIC_WEIGHT).description("\u6269\u5199\u8BCD\u5206\u6570\u5728\u878D\u5408\u91CC\u7684\u6743\u91CD\uFF1A0 \u53EA\u7528\u539F\u68C0\u7D22\u8BCD\uFF0C1 \u53EA\u7528\u6269\u5199\u8BCD\u3002"),
    maxTokens: z.number().step(1).min(1).default(DEFAULT_SEMANTIC_MAX_TOKENS).description("\u5355\u6B21\u6269\u5199\u8C03\u7528\u7684\u6700\u5927\u8F93\u51FA token \u6570\u3002"),
    prompt: z.string().default(DEFAULT_SEMANTIC_PROMPT).description("\u6269\u5199\u8C03\u7528\u7684\u7CFB\u7EDF\u63D0\u793A\u3002")
  }).default({
    semantic: false,
    provider: "",
    model: "",
    weight: DEFAULT_SEMANTIC_WEIGHT,
    maxTokens: DEFAULT_SEMANTIC_MAX_TOKENS,
    prompt: DEFAULT_SEMANTIC_PROMPT
  }).volatile(),
  evolve: z.object({
    enabled: z.boolean().default(false).description(
      "\u5F00\u542F\u5165\u68A6\uFF1A\u6BCF\u5929\u591C\u91CC\u5230\u70B9\u8C03\u7528\u4F60\u6307\u5B9A\u7684\u6A21\u578B\uFF0C\u81EA\u52A8\u5408\u5E76 / \u53BB\u91CD / \u63D0\u70BC\u5DF2\u6709\u8BB0\u5FC6\u3002\u9519\u8FC7\u65F6\u523B\u4E0D\u8865\u505A\uFF0C\u53EF\u968F\u65F6\u5728\u5BF9\u8BDD\u6846\u8F93\u5165 /\u5165\u68A6 \u7ACB\u5373\u5165\u68A6\u4E00\u6B21\u3002"
    ),
    provider: z.string().default("").description("\u5165\u68A6\u4F7F\u7528\u7684 provider \u8DEF\u7531\uFF08\u4ECE DSH \u6A21\u578B\u5217\u8868\u4E2D\u9009\u62E9\uFF09\uFF1B\u7559\u7A7A\u65F6\u5165\u68A6\uFF08\u542B /\u5165\u68A6\uFF09\u4E0D\u4F1A\u6267\u884C\u3002"),
    model: z.string().default("").description("\u8BE5 provider \u4E0B\u7684\u6A21\u578B id\uFF1B\u7559\u7A7A\u65F6\u5165\u68A6\uFF08\u542B /\u5165\u68A6\uFF09\u4E0D\u4F1A\u6267\u884C\u3002"),
    atHour: z.number().step(1).min(0).max(23).default(DEFAULT_EVOLVE_AT_HOUR).description("\u6BCF\u5929\u591C\u91CC\u81EA\u52A8\u5165\u68A6\u7684\u65F6\u523B\uFF0824 \u5C0F\u65F6\u5236\uFF0C0-23\uFF09\uFF1B\u5230\u70B9\u540E\u89E6\u53D1\u4E00\u904D\uFF0C\u9519\u8FC7\u4E0D\u8865\u3002"),
    minMemories: z.number().step(1).min(1).default(DEFAULT_EVOLVE_MIN_MEMORIES).description("\u8BB0\u5FC6\u6761\u6570\u4F4E\u4E8E\u8BE5\u503C\u65F6\u8DF3\u8FC7\u81EA\u52A8\u5165\u68A6\uFF08\u624B\u52A8\u89E6\u53D1\u4E0D\u53D7\u9650\uFF09\u3002"),
    maxTokens: z.number().step(1).min(1).default(DEFAULT_EVOLVE_MAX_TOKENS).description("\u5355\u6B21\u5165\u68A6\u8C03\u7528\u7684\u6700\u5927\u8F93\u51FA token \u6570\u3002"),
    prompt: z.string().default(DEFAULT_EVOLVE_PROMPT).description("\u5165\u68A6\u8C03\u7528\u7684\u7CFB\u7EDF\u63D0\u793A\u3002")
  }).default({
    enabled: false,
    provider: "",
    model: "",
    atHour: DEFAULT_EVOLVE_AT_HOUR,
    minMemories: DEFAULT_EVOLVE_MIN_MEMORIES,
    maxTokens: DEFAULT_EVOLVE_MAX_TOKENS,
    prompt: DEFAULT_EVOLVE_PROMPT
  }).volatile(),
  capture: z.object({
    enabled: z.boolean().default(false).description(
      "\u5F00\u542F\u6574\u7406\u8BB0\u5FC6\uFF1A\u6309\u95F4\u9694\u8BFB\u53D6\u8BE5\u5DE5\u4F5C\u533A\u7684\u5386\u53F2\u4F1A\u8BDD\uFF08\u542B\u5DF2\u5173\u95ED\u7684\u4F1A\u8BDD\uFF09\uFF0C\u8C03\u7528\u4F60\u6307\u5B9A\u7684\u6A21\u578B\u63D0\u70BC\u51FA\u503C\u5F97\u957F\u671F\u8BB0\u4F4F\u7684\u4E8B\u5B9E\u5E76\u5199\u5165\u8BB0\u5FC6\u5E93\u3002\u4E5F\u53EF\u4EE5\u968F\u65F6\u5728\u5BF9\u8BDD\u6846\u8F93\u5165 /\u8BB0\u5FC6 \u7ACB\u5373\u6574\u7406\u4E00\u6B21\u3002"
    ),
    provider: z.string().default("").description("\u6574\u7406\u8BB0\u5FC6\u4F7F\u7528\u7684 provider \u8DEF\u7531\uFF08\u4ECE DSH \u6A21\u578B\u5217\u8868\u4E2D\u9009\u62E9\uFF09\uFF1B\u7559\u7A7A\u65F6\u6574\u7406\u8BB0\u5FC6\uFF08\u542B /\u8BB0\u5FC6\uFF09\u4E0D\u4F1A\u6267\u884C\u3002"),
    model: z.string().default("").description("\u8BE5 provider \u4E0B\u7684\u6A21\u578B id\uFF1B\u7559\u7A7A\u65F6\u6574\u7406\u8BB0\u5FC6\uFF08\u542B /\u8BB0\u5FC6\uFF09\u4E0D\u4F1A\u6267\u884C\u3002"),
    intervalMinutes: z.number().step(1).min(1).max(1440).default(DEFAULT_CAPTURE_INTERVAL_MINUTES).description("\u81EA\u52A8\u6574\u7406\u8BB0\u5FC6\u7684\u95F4\u9694\uFF08\u5206\u949F\uFF09\uFF0C\u6BCF\u4E2A\u5DE5\u4F5C\u533A\u5404\u81EA\u8BA1\u65F6\u3002"),
    maxSessions: z.number().step(1).min(1).default(DEFAULT_CAPTURE_MAX_SESSIONS).description("\u6BCF\u4E2A\u5DE5\u4F5C\u533A\u5355\u6B21\u6700\u591A\u626B\u63CF\u591A\u5C11\u4E2A\u6700\u8FD1\u7684\u5386\u53F2\u4F1A\u8BDD\u3002"),
    maxMessages: z.number().step(1).min(1).default(DEFAULT_CAPTURE_MAX_MESSAGES).description("\u5355\u6761\u4F1A\u8BDD\u6700\u591A\u53D6\u6700\u8FD1\u591A\u5C11\u6761\u6D88\u606F\u53C2\u4E0E\u6574\u7406\u3002"),
    maxChars: z.number().step(1).min(0).default(DEFAULT_CAPTURE_MAX_CHARS).description("\u5355\u6B21\u6574\u7406\u9001\u8FDB\u6A21\u578B\u7684\u4F1A\u8BDD\u8F6C\u5F55\u5B57\u7B26\u4E0A\u9650\uFF0C\u8D85\u51FA\u5373\u622A\u65AD\u30020 \u8868\u793A\u4E0D\u9650\u5236\u3002"),
    maxTokens: z.number().step(1).min(1).default(DEFAULT_CAPTURE_MAX_TOKENS).description("\u5355\u6B21\u6574\u7406\u8BB0\u5FC6\u8C03\u7528\u7684\u6700\u5927\u8F93\u51FA token \u6570\u3002"),
    prompt: z.string().default(DEFAULT_CAPTURE_PROMPT).description("\u6574\u7406\u8BB0\u5FC6\u8C03\u7528\u7684\u7CFB\u7EDF\u63D0\u793A\u3002")
  }).default({
    enabled: false,
    provider: "",
    model: "",
    intervalMinutes: DEFAULT_CAPTURE_INTERVAL_MINUTES,
    maxSessions: DEFAULT_CAPTURE_MAX_SESSIONS,
    maxMessages: DEFAULT_CAPTURE_MAX_MESSAGES,
    maxChars: DEFAULT_CAPTURE_MAX_CHARS,
    maxTokens: DEFAULT_CAPTURE_MAX_TOKENS,
    prompt: DEFAULT_CAPTURE_PROMPT
  }).volatile()
}).description("DreamAdmin\uFF1A\u968F\u5DE5\u4F5C\u533A\u7BA1\u7406\u7684\u957F\u671F\u8BB0\u5FC6 + \u6574\u7406\u8BB0\u5FC6 / \u5165\u68A6\u3002");
function sectionValue(value) {
  if (typeof value === "object" && value !== null && typeof value.get === "function") {
    return value.get();
  }
  return value;
}
function resolvePluginConfig(config) {
  const store = config?.store ?? {};
  const recall = config?.recall ?? {};
  const search = config?.search ?? {};
  const evolve = config?.evolve ?? {};
  const capture = config?.capture ?? {};
  const groupBy = store.groupBy === "peer" ? "peer" : "workspace";
  const limit = clampInt(recall.limit ?? DEFAULT_RECALL_LIMIT, 0, 50);
  const maxChars = clampInt(recall.maxChars ?? DEFAULT_RECALL_MAX_CHARS, 0, Number.MAX_SAFE_INTEGER);
  const searchProvider = typeof search.provider === "string" ? search.provider : "";
  const searchModel = typeof search.model === "string" ? search.model : "";
  const semanticWeight = clampUnit(search.weight ?? DEFAULT_SEMANTIC_WEIGHT);
  const semanticPrompt = typeof search.prompt === "string" && search.prompt.trim().length > 0 ? search.prompt : DEFAULT_SEMANTIC_PROMPT;
  const provider = typeof evolve.provider === "string" ? evolve.provider : "";
  const model = typeof evolve.model === "string" ? evolve.model : "";
  const prompt = typeof evolve.prompt === "string" && evolve.prompt.trim().length > 0 ? evolve.prompt : DEFAULT_EVOLVE_PROMPT;
  const captureProvider = typeof capture.provider === "string" ? capture.provider : "";
  const captureModel = typeof capture.model === "string" ? capture.model : "";
  const capturePrompt = typeof capture.prompt === "string" && capture.prompt.trim().length > 0 ? capture.prompt : DEFAULT_CAPTURE_PROMPT;
  return {
    store: { groupBy },
    recall: { enabled: recall.enabled ?? true, limit, maxChars },
    search: {
      semantic: search.semantic ?? false,
      provider: searchProvider,
      model: searchModel,
      weight: semanticWeight,
      maxTokens: clampInt(search.maxTokens ?? DEFAULT_SEMANTIC_MAX_TOKENS, 1, Number.MAX_SAFE_INTEGER),
      prompt: semanticPrompt
    },
    evolve: {
      enabled: evolve.enabled ?? false,
      provider,
      model,
      atHour: clampInt(evolve.atHour ?? DEFAULT_EVOLVE_AT_HOUR, 0, 23),
      minMemories: clampInt(evolve.minMemories ?? DEFAULT_EVOLVE_MIN_MEMORIES, 1, Number.MAX_SAFE_INTEGER),
      maxTokens: clampInt(evolve.maxTokens ?? DEFAULT_EVOLVE_MAX_TOKENS, 1, Number.MAX_SAFE_INTEGER),
      prompt
    },
    capture: {
      enabled: capture.enabled ?? false,
      provider: captureProvider,
      model: captureModel,
      intervalMinutes: clampInt(capture.intervalMinutes ?? DEFAULT_CAPTURE_INTERVAL_MINUTES, 1, 1440),
      maxSessions: clampInt(capture.maxSessions ?? DEFAULT_CAPTURE_MAX_SESSIONS, 1, Number.MAX_SAFE_INTEGER),
      maxMessages: clampInt(capture.maxMessages ?? DEFAULT_CAPTURE_MAX_MESSAGES, 1, Number.MAX_SAFE_INTEGER),
      maxChars: clampInt(capture.maxChars ?? DEFAULT_CAPTURE_MAX_CHARS, 0, Number.MAX_SAFE_INTEGER),
      maxTokens: clampInt(capture.maxTokens ?? DEFAULT_CAPTURE_MAX_TOKENS, 1, Number.MAX_SAFE_INTEGER),
      prompt: capturePrompt
    }
  };
}
function clampInt(value, min, max) {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(max, Math.max(min, n));
}
function clampUnit(value) {
  const n = Number.isFinite(value) ? value : 0;
  return Math.min(1, Math.max(0, n));
}
function storedConfigPath() {
  return join3(dshHome(), PLUGIN_NAME, "config.json");
}
function loadStoredConfig() {
  const file = storedConfigPath();
  try {
    const raw = readFileSync2(file, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return void 0;
    return parsed;
  } catch {
    return void 0;
  }
}
function saveStoredConfig(value) {
  const file = storedConfigPath();
  try {
    mkdirSync2(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
  } catch {
  }
}
function mergeConfig(base, patch) {
  return {
    store: { ...base.store, ...patch.store },
    recall: { ...base.recall, ...patch.recall },
    search: { ...base.search, ...patch.search },
    evolve: { ...base.evolve, ...patch.evolve },
    capture: { ...base.capture, ...patch.capture }
  };
}

// src/llm.ts
async function collectStreamText(chunks) {
  let text = "";
  for await (const raw of chunks) {
    const chunk = raw;
    if (chunk.type === "text-delta" && typeof chunk.text === "string") text += chunk.text;
  }
  return text;
}
function extractJson(text) {
  const withoutFence = text.replace(/```[a-zA-Z]*\n?/g, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) return void 0;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return void 0;
  }
}
function toStringArray(value) {
  if (!Array.isArray(value)) return void 0;
  return value.filter((item) => typeof item === "string");
}

// src/store.ts
import { existsSync as existsSync2, readFileSync as readFileSync3, readdirSync, statSync as statSync2, unlinkSync, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join4 } from "node:path";
var ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
var PREVIEW_CHARS = 160;
var SUMMARY_CHARS = 160;
var MAX_SEARCH_BODY_CHARS = 8e3;
var cache = /* @__PURE__ */ new Map();
function isValidId(id) {
  return typeof id === "string" && ID_PATTERN.test(id);
}
function generateId(title) {
  const slug2 = (title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const stamp = Date.now().toString(36);
  return `${slug2.length > 0 ? slug2 : "memory"}-${stamp}`;
}
function listMemories(root) {
  if (!existsSync2(root)) return [];
  let names;
  try {
    names = readdirSync(root).filter((name2) => name2.endsWith(".md"));
  } catch {
    return [];
  }
  const result = [];
  for (const name2 of names) {
    const record = readMemoryFile(join4(root, name2));
    if (record === void 0) continue;
    result.push(toSummary(record));
  }
  result.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updated.localeCompare(a.updated);
  });
  return result;
}
function readMemory(root, id) {
  if (!isValidId(id)) return void 0;
  return readMemoryFile(join4(root, `${id}.md`));
}
function writeMemory(root, input) {
  ensureDir(root);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = isValidId(input.id) ? input.id : generateId(input.title);
  const file = join4(root, `${id}.md`);
  const existing = readMemoryFile(file);
  const body = typeof input.body === "string" ? input.body : existing?.body ?? "";
  const record = {
    id,
    title: normalizeTitle(input.title, existing),
    tags: normalizeTags(input.tags, existing),
    created: existing?.created ?? now,
    updated: now,
    source: input.source ?? existing?.source ?? "manual",
    pinned: input.pinned ?? existing?.pinned ?? false,
    body,
    summary: normalizeSummary(input.summary, existing, body),
    workspace: normalizeWorkspace(input.workspace, existing),
    peer: normalizePeer(input.peer, existing),
    file
  };
  writeFileSync2(file, serializeDocument(record), "utf8");
  cache.set(file, { mtimeMs: mtimeOf(file), record });
  return record;
}
function deleteMemory(root, id) {
  if (!isValidId(id)) return false;
  const file = join4(root, `${id}.md`);
  cache.delete(file);
  if (!existsSync2(file)) return false;
  try {
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}
function scoreMemories(root, query) {
  const queryTokens = unique(tokenize(query));
  const scores = /* @__PURE__ */ new Map();
  if (queryTokens.length === 0) return scores;
  const docs = [];
  for (const summary of listMemories(root)) {
    const record = readMemoryFile(summary.file);
    if (record === void 0) continue;
    const fields = [
      tokenize(record.title),
      tokenize(record.tags.join(" ")),
      tokenize(record.summary),
      tokenize(record.body.slice(0, MAX_SEARCH_BODY_CHARS))
    ];
    docs.push({ id: record.id, fields, length: fields.reduce((sum, field) => sum + field.length, 0) });
  }
  if (docs.length === 0) return scores;
  const weights = [4, 3, 2, 1];
  const avgLength = docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length || 1;
  const documentFreq = /* @__PURE__ */ new Map();
  for (const doc of docs) {
    const seen = /* @__PURE__ */ new Set();
    for (const field of doc.fields) {
      for (const token of field) {
        if (seen.has(token)) continue;
        seen.add(token);
        documentFreq.set(token, (documentFreq.get(token) ?? 0) + 1);
      }
    }
  }
  const k1 = 1.2;
  const b = 0.75;
  for (const doc of docs) {
    let score = 0;
    for (const token of queryTokens) {
      const freq = documentFreq.get(token) ?? 0;
      if (freq === 0) continue;
      let weighted = 0;
      for (let index = 0; index < doc.fields.length; index += 1) {
        const tf = countOccurrences(doc.fields[index], token);
        if (tf > 0) weighted += weights[index] * tf;
      }
      if (weighted === 0) continue;
      const idf = Math.log(1 + (docs.length - freq + 0.5) / (freq + 0.5));
      const norm = 1 - b + b * (doc.length / avgLength);
      score += idf * (weighted * (k1 + 1) / (weighted + k1 * norm));
    }
    if (score > 0) scores.set(doc.id, score);
  }
  return scores;
}
function tokenize(text) {
  const lower = text.toLowerCase();
  const tokens = [];
  for (const word of lower.match(/[a-z0-9][a-z0-9_.#+-]*/g) ?? []) {
    tokens.push(word);
    for (const part of word.split(/[._#+-]+/)) {
      if (part.length > 1 && part !== word) tokens.push(part);
    }
  }
  for (const run of lower.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/g) ?? []) {
    if (run.length === 1) {
      tokens.push(run);
      continue;
    }
    for (let index = 0; index + 1 < run.length; index += 1) tokens.push(run.slice(index, index + 2));
  }
  return tokens;
}
function countOccurrences(tokens, target) {
  let count = 0;
  for (const token of tokens) if (token === target) count += 1;
  return count;
}
function unique(tokens) {
  return [...new Set(tokens)];
}
function renderRecall(records, maxChars) {
  if (records.length === 0) return "";
  const lines = [
    "## \u957F\u671F\u8BB0\u5FC6\uFF08DreamAdmin\uFF09",
    "",
    "\u4EE5\u4E0B\u6761\u76EE\u6765\u81EA\u957F\u671F\u8BB0\u5FC6\u5E93\uFF0C\u662F\u6B64\u524D\u4F1A\u8BDD\u6C89\u6DC0\u4E0B\u6765\u7684\u4E8B\u5B9E\u4E0E\u504F\u597D\uFF0C\u4F18\u5148\u4E8E\u4F60\u7684\u5148\u9A8C\u5047\u8BBE\u3002",
    "\u8FD9\u91CC\u53EA\u7ED9\u6458\u8981\uFF1B\u9700\u8981\u6B63\u6587\u65F6\u7528 `memory_read` \u6309 id \u8BFB\u53D6\uFF0C\u6216\u5148 `memory_search` \u68C0\u7D22\u3002",
    ""
  ];
  for (const record of records) {
    const flags = record.pinned ? " [\u7F6E\u9876]" : "";
    const tags = record.tags.length > 0 ? `\uFF08${record.tags.join(", ")}\uFF09` : "";
    lines.push(`- **${record.title}**${tags}${flags} \u2014 id: \`${record.id}\`${scopeSuffix(record)}`);
    const summary = record.summary.trim() || deriveSummary(record.body);
    if (summary.length > 0) lines.push(indent(summary));
    lines.push("");
  }
  return truncate(lines.join("\n"), maxChars);
}
function scopeSuffix(record) {
  if (record.workspace !== void 0 && record.workspace.length > 0) {
    return ` \u2014 \u5DE5\u4F5C\u533A: ${lastSegment(record.workspace)}`;
  }
  if (record.peer !== void 0 && record.peer.length > 0) return ` \u2014 \u5DE5\u4F5C\u533A: ${record.peer}`;
  return "";
}
function lastSegment(value) {
  const parts = value.split(/[\\/]/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? value;
}
function toSummary(record) {
  return {
    id: record.id,
    title: record.title,
    tags: record.tags,
    created: record.created,
    updated: record.updated,
    source: record.source,
    pinned: record.pinned,
    preview: truncate(record.body.replace(/\s+/g, " ").trim(), PREVIEW_CHARS),
    summary: record.summary,
    file: record.file,
    workspace: record.workspace,
    peer: record.peer
  };
}
function readMemoryFile(file) {
  if (!existsSync2(file)) {
    cache.delete(file);
    return void 0;
  }
  let mtimeMs;
  try {
    mtimeMs = mtimeOf(file);
  } catch {
    return void 0;
  }
  const hit = cache.get(file);
  if (hit !== void 0 && hit.mtimeMs === mtimeMs) return hit.record;
  let raw;
  try {
    raw = readFileSync3(file, "utf8");
  } catch {
    return void 0;
  }
  const { meta, body } = parseDocument(raw);
  const id = isValidId(meta.id) ? meta.id : null;
  if (id === null) return void 0;
  const record = {
    id,
    title: stringValue(meta.title) ?? id,
    tags: arrayValue(meta.tags),
    created: stringValue(meta.created) ?? "",
    updated: stringValue(meta.updated) ?? "",
    source: sourceValue(meta.source),
    pinned: meta.pinned === true,
    body,
    summary: stringValue(meta.summary) ?? deriveSummary(body),
    file,
    workspace: stringValue(meta.workspace),
    peer: stringValue(meta.peer)
  };
  cache.set(file, { mtimeMs, record });
  return record;
}
function mtimeOf(file) {
  return statSync2(file).mtimeMs;
}
function normalizeTitle(title, existing) {
  if (typeof title === "string" && title.trim().length > 0) return title.trim();
  if (existing !== void 0) return existing.title;
  return "\u672A\u547D\u540D\u8BB0\u5FC6";
}
function normalizeTags(tags, existing) {
  if (!Array.isArray(tags)) return existing?.tags ?? [];
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const value = tag.trim();
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
function normalizeWorkspace(workspace, existing) {
  if (typeof workspace === "string" && workspace.trim().length > 0) return workspace.trim();
  return existing?.workspace;
}
function normalizePeer(peer, existing) {
  if (typeof peer === "string" && peer.trim().length > 0) return peer.trim();
  return existing?.peer;
}
function normalizeSummary(summary, existing, body) {
  if (typeof summary === "string" && summary.trim().length > 0) {
    return truncate(summary.replace(/\s+/g, " ").trim(), SUMMARY_CHARS);
  }
  if (existing !== void 0 && existing.body === body && existing.summary.length > 0) return existing.summary;
  const derived = deriveSummary(body);
  return derived.length > 0 ? derived : existing?.summary ?? "";
}
function deriveSummary(body, maxChars = SUMMARY_CHARS) {
  const text = body.replace(/```[\s\S]*?```/g, " ").split(/\r?\n/).map((line) => line.replace(/^\s*(?:[#>*+-]|\d+\.)\s*/, "").trim()).filter((line) => line.length > 0).join(" ").replace(/\s+/g, " ").trim();
  if (text.length === 0) return "";
  const sentence = text.match(/^[\s\S]*?[。！？!?；;.]/)?.[0] ?? text;
  return truncate(sentence.trim(), maxChars);
}
function sourceValue(value) {
  return value === "tool" || value === "auto" || value === "evolve" || value === "import" ? value : "manual";
}
function stringValue(value) {
  return typeof value === "string" ? value : void 0;
}
function arrayValue(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
function parseDocument(raw) {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return { meta: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end < 0) return { meta: {}, body: text };
  const head = text.slice(3, end);
  let cursor = end + 4;
  if (text[cursor] === "\r") cursor += 1;
  if (text[cursor] === "\n") cursor += 1;
  return { meta: parseMeta(head), body: text.slice(cursor) };
}
function parseMeta(head) {
  const meta = {};
  for (const line of head.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const rawValue = trimmed.slice(colon + 1).trim();
    if (key.length === 0) continue;
    meta[key] = parseValue(rawValue);
  }
  return meta;
}
function parseValue(raw) {
  if (raw.startsWith("[") && raw.endsWith("]")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === "string");
    } catch {
    }
    return raw.slice(1, -1).split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw.startsWith('"')) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed;
    } catch {
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}
function serializeDocument(record) {
  const meta = [
    `id: ${JSON.stringify(record.id)}`,
    `title: ${JSON.stringify(record.title)}`,
    `tags: [${record.tags.map((tag) => JSON.stringify(tag)).join(", ")}]`,
    `created: ${JSON.stringify(record.created)}`,
    `updated: ${JSON.stringify(record.updated)}`,
    `source: ${JSON.stringify(record.source)}`,
    `pinned: ${record.pinned ? "true" : "false"}`,
    ...record.workspace === void 0 ? [] : [`workspace: ${JSON.stringify(record.workspace)}`],
    ...record.peer === void 0 ? [] : [`peer: ${JSON.stringify(record.peer)}`],
    ...record.summary.length === 0 ? [] : [`summary: ${JSON.stringify(record.summary)}`]
  ].join("\n");
  const body = record.body.endsWith("\n") ? record.body : record.body + "\n";
  return `---
${meta}
---
${body}`;
}
function truncate(text, maxChars) {
  if (maxChars <= 0) return text;
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + "\u2026";
}
function indent(text) {
  return text.split("\n").map((line) => line.length > 0 ? `  ${line}` : line).join("\n");
}

// src/capture.ts
var MAX_OPS = 100;
var MAX_MESSAGE_CHARS = 1500;
var MAX_INDEX_MEMORIES = 120;
var MAX_INDEX_SUMMARY_CHARS = 160;
function skipped(reason, log, route) {
  return { ok: false, reason, workspaces: 0, sessions: 0, created: 0, updated: 0, log, route };
}
function createCapturer(ctx, deps) {
  let running = false;
  let timer;
  const lastRunAt = /* @__PURE__ */ new Map();
  const watermarks = /* @__PURE__ */ new Map();
  const run = async (manual, options = {}, signal) => {
    const cfg = deps.resolved().capture;
    if (running) return skipped("busy", "\u4E0A\u4E00\u6B21\u6574\u7406\u8BB0\u5FC6\u8FD8\u6CA1\u7ED3\u675F\uFF0C\u8DF3\u8FC7\u672C\u6B21\u3002");
    if (!manual && !cfg.enabled) return skipped("disabled", "\u6574\u7406\u8BB0\u5FC6\u672A\u5F00\u542F\u3002");
    const configured = cfg.provider.length > 0 && cfg.model.length > 0;
    const route = configured ? { provider: cfg.provider, model: cfg.model } : options.fallbackRoute ?? { provider: "", model: "" };
    if (route.provider.length === 0 || route.model.length === 0) {
      return skipped("model_not_configured", "\u672A\u914D\u7F6E provider / model\uFF0C\u6574\u7406\u8BB0\u5FC6\u672A\u6267\u884C\u3002");
    }
    if (!deps.sessionReader.available()) {
      return skipped("no_sessions", "\u4F1A\u8BDD\u5386\u53F2\u670D\u52A1\uFF08sessionQuery\uFF09\u4E0D\u53EF\u7528\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u5386\u53F2\u4F1A\u8BDD\u3002");
    }
    const workspaces = manual && options.workspace !== void 0 ? [options.workspace] : listWorkspaces(deps.sessions()).map((entry) => entry.path);
    if (workspaces.length === 0) return skipped("no_workspaces", "\u6CA1\u6709\u5DF2\u77E5\u5DE5\u4F5C\u533A\uFF0C\u65E0\u6CD5\u6574\u7406\u8BB0\u5FC6\u3002", route);
    const report = options.onProgress;
    running = true;
    let created = 0;
    let updated = 0;
    let sessions = 0;
    let failures = 0;
    const notes = [];
    try {
      report?.({ phase: "prepare", completed: 0, total: workspaces.length });
      for (let index = 0; index < workspaces.length; index += 1) {
        const workspace = workspaces[index];
        if (signal?.aborted) break;
        if (!manual) {
          const prev = lastRunAt.get(workspace);
          if (prev === void 0) {
            lastRunAt.set(workspace, Date.now());
            continue;
          }
          if (Date.now() - prev < cfg.intervalMinutes * 6e4) continue;
        }
        report?.({ phase: "scan", completed: index, total: workspaces.length, workspace });
        const state = watermarks.get(workspace) ?? /* @__PURE__ */ new Map();
        let scan;
        try {
          scan = await deps.sessionReader.read(
            workspace,
            { maxSessions: cfg.maxSessions, maxMessages: cfg.maxMessages, since: state },
            signal
          );
        } catch (error) {
          failures += 1;
          notes.push(`${workspace}\uFF1A\u8BFB\u53D6\u5386\u53F2\u4F1A\u8BDD\u5931\u8D25\uFF08${describe(error)}\uFF09`);
          continue;
        }
        if (scan.digests.length === 0) {
          lastRunAt.set(workspace, Date.now());
          continue;
        }
        const root = deps.resolveRoot(workspace);
        const userText = [
          buildMemoryIndex(root),
          "",
          "## \u4F1A\u8BDD\u8BB0\u5F55",
          "",
          buildTranscript(scan.digests, cfg.maxChars)
        ].join("\n");
        report?.({ phase: "model", completed: index, total: workspaces.length, workspace });
        let text = "";
        try {
          text = await collectStreamText(
            ctx.llm.stream({
              provider: route.provider,
              model: route.model,
              system: cfg.prompt,
              messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
              maxTokens: cfg.maxTokens,
              ...signal === void 0 ? {} : { signal }
            })
          );
        } catch (error) {
          failures += 1;
          notes.push(`${workspace}\uFF1A\u6A21\u578B\u8C03\u7528\u5931\u8D25\uFF08${describe(error)}\uFF09`);
          continue;
        }
        const parsed = extractJson(text);
        const ops = parsed === void 0 ? void 0 : parsed.ops;
        if (!Array.isArray(ops)) {
          failures += 1;
          notes.push(`${workspace}\uFF1A\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u53EF\u89E3\u6790\u7684 ops JSON\uFF0C\u672C\u6B21\u672A\u6539\u52A8\u3002\u539F\u59CB\u8F93\u51FA\u524D 400 \u5B57\uFF1A
${text.slice(0, 400)}`);
          continue;
        }
        report?.({ phase: "apply", completed: index, total: workspaces.length, workspace });
        const applied = applyOps(root, workspace, resolvePeer(workspace), ops);
        created += applied.created;
        updated += applied.updated;
        sessions += scan.digests.length;
        notes.push(
          `${workspace}\uFF1A\u6574\u7406 ${scan.digests.length} \u4E2A\u4F1A\u8BDD\uFF0C\u65B0\u589E ${applied.created} \u6761\uFF0C\u66F4\u65B0 ${applied.updated} \u6761`
        );
        watermarks.set(workspace, new Map([...state, ...scan.watermarks]));
        lastRunAt.set(workspace, Date.now());
      }
      report?.({ phase: "apply", completed: workspaces.length, total: workspaces.length });
      const log = notes.length === 0 ? "\u6CA1\u6709\u9700\u8981\u6574\u7406\u7684\u65B0\u5185\u5BB9\u3002" : notes.join("\n");
      if (signal?.aborted) {
        ctx.logger.info(`dream-admin: \u6574\u7406\u8BB0\u5FC6\u5DF2\u53D6\u6D88 \u2014 ${log}`);
        return {
          ok: false,
          reason: "cancelled",
          workspaces: workspaces.length,
          sessions,
          created,
          updated,
          route,
          log
        };
      }
      if (failures === 0) {
        ctx.logger.info(`dream-admin: \u6574\u7406\u8BB0\u5FC6\u5B8C\u6210 \u2014 ${log}`);
      } else {
        ctx.logger.warn(`dream-admin: \u6574\u7406\u8BB0\u5FC6\u90E8\u5206\u5931\u8D25 \u2014 ${log}`);
      }
      return {
        ok: failures === 0,
        ...failures === 0 ? {} : { reason: "llm_error" },
        workspaces: workspaces.length,
        sessions,
        created,
        updated,
        route,
        log
      };
    } finally {
      running = false;
    }
  };
  timer = setInterval(() => {
    const cfg = deps.resolved().capture;
    if (!cfg.enabled) return;
    const now = Date.now();
    const workspaces = listWorkspaces(deps.sessions()).map((entry) => entry.path);
    let due = false;
    for (const workspace of workspaces) {
      const prev = lastRunAt.get(workspace);
      if (prev === void 0) {
        lastRunAt.set(workspace, now);
        continue;
      }
      if (now - prev >= cfg.intervalMinutes * 6e4) due = true;
    }
    if (due) void run(false);
  }, 6e4);
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    timer.unref();
  }
  return {
    run,
    dispose() {
      if (timer !== void 0) clearInterval(timer);
      timer = void 0;
    }
  };
}
function buildMemoryIndex(root) {
  const summaries = listMemories(root).slice(0, MAX_INDEX_MEMORIES);
  if (summaries.length === 0) return "## \u5DF2\u6709\u8BB0\u5FC6\u7D22\u5F15\n\n\uFF08\u5F53\u524D\u5DE5\u4F5C\u533A\u8FD8\u6CA1\u6709\u8BB0\u5FC6\uFF09";
  const lines = summaries.map((entry) => {
    const tags = entry.tags.length > 0 ? `\uFF08${entry.tags.join(", ")}\uFF09` : "";
    const summary = entry.summary.slice(0, MAX_INDEX_SUMMARY_CHARS);
    return `- ${entry.id} \u2014 ${entry.title}${tags}\uFF1A${summary}`;
  });
  return `## \u5DF2\u6709\u8BB0\u5FC6\u7D22\u5F15

${lines.join("\n")}`;
}
function buildTranscript(digests, maxChars) {
  const budget = maxChars > 0 ? maxChars : Number.MAX_SAFE_INTEGER;
  const blocks = [];
  let used = 0;
  for (const digest of digests) {
    const header = `### \u4F1A\u8BDD ${digest.id}\uFF08${new Date(digest.createdAt).toISOString()}\uFF09`;
    const body = digest.messages.map((message2) => `${message2.role === "user" ? "\u7528\u6237" : "\u52A9\u624B"}\uFF1A${truncate(message2.text, MAX_MESSAGE_CHARS)}`).join("\n");
    const block = `${header}
${body}`;
    if (used > 0 && used + block.length > budget) break;
    blocks.push(block);
    used += block.length;
  }
  return blocks.join("\n\n---\n\n");
}
function applyOps(root, workspace, peer, ops) {
  let created = 0;
  let updated = 0;
  for (const raw of ops.slice(0, MAX_OPS)) {
    const op = raw;
    const body = typeof op.body === "string" ? op.body.trim() : "";
    if (body.length === 0) continue;
    const title = typeof op.title === "string" ? op.title : void 0;
    const tags = toStringArray(op.tags);
    const summary = typeof op.summary === "string" ? op.summary : void 0;
    if (op.op === "update") {
      const id = typeof op.id === "string" ? op.id : "";
      if (readMemory(root, id) === void 0) continue;
      writeMemory(root, { id, title, tags, summary, body, source: "auto" });
      updated += 1;
      continue;
    }
    if (op.op === "create") {
      writeMemory(root, { title, tags, summary, body, source: "auto", workspace, peer });
      created += 1;
    }
  }
  return { created, updated };
}
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/evolve.ts
import { existsSync as existsSync3, readFileSync as readFileSync4, writeFileSync as writeFileSync3 } from "node:fs";
import { join as join5 } from "node:path";
var MAX_INPUT_MEMORIES = 60;
var MAX_INPUT_BODY_CHARS = 2e3;
var MAX_OPS2 = 50;
var DREAM_LOG_NAME = "dreams.jsonl";
var MAX_DREAM_RECORDS = 200;
function skipped2(reason, log, scanned = 0, route) {
  return { ok: false, reason, scanned, updated: 0, merged: 0, log, route };
}
var EVOLVE_TRIGGER_WINDOW_MS = 12e4;
function dayKey(date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
function createEvolver(ctx, deps) {
  let running = false;
  let timer;
  let lastDreamDay = "";
  const run = async (manual, options = {}, signal) => {
    const cfg = deps.resolved().evolve;
    if (running) return skipped2("busy", "\u4E0A\u4E00\u6B21\u8BB0\u5FC6\u68A6\u5883\u8FD8\u6CA1\u7ED3\u675F\uFF0C\u8DF3\u8FC7\u672C\u6B21\u3002");
    if (!manual && !cfg.enabled) return skipped2("disabled", "\u8BB0\u5FC6\u68A6\u5883\u672A\u5F00\u542F\u3002");
    const configured = cfg.provider.length > 0 && cfg.model.length > 0;
    const route = configured ? { provider: cfg.provider, model: cfg.model } : options.fallbackRoute ?? { provider: "", model: "" };
    if (route.provider.length === 0 || route.model.length === 0) {
      return skipped2("model_not_configured", "\u672A\u914D\u7F6E provider / model\uFF0C\u8BB0\u5FC6\u68A6\u5883\u672A\u6267\u884C\u3002");
    }
    const workspaces = manual && options.workspace !== void 0 ? [options.workspace] : listWorkspaces(deps.sessions()).map((entry) => entry.path);
    if (workspaces.length === 0) {
      return skipped2("too_few_memories", "\u6CA1\u6709\u5DF2\u77E5\u5DE5\u4F5C\u533A\uFF0C\u8BB0\u5FC6\u68A6\u5883\u672A\u6267\u884C\u3002", 0, route);
    }
    const report = options.onProgress;
    running = true;
    let scanned = 0;
    let updated = 0;
    let merged = 0;
    let dreamed = 0;
    let failures = 0;
    const notes = [];
    const routeInfo = {
      ...route.provider.length > 0 ? { provider: route.provider } : {},
      ...route.model.length > 0 ? { model: route.model } : {}
    };
    try {
      report?.({ phase: "prepare", completed: 0, total: workspaces.length });
      for (let index = 0; index < workspaces.length; index += 1) {
        const workspace = workspaces[index];
        if (signal?.aborted) break;
        report?.({ phase: "scan", completed: index, total: workspaces.length, workspace });
        const root = deps.resolveRoot(workspace);
        const summaries = listMemories(root);
        if (!manual && summaries.length < cfg.minMemories) {
          notes.push(
            `${workspace}\uFF1A\u8BB0\u5FC6\u6761\u6570 ${summaries.length} \u5C11\u4E8E\u9608\u503C ${cfg.minMemories}\uFF0C\u8DF3\u8FC7\u8BB0\u5FC6\u68A6\u5883\u3002`
          );
          continue;
        }
        if (summaries.length === 0) {
          continue;
        }
        const records = [];
        for (const summary of summaries.slice(0, MAX_INPUT_MEMORIES)) {
          const record = readMemory(root, summary.id);
          if (record !== void 0) records.push(record);
        }
        const payload = records.map((record) => {
          const tags = record.tags.length > 0 ? `tags: ${record.tags.join(", ")}
` : "";
          const body = record.body.length > MAX_INPUT_BODY_CHARS ? record.body.slice(0, MAX_INPUT_BODY_CHARS) + "\n\u2026\uFF08\u5DF2\u622A\u65AD\uFF09" : record.body;
          const pinned = record.pinned ? "pinned: true\n" : "";
          return `### id: ${record.id}
\u6807\u9898: ${record.title}
${tags}${pinned}\u6B63\u6587:
${body}`;
        }).join("\n\n---\n\n");
        report?.({ phase: "model", completed: index, total: workspaces.length, workspace });
        let text = "";
        try {
          text = await collectStreamText(
            ctx.llm.stream({
              provider: route.provider,
              model: route.model,
              system: cfg.prompt,
              messages: [{ role: "user", content: [{ type: "text", text: payload }] }],
              maxTokens: cfg.maxTokens,
              ...signal === void 0 ? {} : { signal }
            })
          );
        } catch (error) {
          failures += 1;
          const message2 = describe2(error);
          notes.push(`${workspace}\uFF1A\u8BB0\u5FC6\u68A6\u5883\u8C03\u7528\u5931\u8D25\uFF08${message2}\uFF09`);
          appendDreamRecord(root, {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            workspace,
            ok: false,
            reason: "llm_error",
            scanned: records.length,
            updated: 0,
            merged: 0,
            log: `\u8BB0\u5FC6\u68A6\u5883\u8C03\u7528\u5931\u8D25\uFF1A${message2}`,
            ...routeInfo
          });
          continue;
        }
        const parsed = extractJson(text);
        const ops = parsed === void 0 ? void 0 : parsed.ops;
        if (!Array.isArray(ops)) {
          failures += 1;
          notes.push(
            `${workspace}\uFF1A\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u53EF\u89E3\u6790\u7684 ops JSON\uFF0C\u672C\u6B21\u672A\u6539\u52A8\u3002\u539F\u59CB\u8F93\u51FA\u524D 400 \u5B57\uFF1A
${text.slice(0, 400)}`
          );
          appendDreamRecord(root, {
            at: (/* @__PURE__ */ new Date()).toISOString(),
            workspace,
            ok: false,
            reason: "unparsable",
            scanned: records.length,
            updated: 0,
            merged: 0,
            log: `\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u53EF\u89E3\u6790\u7684 ops JSON\u3002\u539F\u59CB\u8F93\u51FA\u524D 400 \u5B57\uFF1A
${text.slice(0, 400)}`,
            ...routeInfo
          });
          continue;
        }
        report?.({ phase: "apply", completed: index, total: workspaces.length, workspace });
        const applied = applyOps2(root, ops);
        scanned += records.length;
        updated += applied.updated;
        merged += applied.merged;
        dreamed += 1;
        const detail = applied.notes.length === 0 ? "\u6A21\u578B\u8BA4\u4E3A\u65E0\u9700\u6539\u52A8\u3002" : `\u6267\u884C ${applied.notes.length} \u4E2A\u64CD\u4F5C\uFF1A${applied.notes.join("\uFF1B")}`;
        notes.push(`${workspace}\uFF1A\u626B\u63CF ${records.length} \u6761\uFF0C${detail}`);
        appendDreamRecord(root, {
          at: (/* @__PURE__ */ new Date()).toISOString(),
          workspace,
          ok: true,
          scanned: records.length,
          updated: applied.updated,
          merged: applied.merged,
          log: `\u626B\u63CF ${records.length} \u6761\uFF0C${detail}`,
          ...routeInfo
        });
      }
      report?.({ phase: "apply", completed: workspaces.length, total: workspaces.length });
      const log = notes.length === 0 ? "\u6CA1\u6709\u9700\u8981\u5165\u68A6\u7684\u5DE5\u4F5C\u533A\u3002" : notes.join("\n");
      if (signal?.aborted) {
        ctx.logger.info(`dream-admin: \u8BB0\u5FC6\u68A6\u5883\u5DF2\u53D6\u6D88 \u2014 ${log}`);
        return { ok: false, reason: "cancelled", scanned, updated, merged, route, log };
      }
      if (failures > 0) {
        ctx.logger.warn(`dream-admin: \u8BB0\u5FC6\u68A6\u5883\u90E8\u5206\u5931\u8D25 \u2014 ${log}`);
        return { ok: false, reason: "llm_error", scanned, updated, merged, route, log };
      }
      if (dreamed === 0) {
        ctx.logger.info(`dream-admin: \u8BB0\u5FC6\u68A6\u5883\u8DF3\u8FC7 \u2014 ${log}`);
        return { ok: false, reason: "too_few_memories", scanned, updated, merged, route, log };
      }
      ctx.logger.info(`dream-admin: \u8BB0\u5FC6\u68A6\u5883\u5B8C\u6210 \u2014 ${log}`);
      return { ok: true, scanned, updated, merged, route, log };
    } finally {
      running = false;
    }
  };
  timer = setInterval(() => {
    const cfg = deps.resolved().evolve;
    if (!cfg.enabled) return;
    const now = /* @__PURE__ */ new Date();
    const scheduled = new Date(now);
    scheduled.setHours(cfg.atHour, 0, 0, 0);
    const delta = now.getTime() - scheduled.getTime();
    if (delta < 0 || delta >= EVOLVE_TRIGGER_WINDOW_MS) return;
    const today = dayKey(now);
    if (lastDreamDay === today) return;
    lastDreamDay = today;
    void run(false);
  }, 6e4);
  if (typeof timer === "object" && timer !== null && "unref" in timer) {
    timer.unref();
  }
  return {
    run,
    dispose() {
      if (timer !== void 0) clearInterval(timer);
      timer = void 0;
    }
  };
}
function applyOps2(root, ops) {
  let updated = 0;
  let merged = 0;
  const notes = [];
  for (const raw of ops.slice(0, MAX_OPS2)) {
    const op = raw;
    const kind = typeof op.op === "string" ? op.op : "";
    const summary = typeof op.summary === "string" ? op.summary : void 0;
    if (kind === "update") {
      const id = typeof op.id === "string" ? op.id : "";
      const existing = readMemory(root, id);
      if (existing === void 0) continue;
      if (typeof op.body !== "string" || op.body.trim().length === 0) continue;
      writeMemory(root, {
        id,
        title: typeof op.title === "string" ? op.title : existing.title,
        tags: toStringArray(op.tags),
        summary,
        body: op.body,
        pinned: existing.pinned,
        source: "evolve"
      });
      updated += 1;
      notes.push(`update ${id}`);
      continue;
    }
    if (kind === "merge") {
      const ids = (toStringArray(op.ids) ?? []).filter((id) => readMemory(root, id) !== void 0);
      if (ids.length < 2) continue;
      const keep = ids.includes(typeof op.keep === "string" ? op.keep : "") ? op.keep : ids[0];
      const target = readMemory(root, keep);
      if (target === void 0) continue;
      if (typeof op.body !== "string" || op.body.trim().length === 0) continue;
      writeMemory(root, {
        id: keep,
        title: typeof op.title === "string" ? op.title : target.title,
        tags: toStringArray(op.tags),
        summary,
        body: op.body,
        pinned: target.pinned || ids.some((id) => readMemory(root, id)?.pinned === true),
        source: "evolve"
      });
      updated += 1;
      for (const id of ids) {
        if (id === keep) continue;
        if (deleteMemory(root, id)) merged += 1;
      }
      notes.push(`merge ${ids.join(" + ")} -> ${keep}`);
    }
  }
  return { updated, merged, notes };
}
function describe2(error) {
  return error instanceof Error ? error.message : String(error);
}
function appendDreamRecord(root, record) {
  try {
    ensureDir(root);
    const file = join5(root, DREAM_LOG_NAME);
    const lines = readDreamLines(file);
    lines.push(JSON.stringify(record));
    writeFileSync3(file, lines.slice(-MAX_DREAM_RECORDS).join("\n") + "\n", "utf8");
  } catch {
  }
}
function listDreamRecords(root, limit = 100) {
  const records = [];
  for (const line of readDreamLines(join5(root, DREAM_LOG_NAME))) {
    const record = parseDreamRecord(line);
    if (record !== void 0) records.push(record);
  }
  records.reverse();
  return limit > 0 ? records.slice(0, limit) : records;
}
function readDreamLines(file) {
  if (!existsSync3(file)) return [];
  try {
    return readFileSync4(file, "utf8").split(/\r?\n/).filter((line) => line.trim().length > 0);
  } catch {
    return [];
  }
}
function parseDreamRecord(line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return void 0;
  }
  if (typeof value !== "object" || value === null) return void 0;
  const raw = value;
  const at = typeof raw.at === "string" ? raw.at : "";
  const workspace = typeof raw.workspace === "string" ? raw.workspace : "";
  if (at.length === 0 || workspace.length === 0) return void 0;
  const record = {
    at,
    workspace,
    ok: raw.ok === true,
    scanned: finitenessOrZero(raw.scanned),
    updated: finitenessOrZero(raw.updated),
    merged: finitenessOrZero(raw.merged),
    log: typeof raw.log === "string" ? raw.log : ""
  };
  if (typeof raw.reason === "string") record.reason = raw.reason;
  if (typeof raw.provider === "string") record.provider = raw.provider;
  if (typeof raw.model === "string") record.model = raw.model;
  return record;
}
function finitenessOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// src/prompt.ts
var RECALL_CONTEXT_NAME = "dream-admin:memory";
var RECALL_CONTEXT_ORDER = 60;
function installRecall(ctx, deps) {
  return ctx.systemPrompt.context({
    name: RECALL_CONTEXT_NAME,
    order: RECALL_CONTEXT_ORDER,
    text: () => buildRecallText(deps)
  });
}
function buildRecallText(deps) {
  try {
    const recall = deps.resolved().recall;
    if (!recall.enabled || recall.limit <= 0) return "";
    const root = deps.resolveRoot();
    const summaries = listMemories(root).slice(0, recall.limit);
    if (summaries.length === 0) return "";
    const records = [];
    for (const summary of summaries) {
      const record = readMemory(root, summary.id);
      if (record !== void 0) records.push(record);
    }
    const maxChars = recall.maxChars > 0 ? recall.maxChars : Number.MAX_SAFE_INTEGER;
    const text = truncate(renderRecall(records, maxChars), maxChars);
    return neutralizeBraces(text);
  } catch {
    return "";
  }
}
function neutralizeBraces(text) {
  return text.replace(/\{\{/g, "{ {");
}

// src/routes.ts
function registerRoutes(ctx, deps) {
  const resolveRoot = deps.resolveRoot;
  const disposers = [
    ctx.webServer.register({
      kind: "exact",
      path: `/${PLUGIN_NAME}/health`,
      handler: (_req, res) => {
        const cfg = deps.resolved();
        json(res, 200, {
          status: "ok",
          plugin: PLUGIN_NAME,
          store: cfg.store,
          recall: cfg.recall,
          search: { ...cfg.search, prompt: void 0 },
          /** 语义召回当前是否已配置生效（开关 + 供应商 + 模型），供排查「语义没生效」。 */
          semanticReady: deps.semantic.available(),
          capture: { ...cfg.capture, prompt: void 0 },
          evolve: { ...cfg.evolve, prompt: void 0 },
          root: resolveRoot(),
          configFile: storedConfigPath(),
          uptime: process.uptime()
        });
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: `/${PLUGIN_NAME}/config`,
      handler: async (req, res) => {
        if (req.method === "GET") {
          json(res, 200, configView(deps, resolveRoot()));
          return;
        }
        if (req.method === "POST") {
          try {
            const body = JSON.parse(await readBody(req));
            deps.applyOverride(body);
            saveStoredConfig(deps.currentOverride());
            json(res, 200, { ok: true, ...configView(deps, resolveRoot()) });
          } catch (error) {
            json(res, 400, { ok: false, error: message(error) });
          }
          return;
        }
        json(res, 405, { error: "method not allowed" });
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: `/${PLUGIN_NAME}/models`,
      handler: async (_req, res) => {
        try {
          const providers = ctx.llm.listProviders();
          const result = [];
          for (const provider of providers) {
            try {
              const models = await ctx.llm.listModels(provider.id);
              result.push({
                provider: provider.id,
                name: provider.name,
                models: models.map((model) => ({ id: model.id, name: model.name }))
              });
            } catch {
              result.push({ provider: provider.id, name: provider.name, models: [] });
            }
          }
          json(res, 200, result);
        } catch (error) {
          json(res, 500, { error: message(error) });
        }
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: `/${PLUGIN_NAME}/workspaces`,
      handler: (_req, res) => {
        const candidates = deps.listWorkspaces();
        const items = candidates.map((entry) => ({
          ...entry,
          peer: resolvePeer(entry.path)
        }));
        json(res, 200, {
          items,
          // DSH 的默认工作区（目录名固定为 `default-workspace`）；找不到时为空串。
          default: candidates.find((entry) => isDefaultWorkspace(entry.path))?.path ?? "",
          active: resolveRoot(),
          global: globalMemoryRoot()
        });
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: `/${PLUGIN_NAME}/memories`,
      handler: async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const workspace = optional(url.searchParams.get("workspace"));
        const query = optional(url.searchParams.get("q"));
        const limit = clampLimit(url.searchParams.get("limit"), 200);
        const root = resolveRoot(workspace);
        try {
          const items = query !== void 0 ? await deps.semantic.search(root, query, limit) : listMemories(root).slice(0, limit);
          json(res, 200, { root, items });
        } catch (error) {
          json(res, 500, { error: message(error) });
        }
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: `/${PLUGIN_NAME}/memory`,
      handler: async (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const workspace = optional(url.searchParams.get("workspace"));
        const id = optional(url.searchParams.get("id"));
        const root = resolveRoot(workspace);
        if (req.method === "GET") {
          if (id === void 0) {
            json(res, 400, { error: "id is required" });
            return;
          }
          json(res, 200, { root, memory: readMemory(root, id) ?? null });
          return;
        }
        if (req.method === "POST") {
          try {
            const body = JSON.parse(await readBody(req));
            const targetWorkspace = typeof body.workspace === "string" ? body.workspace : workspace;
            const targetRoot = resolveRoot(targetWorkspace);
            if (typeof body.body !== "string" || body.body.trim().length === 0) {
              json(res, 400, { ok: false, error: "body is required" });
              return;
            }
            const record = writeMemory(targetRoot, {
              id: typeof body.id === "string" ? body.id : void 0,
              title: typeof body.title === "string" ? body.title : void 0,
              body: body.body,
              tags: toTags(body.tags),
              pinned: typeof body.pinned === "boolean" ? body.pinned : void 0,
              source: "manual",
              workspace: targetWorkspace
            });
            json(res, 200, { ok: true, root: targetRoot, memory: record });
          } catch (error) {
            json(res, 400, { ok: false, error: message(error) });
          }
          return;
        }
        if (req.method === "DELETE") {
          if (id === void 0) {
            json(res, 400, { error: "id is required" });
            return;
          }
          json(res, 200, { ok: true, deleted: deleteMemory(root, id) });
          return;
        }
        json(res, 405, { error: "method not allowed" });
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: `/${PLUGIN_NAME}/capture`,
      handler: (req, res) => {
        if (req.method !== "POST") {
          json(res, 405, { error: "method not allowed" });
          return;
        }
        const url = new URL(req.url ?? "/", "http://localhost");
        const workspace = optional(url.searchParams.get("workspace"));
        const task = deps.tasks.start(
          "capture",
          (report, signal) => deps.capturer.run(true, { workspace, onProgress: report }, signal)
        );
        json(res, 202, { ok: true, taskId: task.id, task });
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: `/${PLUGIN_NAME}/evolve`,
      handler: (req, res) => {
        if (req.method !== "POST") {
          json(res, 405, { error: "method not allowed" });
          return;
        }
        const url = new URL(req.url ?? "/", "http://localhost");
        const workspace = optional(url.searchParams.get("workspace"));
        const task = deps.tasks.start(
          "evolve",
          (report, signal) => deps.evolver.run(true, { workspace, onProgress: report }, signal)
        );
        json(res, 202, { ok: true, taskId: task.id, task });
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: `/${PLUGIN_NAME}/tasks`,
      handler: (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const id = optional(url.searchParams.get("id"));
        if (id === void 0) {
          json(res, 200, { ok: true, items: deps.tasks.list() });
          return;
        }
        const task = deps.tasks.get(id);
        if (task === void 0) {
          json(res, 404, { ok: false, error: "task not found" });
          return;
        }
        json(res, 200, { ok: true, task });
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: `/${PLUGIN_NAME}/cancel`,
      handler: (req, res) => {
        if (req.method !== "POST") {
          json(res, 405, { error: "method not allowed" });
          return;
        }
        const url = new URL(req.url ?? "/", "http://localhost");
        const id = optional(url.searchParams.get("id"));
        if (id !== void 0) {
          json(res, 200, { ok: true, cancelled: deps.tasks.cancel(id) ? 1 : 0 });
          return;
        }
        let cancelled = 0;
        for (const task of deps.tasks.list()) {
          if (task.status === "running" && deps.tasks.cancel(task.id)) cancelled += 1;
        }
        json(res, 200, { ok: true, cancelled });
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: `/${PLUGIN_NAME}/evolve-history`,
      handler: (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const workspace = optional(url.searchParams.get("workspace"));
        const limit = clampLimit(url.searchParams.get("limit"), 100);
        const root = resolveRoot(workspace);
        json(res, 200, { root, items: listDreamRecords(root, limit) });
      }
    })
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}
function configView(deps, root) {
  const cfg = deps.resolved();
  return {
    store: cfg.store,
    recall: cfg.recall,
    search: cfg.search,
    evolve: cfg.evolve,
    capture: cfg.capture,
    root,
    override: deps.currentOverride(),
    configFile: storedConfigPath(),
    defaults: resolvePluginConfig({})
  };
}
function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve4) => {
    let data = "";
    req.on("data", (chunk) => {
      if (chunk) data += chunk.toString("utf8");
    });
    req.on("end", () => resolve4(data));
  });
}
function optional(value) {
  if (value === null) return void 0;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function toTags(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value === "string") {
    return value.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  }
  return void 0;
}
function clampLimit(value, fallback) {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1e3, Math.max(1, Math.trunc(parsed)));
}
function message(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/semantic.ts
var MAX_TERMS = 8;
function rank(root, base, expanded, weight, limit) {
  const byId = new Map(listMemories(root).map((summary) => [summary.id, summary]));
  const maxBase = Math.max(0, ...base.values());
  const maxExpanded = Math.max(0, ...expanded?.values() ?? []);
  const ids = /* @__PURE__ */ new Set([...base.keys(), ...expanded?.keys() ?? []]);
  const scored = [];
  for (const id of ids) {
    const summary = byId.get(id);
    if (summary === void 0) continue;
    const baseScore = maxBase > 0 ? (base.get(id) ?? 0) / maxBase : 0;
    const expandedScore = maxExpanded > 0 ? (expanded?.get(id) ?? 0) / maxExpanded : 0;
    const blended = expanded === void 0 ? baseScore : (1 - weight) * baseScore + weight * expandedScore;
    if (blended <= 0) continue;
    scored.push({ score: blended + (summary.pinned ? 0.05 : 0), summary });
  }
  scored.sort((a, b) => b.score - a.score || b.summary.updated.localeCompare(a.summary.updated));
  return scored.slice(0, limit).map((entry) => entry.summary);
}
function createSemanticEngine(deps) {
  const expand = async (query, cfg, signal) => {
    let text = "";
    try {
      text = await collectStreamText(
        deps.llm.stream({
          provider: cfg.provider,
          model: cfg.model,
          system: cfg.prompt,
          messages: [{ role: "user", content: [{ type: "text", text: query }] }],
          maxTokens: cfg.maxTokens,
          ...signal === void 0 ? {} : { signal }
        })
      );
    } catch {
      return void 0;
    }
    const parsed = extractJson(text);
    const terms = parsed === void 0 ? void 0 : toStringArray(parsed.terms);
    if (terms === void 0) return void 0;
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const term of terms) {
      const value = term.trim();
      if (value.length === 0 || seen.has(value)) continue;
      seen.add(value);
      result.push(value);
      if (result.length >= MAX_TERMS) break;
    }
    return result;
  };
  const available = () => {
    const cfg = deps.resolved();
    return cfg.semantic && cfg.provider.length > 0 && cfg.model.length > 0;
  };
  const search = async (root, query, limit, signal) => {
    const cfg = deps.resolved();
    const trimmed = query.trim();
    if (trimmed.length === 0) return listMemories(root).slice(0, limit);
    const base = scoreMemories(root, trimmed);
    if (!available()) return rank(root, base, void 0, cfg.weight, limit);
    const terms = await expand(trimmed, cfg, signal);
    if (terms === void 0 || terms.length === 0) return rank(root, base, void 0, cfg.weight, limit);
    const expanded = scoreMemories(root, terms.join(" "));
    return rank(root, base, expanded, cfg.weight, limit);
  };
  return {
    search,
    available,
    dispose() {
    }
  };
}

// src/sessions.ts
import { resolve as resolve3 } from "node:path";
function createSessionReader(ctx) {
  let query;
  const fiber = ctx.inject(["sessionQuery"], (serviceCtx) => {
    query = serviceCtx.sessionQuery;
    serviceCtx.effect(
      () => () => {
        query = void 0;
      },
      "dream-admin: sessionQuery \u7ED1\u5B9A"
    );
  });
  return {
    available: () => query !== void 0,
    async read(workspace, options, signal) {
      const service = query;
      if (service === void 0) return { digests: [], watermarks: /* @__PURE__ */ new Map() };
      const records = await service.listSessions(signal);
      const target = normalizePath(workspace);
      const matching = records.map((record) => record?.header).filter((header) => header !== void 0).filter((header) => typeof header.cwd === "string" && normalizePath(header.cwd) === target).filter((header) => header.origin !== "subagent").sort((a, b) => createdAtOf(b) - createdAtOf(a)).slice(0, options.maxSessions);
      const digests = [];
      const watermarks = /* @__PURE__ */ new Map();
      for (const header of matching) {
        const id = typeof header.id === "string" ? header.id : "";
        if (id.length === 0) continue;
        let events;
        try {
          const surface = await service.readSurface(id);
          events = Array.isArray(surface?.events) ? surface.events : [];
        } catch {
          continue;
        }
        const lastSeq = maxSeqOf(events);
        watermarks.set(id, lastSeq);
        const since = options.since.get(id) ?? -1;
        const messages = extractMessages(events, since).slice(-options.maxMessages);
        if (messages.length === 0) continue;
        digests.push({ id, createdAt: createdAtOf(header), lastSeq, messages });
      }
      return { digests, watermarks };
    },
    dispose() {
      void fiber.dispose();
    }
  };
}
function extractMessages(events, sinceSeq) {
  const result = [];
  for (const raw of events) {
    const event = raw;
    const seq = typeof event.seq === "number" ? event.seq : -1;
    if (seq <= sinceSeq) continue;
    const role = event.type === "user/message" ? "user" : event.type === "assistant/message" ? "assistant" : void 0;
    if (role === void 0) continue;
    if (role === "user" && !isHumanUserMessage(event)) continue;
    const text = eventText(event, role);
    if (text.length === 0) continue;
    result.push({ role, text });
  }
  return result;
}
function isHumanUserMessage(event) {
  const data = event.data;
  const kind = data?.source?.kind;
  return typeof kind !== "string" || kind.length === 0 || kind === "user";
}
function eventText(event, role) {
  const data = event.data;
  const content = role === "user" ? data?.content : data?.message?.content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    const item = block;
    if (item?.type === "text" && typeof item.text === "string") {
      const text = item.text.trim();
      if (text.length > 0) parts.push(text);
    }
  }
  return parts.join("\n");
}
function maxSeqOf(events) {
  let max = -1;
  for (const raw of events) {
    const seq = raw.seq;
    if (typeof seq === "number" && seq > max) max = seq;
  }
  return max;
}
function createdAtOf(header) {
  return typeof header.createdAt === "number" && Number.isFinite(header.createdAt) ? header.createdAt : 0;
}
function normalizePath(value) {
  const resolved = resolve3(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

// src/tasks.ts
var MAX_TASKS = 20;
function createTaskRegistry() {
  const tasks = /* @__PURE__ */ new Map();
  const controllers = /* @__PURE__ */ new Map();
  let seq = 0;
  const trim = () => {
    while (tasks.size > MAX_TASKS) {
      let removed = false;
      for (const [key, task] of tasks) {
        if (task.status !== "running") {
          tasks.delete(key);
          removed = true;
          break;
        }
      }
      if (!removed) return;
    }
  };
  const clone = (task) => ({
    ...task,
    progress: { ...task.progress }
  });
  return {
    start(kind, runner) {
      const id = `${kind}-${Date.now().toString(36)}-${++seq}`;
      const controller = new AbortController();
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const task = {
        id,
        kind,
        status: "running",
        startedAt: now,
        updatedAt: now,
        progress: { phase: "prepare", completed: 0, total: 0 }
      };
      tasks.set(id, task);
      controllers.set(id, controller);
      trim();
      const report = (update) => {
        if (task.status !== "running") return;
        task.progress = { ...task.progress, ...update };
        task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      };
      void runner(report, controller.signal).then((outcome) => {
        task.outcome = outcome;
        if (task.status === "running") {
          task.status = controller.signal.aborted ? "cancelled" : "done";
        }
        task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      }).catch(() => {
        if (task.status === "running") {
          task.status = controller.signal.aborted ? "cancelled" : "done";
        }
        task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      }).finally(() => {
        controllers.delete(id);
      });
      return clone(task);
    },
    get(id) {
      const task = tasks.get(id);
      return task === void 0 ? void 0 : clone(task);
    },
    list() {
      return [...tasks.values()].reverse().map(clone);
    },
    cancel(id) {
      const controller = controllers.get(id);
      const task = tasks.get(id);
      if (controller === void 0 || task === void 0) return false;
      if (task.status !== "running") return false;
      controller.abort();
      task.status = "cancelled";
      task.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
      return true;
    },
    dispose() {
      for (const controller of controllers.values()) controller.abort();
      controllers.clear();
    }
  };
}

// src/tools.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
function fail(message2) {
  throw new Error(message2);
}
function failureLine(id, action, site) {
  return `ERROR: memory/${action}_failed \u2014 id=${id} site=${site}`;
}
function summaryLine(index, item) {
  const flags = item.pinned ? " [\u7F6E\u9876]" : "";
  const tagText = item.tags.length > 0 ? ` (${item.tags.join(", ")})` : "";
  const line = `${index + 1}. ${item.title}${tagText}${flags} \u2014 id: ${item.id} \u2014 \u66F4\u65B0\u4E8E ${item.updated}${scopeLabel(item.workspace, item.peer)}`;
  return item.summary.length > 0 ? `${line}
   \u6458\u8981\uFF1A${item.summary}` : line;
}
function scopeLabel(workspace, peer) {
  if (workspace !== void 0 && workspace.length > 0) return ` \u2014 \u5DE5\u4F5C\u533A: ${lastSegment2(workspace)}`;
  if (peer !== void 0 && peer.length > 0) return ` \u2014 \u5DE5\u4F5C\u533A: ${peer}`;
  return "";
}
function lastSegment2(value) {
  const parts = value.split(/[\\/]/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? value;
}
function registerMemoryTools(ctx, deps) {
  const disposers = [];
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: "memory_search",
        description: "\u5728\u957F\u671F\u8BB0\u5FC6\u5E93\u91CC\u68C0\u7D22\uFF08\u672C\u5730 BM25 \u5173\u952E\u8BCD\uFF1B\u82E5\u5F00\u542F\u8BED\u4E49\u53EC\u56DE\u5219\u4E0E\u6A21\u578B\u6269\u5199\u51FA\u7684\u76F8\u5173\u8BCD\u7ED3\u679C\u878D\u5408\uFF09\u3002\u7CFB\u7EDF\u63D0\u793A\u91CC\u53EA\u6CE8\u5165\u4E86\u5C11\u91CF\u6458\u8981\uFF0C\u9700\u8981\u627E\u5386\u53F2\u7ED3\u8BBA\u6216\u7EC6\u8282\u65F6\u7528\u8FD9\u4E2A\u5DE5\u5177\uFF0C\u518D\u7528 memory_read \u8BFB\u6B63\u6587\u3002",
        parameters: {
          query: { type: "string", required: true, description: "\u68C0\u7D22\u8BCD\uFF0C\u7A7A\u683C\u5206\u9694\u591A\u4E2A\u8BCD\uFF1B\u4E2D\u6587\u6309\u4E8C\u5B57\u8BCD\u5339\u914D\u3002" },
          limit: { type: "number", description: "\u8FD4\u56DE\u6761\u6570\u4E0A\u9650\uFF0C\u9ED8\u8BA4 8\u3002" },
          workspace: { type: "string", description: "\u5DE5\u4F5C\u533A\u7EDD\u5BF9\u8DEF\u5F84\uFF1B\u7701\u7565\u65F6\u7528\u5F53\u524D\u6D3B\u8DC3\u5DE5\u4F5C\u533A\u3002" }
        },
        output: {
          schema: { type: "string" },
          render: (_args, value) => [{ type: "text", text: value }]
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
          if (exec.signal.aborted) fail("memory_search \u5DF2\u53D6\u6D88");
          const root = deps.resolveRoot(args.workspace);
          const limit = clampLimit2(args.limit, 8);
          const hits = await deps.semantic.search(root, args.query, limit, exec.signal);
          if (hits.length === 0) return `\u8BB0\u5FC6\u5E93\uFF08${root}\uFF09\u4E2D\u6CA1\u6709\u5339\u914D "${args.query}" \u7684\u6761\u76EE\u3002`;
          const lines = hits.map((hit, index) => summaryLine(index, hit));
          return `\u5339\u914D ${hits.length} \u6761\uFF1A
${lines.join("\n")}

\u7528 memory_read \u8BFB\u53D6\u67D0\u6761\u7684\u5B8C\u6574\u6B63\u6587\u3002`;
        }
      })
    )
  );
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: "memory_list",
        description: "\u5217\u51FA\u5F53\u524D\u5DE5\u4F5C\u533A\u957F\u671F\u8BB0\u5FC6\u5E93\u91CC\u7684\u6761\u76EE\uFF08\u7F6E\u9876\u4F18\u5148\uFF0C\u7136\u540E\u6309\u66F4\u65B0\u65F6\u95F4\u5012\u5E8F\uFF09\u3002",
        parameters: {
          limit: { type: "number", description: "\u8FD4\u56DE\u6761\u6570\u4E0A\u9650\uFF0C\u9ED8\u8BA4 20\u3002" },
          workspace: { type: "string", description: "\u5DE5\u4F5C\u533A\u7EDD\u5BF9\u8DEF\u5F84\uFF1B\u7701\u7565\u65F6\u7528\u5F53\u524D\u6D3B\u8DC3\u5DE5\u4F5C\u533A\u3002" }
        },
        output: {
          schema: { type: "string" },
          render: (_args, value) => [{ type: "text", text: value }]
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
          if (exec.signal.aborted) fail("memory_list \u5DF2\u53D6\u6D88");
          const root = deps.resolveRoot(args.workspace);
          const all = listMemories(root);
          if (all.length === 0) return `\u8BB0\u5FC6\u5E93\uFF08${root}\uFF09\u8FD8\u662F\u7A7A\u7684\u3002`;
          const limit = clampLimit2(args.limit, 20);
          const lines = all.slice(0, limit).map((item, index) => summaryLine(index, item));
          return `\u5171 ${all.length} \u6761\uFF08\u663E\u793A\u524D ${Math.min(limit, all.length)} \u6761\uFF09\uFF1A
${lines.join("\n")}
\u76EE\u5F55\uFF1A${root}`;
        }
      })
    )
  );
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: "memory_read",
        description: "\u6309 id \u8BFB\u53D6\u4E00\u6761\u8BB0\u5FC6\u7684\u5B8C\u6574\u6B63\u6587\u4E0E\u5143\u4FE1\u606F\u3002\u7CFB\u7EDF\u63D0\u793A\u53EA\u6CE8\u5165\u6458\u8981\uFF0C\u9700\u8981\u7EC6\u8282\uFF08\u547D\u4EE4\u3001\u8DEF\u5F84\u3001\u5B8C\u6574\u7ED3\u8BBA\uFF09\u65F6\u7528\u8FD9\u4E2A\u5DE5\u5177\u3002",
        parameters: {
          id: { type: "string", required: true, description: "\u8981\u8BFB\u53D6\u7684\u8BB0\u5FC6 id\u3002" },
          workspace: { type: "string", description: "\u5DE5\u4F5C\u533A\u7EDD\u5BF9\u8DEF\u5F84\uFF1B\u7701\u7565\u65F6\u7528\u5F53\u524D\u6D3B\u8DC3\u5DE5\u4F5C\u533A\u3002" }
        },
        output: {
          schema: { type: "string" },
          render: (_args, value) => [{ type: "text", text: value }]
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
          if (exec.signal.aborted) fail("memory_read \u5DF2\u53D6\u6D88");
          const root = deps.resolveRoot(args.workspace);
          if (!isValidId(args.id)) return `id \u975E\u6CD5\uFF1A${args.id}`;
          const record = readMemory(root, args.id);
          if (record === void 0) return `\u6CA1\u6709\u627E\u5230 id \u4E3A ${args.id} \u7684\u8BB0\u5FC6\uFF08\u76EE\u5F55\uFF1A${root}\uFF09\u3002`;
          const meta = [
            record.tags.length > 0 ? `\u6807\u7B7E: ${record.tags.join(", ")}` : "",
            record.summary.length > 0 ? `\u6458\u8981: ${record.summary}` : "",
            `\u6765\u6E90: ${record.source}${record.pinned ? " \xB7 \u7F6E\u9876" : ""}`,
            record.workspace !== void 0 ? `\u5DE5\u4F5C\u533A: ${record.workspace}` : "",
            record.peer !== void 0 ? `\u5DE5\u4F5C\u533A\u8EAB\u4EFD: ${record.peer}` : "",
            `\u66F4\u65B0\u4E8E: ${record.updated}`
          ].filter((line) => line.length > 0);
          return `# ${record.title}

${meta.join("\n")}

---

${record.body}`;
        }
      })
    )
  );
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: "memory_forget",
        description: "\u5220\u9664\u5F53\u524D\u5DE5\u4F5C\u533A\u8BB0\u5FC6\u5E93\u91CC\u7684\u4E00\u6761\u8BB0\u5FC6\u3002\u5220\u9664\u4E0D\u53EF\u64A4\u9500\u3002",
        parameters: {
          id: { type: "string", required: true, description: "\u8981\u5220\u9664\u7684\u8BB0\u5FC6 id\u3002" },
          workspace: { type: "string", description: "\u5DE5\u4F5C\u533A\u7EDD\u5BF9\u8DEF\u5F84\uFF1B\u7701\u7565\u65F6\u7528\u5F53\u524D\u6D3B\u8DC3\u5DE5\u4F5C\u533A\u3002" }
        },
        output: {
          schema: { type: "string" },
          render: (_args, value) => [{ type: "text", text: value }]
        },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
          if (exec.signal.aborted) fail("memory_forget \u5DF2\u53D6\u6D88");
          const root = deps.resolveRoot(args.workspace);
          if (!isValidId(args.id)) return `id \u975E\u6CD5\uFF1A${args.id}`;
          const existing = readMemory(root, args.id);
          if (existing === void 0) return `\u6CA1\u6709\u627E\u5230 id \u4E3A ${args.id} \u7684\u8BB0\u5FC6\uFF08\u76EE\u5F55\uFF1A${root}\uFF09\u3002`;
          const removed = deleteMemory(root, args.id);
          return removed ? `\u5DF2\u5220\u9664\u8BB0\u5FC6 "${existing.title}"\uFF08id: ${args.id}\uFF09\u3002` : failureLine(args.id, "forget", root);
        }
      })
    )
  );
  return () => {
    for (const dispose of disposers) dispose();
  };
}
function clampLimit2(value, fallback) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(1, Math.trunc(value)));
}

// src/index.ts
var name = PLUGIN_NAME;
var inject = ["llm", "tools", "sessions", "systemPrompt", "webServer"];
function apply(ctx, config) {
  let runtimeOverride = loadStoredConfig();
  let lastGood;
  const resolved = () => {
    const raw = mergeConfig(
      {
        store: sectionValue(config.store),
        recall: sectionValue(config.recall),
        search: sectionValue(config.search),
        evolve: sectionValue(config.evolve),
        capture: sectionValue(config.capture)
      },
      runtimeOverride ?? {}
    );
    try {
      const next = resolvePluginConfig(raw);
      lastGood = next;
      return next;
    } catch (error) {
      if (lastGood === void 0) throw error;
      ctx.logger.error("dream-admin: \u914D\u7F6E\u975E\u6CD5\uFF0C\u7EE7\u7EED\u6CBF\u7528\u4E0A\u4E00\u4EFD\u53EF\u7528\u914D\u7F6E");
      ctx.logger.error(error);
      return lastGood;
    }
  };
  const resolveRoot = createRootResolver({
    groupBy: () => resolved().store.groupBy,
    sessions: () => ctx.sessions.list()
  });
  let workspaceRegistry;
  ctx.inject(["workspaceRegistry"], (serviceCtx) => {
    workspaceRegistry = serviceCtx.workspaceRegistry;
    serviceCtx.effect(
      () => () => {
        workspaceRegistry = void 0;
      },
      "dream-admin: workspaceRegistry \u7ED1\u5B9A"
    );
  });
  const listWorkspaceCandidates = () => {
    const fromRegistry = workspaceRegistry === void 0 ? [] : registryWorkspaces(workspaceRegistry);
    return fromRegistry.length > 0 ? fromRegistry : listWorkspaces(ctx.sessions.list());
  };
  const applyOverride = (patch) => {
    runtimeOverride = mergeConfig(runtimeOverride ?? {}, patch);
    return runtimeOverride;
  };
  const semantic = createSemanticEngine({ resolved: () => resolved().search, llm: ctx.llm });
  const evolver = createEvolver(ctx, { resolved, resolveRoot, sessions: () => ctx.sessions.list() });
  const sessionReader = createSessionReader(ctx);
  const capturer = createCapturer(ctx, {
    resolved,
    resolveRoot,
    sessions: () => ctx.sessions.list(),
    sessionReader
  });
  const tasks = createTaskRegistry();
  const disposeRoutes = registerRoutes(ctx, {
    resolved,
    currentOverride: () => runtimeOverride ?? {},
    applyOverride,
    resolveRoot,
    sessions: () => ctx.sessions.list(),
    listWorkspaces: listWorkspaceCandidates,
    evolver,
    capturer,
    semantic,
    tasks
  });
  const disposeTools = registerMemoryTools(ctx, { resolved, resolveRoot, semantic });
  const disposeRecall = installRecall(ctx, {
    resolved,
    resolveRoot,
    currentRoot: () => resolveRoot()
  });
  ctx.effect(
    () => () => {
      disposeRoutes();
      disposeTools();
      disposeRecall();
      tasks.dispose();
      evolver.dispose();
      capturer.dispose();
      semantic.dispose();
      sessionReader.dispose();
    },
    "dream-admin: \u8DEF\u7531 / \u5DE5\u5177 / \u53EC\u56DE / \u6574\u7406\u8BB0\u5FC6 / \u5165\u68A6 \u751F\u547D\u5468\u671F"
  );
  const cfg = resolved();
  ctx.logger.info(
    `dream-admin \u5DF2\u52A0\u8F7D\uFF08\u5206\u7EC4: ${cfg.store.groupBy}\uFF0C\u53EC\u56DE: ${cfg.recall.enabled ? `\u5F00(${cfg.recall.limit})` : "\u5173"}\uFF0C\u8BED\u4E49\u68C0\u7D22: ${cfg.search.semantic ? `\u5F00(${cfg.search.provider}/${cfg.search.model})` : "\u5173"}\uFF0C\u6574\u7406\u8BB0\u5FC6: ${cfg.capture.enabled ? `\u5F00(${cfg.capture.provider}/${cfg.capture.model})` : "\u5173"}\uFF0C\u5165\u68A6: ${cfg.evolve.enabled ? `\u5F00(${cfg.evolve.provider}/${cfg.evolve.model})` : "\u5173"}\uFF0C\u5F53\u524D\u8BB0\u5FC6\u6839: ${resolveRoot()}\uFF09`
  );
}
export {
  Config,
  PLUGIN_NAME,
  apply,
  inject,
  name,
  resolvePluginConfig
};
//# sourceMappingURL=index.js.map
