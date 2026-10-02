// src/config.ts
import z from "@deepseek-ai/schemastery";
import { mkdirSync as mkdirSync2, readFileSync, writeFileSync } from "node:fs";
import { dirname, join as join2 } from "node:path";

// src/paths.ts
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve, sep } from "node:path";
function dshHome() {
  const raw = process.env["DSH_HOME"];
  if (typeof raw === "string" && raw.trim().length > 0) return resolve(raw.trim());
  return join(homedir(), ".dsh");
}
function globalMemoryRoot(dir) {
  return isAbsolutePath(dir) ? resolve(dir.trim()) : join(dshHome(), "dream-admin", "memory");
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
function workspaceMemoryRoot(workspace, dir) {
  return isAbsolute(dir) ? resolve(dir) : join(workspace, dir);
}
function listWorkspaces(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const ordered = [...list].sort((a, b) => createdAt(b) - createdAt(a));
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const session of ordered) {
    const cwd = session?.header?.cwd;
    if (!isAbsolutePath(cwd)) continue;
    const path = resolve(cwd.trim());
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
function createRootResolver(deps) {
  return (workspace) => {
    const store = deps.store();
    if (isAbsolutePath(workspace)) {
      return store.scope === "global" ? globalMemoryRoot(store.dir) : workspaceMemoryRoot(workspace.trim(), store.dir);
    }
    if (store.scope === "global") return globalMemoryRoot(store.dir);
    const active = listWorkspaces(deps.sessions())[0];
    if (active !== void 0) return workspaceMemoryRoot(active.path, store.dir);
    return globalMemoryRoot();
  };
}

// src/config.ts
var PLUGIN_NAME = "dream-admin";
var DEFAULT_MEMORY_DIR = "memory";
var DEFAULT_RECALL_LIMIT = 5;
var DEFAULT_RECALL_MAX_CHARS = 4e3;
var DEFAULT_EVOLVE_INTERVAL_MINUTES = 30;
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
  "",
  "\u53EA\u8F93\u51FA\u4E00\u4E2A JSON \u5BF9\u8C61\uFF0C\u4E0D\u8981\u4EFB\u4F55\u89E3\u91CA\u6587\u5B57\u3001\u4E0D\u8981 Markdown \u4EE3\u7801\u56F4\u680F\uFF1A",
  "{",
  '  "ops": [',
  '    { "op": "update", "id": "<\u5DF2\u5B58\u5728\u7684 id>", "title": "...", "tags": ["..."], "body": "..." },',
  '    { "op": "merge", "ids": ["<id1>", "<id2>"], "keep": "<id1>", "title": "...", "tags": ["..."], "body": "..." }',
  "  ]",
  "}",
  "",
  '\u6CA1\u6709\u4EFB\u4F55\u6539\u52A8\u65F6\u8F93\u51FA {"ops":[]}\u3002'
].join("\n");
var Config = z.object({
  store: z.object({
    dir: z.string().default(DEFAULT_MEMORY_DIR).description(
      "\u8BB0\u5FC6\u76EE\u5F55\uFF1A\u76F8\u5BF9\u8DEF\u5F84\u89C6\u4E3A\u5DE5\u4F5C\u533A\u5185\u7684\u5B50\u76EE\u5F55\uFF08\u9ED8\u8BA4 memory\uFF09\uFF1B\u7EDD\u5BF9\u8DEF\u5F84\u5219\u56FA\u5B9A\u4F7F\u7528\u8BE5\u76EE\u5F55\uFF0C\u5404\u5DE5\u4F5C\u533A\u5171\u7528\u3002"
    ),
    scope: z.union([z.const("workspace"), z.const("global")]).default("workspace").description(
      "workspace\uFF1A\u8BB0\u5FC6\u8DDF\u7740\u5F53\u524D\u5DE5\u4F5C\u533A\u6587\u4EF6\u5939\u8D70\uFF08<\u5DE5\u4F5C\u533A>/<dir>\uFF09\uFF1Bglobal\uFF1A\u6240\u6709\u5DE5\u4F5C\u533A\u5171\u7528\u4E00\u4E2A\u76EE\u5F55\uFF08<DSH_HOME>/dream-admin/memory\uFF0Cdir \u4E3A\u7EDD\u5BF9\u8DEF\u5F84\u65F6\u5373\u8BE5\u76EE\u5F55\uFF09\u3002"
    )
  }).default({ dir: DEFAULT_MEMORY_DIR, scope: "workspace" }).volatile(),
  recall: z.object({
    enabled: z.boolean().default(true).description("\u6BCF\u6B21\u5BF9\u8BDD\u662F\u5426\u81EA\u52A8\u5E26\u4E0A\u957F\u671F\u8BB0\u5FC6\uFF08\u6BCF\u4E2A\u6A21\u578B\u8F6E\u6B21\u91CD\u65B0\u88C5\u914D\uFF09\u3002"),
    limit: z.number().step(1).min(0).max(50).default(DEFAULT_RECALL_LIMIT).description("\u6BCF\u6B21\u6700\u591A\u5E26\u4E0A\u51E0\u6761\u8BB0\u5FC6\u3002"),
    maxChars: z.number().step(1).min(0).default(DEFAULT_RECALL_MAX_CHARS).description("\u6BCF\u6B21\u5E26\u4E0A\u7684\u8BB0\u5FC6\u6B63\u6587\u5B57\u7B26\u4E0A\u9650\uFF0C\u8D85\u51FA\u5373\u622A\u65AD\u30020 \u8868\u793A\u4E0D\u9650\u5236\u3002")
  }).default({ enabled: true, limit: DEFAULT_RECALL_LIMIT, maxChars: DEFAULT_RECALL_MAX_CHARS }).volatile(),
  evolve: z.object({
    enabled: z.boolean().default(false).description(
      "\u5F00\u542F\u8BB0\u5FC6\u68A6\u5883\uFF1A\u6309\u95F4\u9694\u8C03\u7528\u4F60\u6307\u5B9A\u7684\u6A21\u578B\uFF0C\u81EA\u52A8\u5408\u5E76 / \u53BB\u91CD / \u63D0\u70BC\u8BB0\u5FC6\u3002\u4E5F\u53EF\u4EE5\u968F\u65F6\u5728\u5BF9\u8BDD\u6846\u8F93\u5165 /memoryup \u7ACB\u5373\u6574\u7406\u4E00\u6B21\u3002"
    ),
    provider: z.string().default("").description("\u8BB0\u5FC6\u68A6\u5883\u4F7F\u7528\u7684 provider \u8DEF\u7531\uFF08\u4ECE DSH \u6A21\u578B\u5217\u8868\u4E2D\u9009\u62E9\uFF09\uFF1B\u7559\u7A7A\u65F6 /memoryup \u7528\u5F53\u524D\u5BF9\u8BDD\u6A21\u578B\u3002"),
    model: z.string().default("").description("\u8BE5 provider \u4E0B\u7684\u6A21\u578B id\uFF1B\u7559\u7A7A\u65F6 /memoryup \u7528\u5F53\u524D\u5BF9\u8BDD\u6A21\u578B\u3002"),
    intervalMinutes: z.number().step(1).min(1).max(1440).default(DEFAULT_EVOLVE_INTERVAL_MINUTES).description("\u81EA\u52A8\u8BB0\u5FC6\u68A6\u5883\u7684\u95F4\u9694\uFF08\u5206\u949F\uFF09\u3002"),
    minMemories: z.number().step(1).min(1).default(DEFAULT_EVOLVE_MIN_MEMORIES).description("\u8BB0\u5FC6\u6761\u6570\u4F4E\u4E8E\u8BE5\u503C\u65F6\u8DF3\u8FC7\u81EA\u52A8\u8BB0\u5FC6\u68A6\u5883\uFF08\u624B\u52A8\u89E6\u53D1\u4E0D\u53D7\u9650\uFF09\u3002"),
    maxTokens: z.number().step(1).min(1).default(DEFAULT_EVOLVE_MAX_TOKENS).description("\u5355\u6B21\u8BB0\u5FC6\u68A6\u5883\u8C03\u7528\u7684\u6700\u5927\u8F93\u51FA token \u6570\u3002"),
    prompt: z.string().default(DEFAULT_EVOLVE_PROMPT).description("\u8BB0\u5FC6\u68A6\u5883\u8C03\u7528\u7684\u7CFB\u7EDF\u63D0\u793A\u3002")
  }).default({
    enabled: false,
    provider: "",
    model: "",
    intervalMinutes: DEFAULT_EVOLVE_INTERVAL_MINUTES,
    minMemories: DEFAULT_EVOLVE_MIN_MEMORIES,
    maxTokens: DEFAULT_EVOLVE_MAX_TOKENS,
    prompt: DEFAULT_EVOLVE_PROMPT
  }).volatile()
}).description("DreamAdmin\uFF1A\u968F\u5DE5\u4F5C\u533A\u7BA1\u7406\u7684\u957F\u671F\u8BB0\u5FC6 + \u8BB0\u5FC6\u68A6\u5883\u3002");
function sectionValue(value) {
  if (typeof value === "object" && value !== null && typeof value.get === "function") {
    return value.get();
  }
  return value;
}
function resolvePluginConfig(config) {
  const store = config?.store ?? {};
  const recall = config?.recall ?? {};
  const evolve = config?.evolve ?? {};
  const dir = typeof store.dir === "string" && store.dir.trim().length > 0 ? store.dir.trim() : DEFAULT_MEMORY_DIR;
  const scope = store.scope === "global" ? "global" : "workspace";
  const limit = clampInt(recall.limit ?? DEFAULT_RECALL_LIMIT, 0, 50);
  const maxChars = clampInt(recall.maxChars ?? DEFAULT_RECALL_MAX_CHARS, 0, Number.MAX_SAFE_INTEGER);
  const provider = typeof evolve.provider === "string" ? evolve.provider : "";
  const model = typeof evolve.model === "string" ? evolve.model : "";
  const prompt = typeof evolve.prompt === "string" && evolve.prompt.trim().length > 0 ? evolve.prompt : DEFAULT_EVOLVE_PROMPT;
  return {
    store: { dir, scope },
    recall: { enabled: recall.enabled ?? true, limit, maxChars },
    evolve: {
      enabled: evolve.enabled ?? false,
      provider,
      model,
      intervalMinutes: clampInt(evolve.intervalMinutes ?? DEFAULT_EVOLVE_INTERVAL_MINUTES, 1, 1440),
      minMemories: clampInt(evolve.minMemories ?? DEFAULT_EVOLVE_MIN_MEMORIES, 1, Number.MAX_SAFE_INTEGER),
      maxTokens: clampInt(evolve.maxTokens ?? DEFAULT_EVOLVE_MAX_TOKENS, 1, Number.MAX_SAFE_INTEGER),
      prompt
    }
  };
}
function clampInt(value, min, max) {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(max, Math.max(min, n));
}
function storedConfigPath() {
  return join2(dshHome(), PLUGIN_NAME, "config.json");
}
function loadStoredConfig() {
  const file = storedConfigPath();
  try {
    const raw = readFileSync(file, "utf8");
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
    evolve: { ...base.evolve, ...patch.evolve }
  };
}

// src/store.ts
import { existsSync, readFileSync as readFileSync2, readdirSync, statSync, unlinkSync, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join3 } from "node:path";
var ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
var PREVIEW_CHARS = 160;
var cache = /* @__PURE__ */ new Map();
function isValidId(id) {
  return typeof id === "string" && ID_PATTERN.test(id);
}
function generateId(title) {
  const slug = (title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  const stamp = Date.now().toString(36);
  return `${slug.length > 0 ? slug : "memory"}-${stamp}`;
}
function listMemories(root) {
  if (!existsSync(root)) return [];
  let names;
  try {
    names = readdirSync(root).filter((name2) => name2.endsWith(".md"));
  } catch {
    return [];
  }
  const result = [];
  for (const name2 of names) {
    const record = readMemoryFile(join3(root, name2));
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
  return readMemoryFile(join3(root, `${id}.md`));
}
function writeMemory(root, input) {
  ensureDir(root);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = isValidId(input.id) ? input.id : generateId(input.title);
  const file = join3(root, `${id}.md`);
  const existing = readMemoryFile(file);
  const record = {
    id,
    title: normalizeTitle(input.title, existing),
    tags: normalizeTags(input.tags, existing),
    created: existing?.created ?? now,
    updated: now,
    source: input.source ?? existing?.source ?? "manual",
    pinned: input.pinned ?? existing?.pinned ?? false,
    body: typeof input.body === "string" ? input.body : existing?.body ?? "",
    file
  };
  writeFileSync2(file, serializeDocument(record), "utf8");
  cache.set(file, { mtimeMs: mtimeOf(file), record });
  return record;
}
function deleteMemory(root, id) {
  if (!isValidId(id)) return false;
  const file = join3(root, `${id}.md`);
  cache.delete(file);
  if (!existsSync(file)) return false;
  try {
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}
function searchMemories(root, query, limit) {
  const terms = query.toLowerCase().split(/\s+/).map((term) => term.trim()).filter((term) => term.length > 0);
  const all = listMemories(root);
  if (terms.length === 0) return all.slice(0, limit);
  const scored = [];
  for (const summary of all) {
    const record = readMemoryFile(summary.file);
    if (record === void 0) continue;
    const haystackTitle = record.title.toLowerCase();
    const haystackTags = record.tags.join(" ").toLowerCase();
    const haystackBody = record.body.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (haystackTitle.includes(term)) score += 6;
      if (haystackTags.includes(term)) score += 4;
      if (haystackBody.includes(term)) score += 1;
    }
    if (score === 0) continue;
    scored.push({ score: score + (summary.pinned ? 1 : 0), summary });
  }
  scored.sort((a, b) => b.score - a.score || b.summary.updated.localeCompare(a.summary.updated));
  return scored.slice(0, limit).map((entry) => entry.summary);
}
function renderRecall(records, maxChars) {
  if (records.length === 0) return "";
  const lines = [
    "## \u957F\u671F\u8BB0\u5FC6\uFF08DreamAdmin\uFF09",
    "",
    "\u4EE5\u4E0B\u6761\u76EE\u6765\u81EA\u5F53\u524D\u5DE5\u4F5C\u533A\u7684\u957F\u671F\u8BB0\u5FC6\u5E93\uFF0C\u662F\u6B64\u524D\u4F1A\u8BDD\u6C89\u6DC0\u4E0B\u6765\u7684\u4E8B\u5B9E\u4E0E\u504F\u597D\uFF0C\u4F18\u5148\u4E8E\u4F60\u7684\u5148\u9A8C\u5047\u8BBE\u3002",
    "\u5982\u9700\u66F4\u7CBE\u786E\u7684\u5185\u5BB9\uFF0C\u7528 `memory_search` \u5DE5\u5177\u68C0\u7D22\uFF1B\u9700\u8981\u8BB0\u4F4F\u65B0\u4E8B\u5B9E\u65F6\u7528 `memory_save`\u3002",
    ""
  ];
  for (const record of records) {
    const flags = record.pinned ? " [\u7F6E\u9876]" : "";
    const tags = record.tags.length > 0 ? `\uFF08${record.tags.join(", ")}\uFF09` : "";
    lines.push(`- **${record.title}**${tags}${flags} \u2014 id: \`${record.id}\``);
    const body = record.body.trim();
    if (body.length > 0) lines.push(indent(truncate(body, 600)));
    lines.push("");
  }
  return truncate(lines.join("\n"), maxChars);
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
    file: record.file
  };
}
function readMemoryFile(file) {
  if (!existsSync(file)) {
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
    raw = readFileSync2(file, "utf8");
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
    file
  };
  cache.set(file, { mtimeMs, record });
  return record;
}
function mtimeOf(file) {
  return statSync(file).mtimeMs;
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
function sourceValue(value) {
  return value === "tool" || value === "evolve" || value === "import" ? value : "manual";
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
    `pinned: ${record.pinned ? "true" : "false"}`
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

// src/evolve.ts
var MAX_INPUT_MEMORIES = 60;
var MAX_INPUT_BODY_CHARS = 2e3;
var MAX_OPS = 50;
function skipped(reason, log, scanned = 0, route) {
  return { ok: false, reason, scanned, updated: 0, merged: 0, log, route };
}
function createEvolver(ctx, deps) {
  let running = false;
  let timer;
  let lastAutoRunAt = Date.now();
  const run = async (manual, fallbackRoute, signal) => {
    const cfg = deps.resolved().evolve;
    if (running) return skipped("busy", "\u4E0A\u4E00\u6B21\u8BB0\u5FC6\u68A6\u5883\u8FD8\u6CA1\u7ED3\u675F\uFF0C\u8DF3\u8FC7\u672C\u6B21\u3002");
    if (!manual && !cfg.enabled) return skipped("disabled", "\u8BB0\u5FC6\u68A6\u5883\u672A\u5F00\u542F\u3002");
    const configured = cfg.provider.length > 0 && cfg.model.length > 0;
    const route = configured ? { provider: cfg.provider, model: cfg.model } : fallbackRoute ?? { provider: "", model: "" };
    if (route.provider.length === 0 || route.model.length === 0) {
      return skipped("model_not_configured", "\u672A\u914D\u7F6E provider / model\uFF0C\u8BB0\u5FC6\u68A6\u5883\u672A\u6267\u884C\u3002");
    }
    const root = deps.resolveRoot();
    const summaries = listMemories(root);
    if (!manual && summaries.length < cfg.minMemories) {
      return skipped(
        "too_few_memories",
        `\u8BB0\u5FC6\u6761\u6570 ${summaries.length} \u5C11\u4E8E\u9608\u503C ${cfg.minMemories}\uFF0C\u8DF3\u8FC7\u8BB0\u5FC6\u68A6\u5883\u3002`,
        summaries.length,
        route
      );
    }
    if (summaries.length === 0) {
      return skipped("too_few_memories", "\u8BB0\u5FC6\u5E93\u4E3A\u7A7A\uFF0C\u65E0\u4E8B\u53EF\u505A\u3002", 0, route);
    }
    running = true;
    try {
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
      let text = "";
      for await (const chunk of ctx.llm.stream({
        provider: route.provider,
        model: route.model,
        system: cfg.prompt,
        messages: [{ role: "user", content: [{ type: "text", text: payload }] }],
        maxTokens: cfg.maxTokens,
        ...signal === void 0 ? {} : { signal }
      })) {
        if (chunk.type === "text-delta") text += chunk.text;
      }
      const parsed = extractJson(text);
      const ops = parsed === void 0 ? void 0 : parsed.ops;
      if (!Array.isArray(ops)) {
        return {
          ok: false,
          reason: "unparsable",
          scanned: records.length,
          updated: 0,
          merged: 0,
          route,
          log: `\u6A21\u578B\u6CA1\u6709\u8FD4\u56DE\u53EF\u89E3\u6790\u7684 ops JSON\uFF0C\u672C\u6B21\u672A\u6539\u52A8\u3002\u539F\u59CB\u8F93\u51FA\u524D 400 \u5B57\uFF1A
${text.slice(0, 400)}`
        };
      }
      let updated = 0;
      let merged = 0;
      const notes = [];
      for (const raw of ops.slice(0, MAX_OPS)) {
        const op = raw;
        const kind = typeof op.op === "string" ? op.op : "";
        if (kind === "update") {
          const id = typeof op.id === "string" ? op.id : "";
          const existing = readMemory(root, id);
          if (existing === void 0) continue;
          if (typeof op.body !== "string" || op.body.trim().length === 0) continue;
          writeMemory(root, {
            id,
            title: typeof op.title === "string" ? op.title : existing.title,
            tags: toStringArray(op.tags),
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
      if (manual) lastAutoRunAt = Date.now();
      const log = notes.length === 0 ? `\u626B\u63CF ${records.length} \u6761\uFF0C\u6A21\u578B\u8BA4\u4E3A\u65E0\u9700\u6539\u52A8\u3002` : `\u626B\u63CF ${records.length} \u6761\uFF0C\u6267\u884C ${notes.length} \u4E2A\u64CD\u4F5C\uFF1A
${notes.join("\n")}`;
      ctx.logger.info(`dream-admin: \u8BB0\u5FC6\u68A6\u5883\u5B8C\u6210 \u2014 ${log}`);
      return { ok: true, scanned: records.length, updated, merged, route, log };
    } catch (error) {
      const message2 = error instanceof Error ? error.message : String(error);
      ctx.logger.warn(`dream-admin: \u8BB0\u5FC6\u68A6\u5883\u5931\u8D25 \u2014 ${message2}`);
      return {
        ok: false,
        reason: "llm_error",
        scanned: 0,
        updated: 0,
        merged: 0,
        route,
        log: `\u8BB0\u5FC6\u68A6\u5883\u8C03\u7528\u5931\u8D25\uFF1A${message2}`
      };
    } finally {
      running = false;
    }
  };
  timer = setInterval(() => {
    const cfg = deps.resolved().evolve;
    if (!cfg.enabled) return;
    if (Date.now() - lastAutoRunAt < cfg.intervalMinutes * 6e4) return;
    lastAutoRunAt = Date.now();
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

// src/commands.ts
var COMMAND_NAME = "memoryup";
var USAGE = "\u7528\u6CD5\uFF1A/memoryup\uFF08\u4E0D\u9700\u8981\u53C2\u6570\uFF09";
function registerMemoryCommand(ctx, deps) {
  const fiber = ctx.inject(["commands"], (commandCtx) => {
    const registry = commandCtx.commands;
    if (registry === void 0) return;
    commandCtx.effect(
      () => registry.register({
        name: COMMAND_NAME,
        description: "\u7ACB\u5373\u6574\u7406\u4E00\u6B21\u8BB0\u5FC6",
        handler: async ({ agent, rawInput, signal }) => {
          if (rawInput.trim().length > 0) return { kind: "error", text: USAGE };
          const outcome = await deps.evolver.run(true, currentRoute(agent), signal);
          if (signal.aborted) return { kind: "error", text: "\u8BB0\u5FC6\u6574\u7406\u5DF2\u53D6\u6D88\u3002" };
          return settle(outcome);
        }
      }),
      "dream-admin: /memoryup"
    );
  });
  return () => {
    void fiber.dispose();
  };
}
function currentRoute(agent) {
  const config = agent.session.requestHeader()?.config;
  if (config === void 0) return void 0;
  const provider = typeof config.provider === "string" ? config.provider : "";
  const model = typeof config.model === "string" ? config.model : "";
  if (provider.length === 0 || model.length === 0) return void 0;
  return { provider, model };
}
function settle(outcome) {
  const prefix = outcome.route === void 0 ? "" : `\u6A21\u578B ${outcome.route.provider}/${outcome.route.model}\uFF1A`;
  switch (outcome.reason) {
    case void 0:
      return { kind: "success", text: `${prefix}${outcome.log}` };
    case "too_few_memories":
      return { kind: "success", text: outcome.log };
    case "busy":
      return { kind: "error", text: "\u4E0A\u4E00\u6B21\u8BB0\u5FC6\u6574\u7406\u8FD8\u6CA1\u7ED3\u675F\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002" };
    case "model_not_configured":
      return {
        kind: "error",
        text: "\u6CA1\u6709\u53EF\u7528\u7684\u6A21\u578B\uFF1A\u8BF7\u5728\u8BBE\u7F6E\u91CC\u4E3A\u8BB0\u5FC6\u68A6\u5883\u9009\u62E9\u6A21\u578B\uFF0C\u6216\u5728\u4E00\u4E2A\u5DF2\u7ECF\u7528\u8FC7\u6A21\u578B\u7684\u4F1A\u8BDD\u91CC\u6267\u884C\u3002"
      };
    case "disabled":
      return { kind: "error", text: "\u8BB0\u5FC6\u68A6\u5883\u672A\u5F00\u542F\u3002" };
    case "llm_error":
    case "unparsable":
      return { kind: "error", text: `${prefix}${outcome.log}` };
  }
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
        const items = listWorkspaces(deps.sessions());
        json(res, 200, {
          items,
          active: resolveRoot(),
          global: globalMemoryRoot()
        });
      }
    }),
    ctx.webServer.register({
      kind: "exact",
      path: `/${PLUGIN_NAME}/memories`,
      handler: (req, res) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const workspace = optional(url.searchParams.get("workspace"));
        const query = optional(url.searchParams.get("q"));
        const limit = clampLimit(url.searchParams.get("limit"), 200);
        const root = resolveRoot(workspace);
        const items = query !== void 0 ? searchMemories(root, query, limit) : listMemories(root).slice(0, limit);
        json(res, 200, { root, items });
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
            const targetRoot = resolveRoot(
              typeof body.workspace === "string" ? body.workspace : workspace
            );
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
              source: "manual"
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
      path: `/${PLUGIN_NAME}/evolve`,
      handler: async (req, res) => {
        if (req.method !== "POST") {
          json(res, 405, { error: "method not allowed" });
          return;
        }
        const outcome = await deps.evolver.run(true);
        json(res, outcome.ok ? 200 : 409, outcome);
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
    evolve: cfg.evolve,
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
  return new Promise((resolve2) => {
    let data = "";
    req.on("data", (chunk) => {
      if (chunk) data += chunk.toString("utf8");
    });
    req.on("end", () => resolve2(data));
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

// src/tools.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
function fail(message2) {
  throw new Error(message2);
}
function failureLine(id, send, site) {
  return `ERROR: memory/read_failed \u2014 id=${id} cmd=${send} site=${site}`;
}
function summaryLine(index, id, title, tags, pinned, updated) {
  const flags = pinned ? " [\u7F6E\u9876]" : "";
  const tagText = tags.length > 0 ? ` (${tags.join(", ")})` : "";
  return `${index + 1}. ${title}${tagText}${flags} \u2014 id: ${id} \u2014 \u66F4\u65B0\u4E8E ${updated}`;
}
function registerMemoryTools(ctx, deps) {
  const disposers = [];
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: "memory_save",
        description: "\u628A\u4E00\u6761\u957F\u671F\u8BB0\u5FC6\u5199\u5165\u5F53\u524D\u5DE5\u4F5C\u533A\u7684\u8BB0\u5FC6\u5E93\uFF08Markdown + frontmatter\uFF0C\u7528\u6237\u53EF\u5728 DreamAdmin \u8BB0\u5FC6\u7BA1\u7406\u9875\u7F16\u8F91\uFF09\u3002\u9002\u7528\u4E8E\u7528\u6237\u660E\u786E\u8868\u8FBE\u7684\u504F\u597D\u3001\u9879\u76EE\u7EA6\u5B9A\u3001\u5173\u952E\u4E8B\u5B9E\u4E0E\u7ED3\u8BBA\u3002\u4F20 id \u65F6\u8986\u76D6\u540C\u4E00\u6761\u8BB0\u5FC6\u3002",
        parameters: {
          body: { type: "string", required: true, description: "\u8BB0\u5FC6\u6B63\u6587\uFF08Markdown\uFF09\u3002" },
          title: { type: "string", description: "\u77ED\u6807\u9898\uFF1B\u7701\u7565\u65F6\u6CBF\u7528\u5DF2\u6709\u6807\u9898\u6216\u300C\u672A\u547D\u540D\u8BB0\u5FC6\u300D\u3002" },
          tags: { type: "array", items: { type: "string" }, description: "\u6807\u7B7E\uFF0C\u4FBF\u4E8E\u68C0\u7D22\u3002" },
          id: { type: "string", description: "\u8981\u8986\u76D6\u7684\u8BB0\u5FC6 id\uFF1B\u7701\u7565\u5219\u65B0\u5EFA\u3002" },
          pinned: { type: "boolean", description: "\u662F\u5426\u7F6E\u9876\uFF08\u7F6E\u9876\u6761\u76EE\u5FC5\u5B9A\u53C2\u4E0E\u7CFB\u7EDF\u63D0\u793A\u53EC\u56DE\uFF09\u3002" },
          workspace: { type: "string", description: "\u5DE5\u4F5C\u533A\u7EDD\u5BF9\u8DEF\u5F84\uFF1B\u7701\u7565\u65F6\u7528\u5F53\u524D\u6D3B\u8DC3\u5DE5\u4F5C\u533A\u3002" }
        },
        output: {
          schema: { type: "string" },
          render: (_args, value) => [{ type: "text", text: value }]
        },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
          if (exec.signal.aborted) fail("memory_save \u5DF2\u53D6\u6D88");
          const root = deps.resolveRoot(args.workspace);
          const record = writeMemory(root, {
            id: args.id,
            title: args.title,
            body: args.body,
            tags: args.tags,
            pinned: args.pinned,
            source: "tool"
          });
          return `\u5DF2\u4FDD\u5B58\u8BB0\u5FC6 "${record.title}"\uFF08id: ${record.id}\uFF09
\u76EE\u5F55\uFF1A${root}
\u6587\u4EF6\uFF1A${record.file}`;
        }
      })
    )
  );
  disposers.push(
    ctx.tools.register(
      defineTool({
        name: "memory_search",
        description: "\u5728\u5F53\u524D\u5DE5\u4F5C\u533A\u7684\u957F\u671F\u8BB0\u5FC6\u5E93\u91CC\u505A\u5173\u952E\u8BCD\u68C0\u7D22\uFF08\u5339\u914D\u6807\u9898 / \u6807\u7B7E / \u6B63\u6587\uFF09\u3002\u7CFB\u7EDF\u63D0\u793A\u91CC\u53EA\u6CE8\u5165\u4E86\u6700\u8FD1\u7684\u5C11\u91CF\u8BB0\u5FC6\uFF0C\u9700\u8981\u7CBE\u786E\u627E\u67D0\u6761\u5386\u53F2\u7ED3\u8BBA\u65F6\u7528\u8FD9\u4E2A\u5DE5\u5177\u3002",
        parameters: {
          query: { type: "string", required: true, description: "\u68C0\u7D22\u5173\u952E\u8BCD\uFF0C\u7A7A\u683C\u5206\u9694\u591A\u4E2A\u8BCD\u3002" },
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
          const hits = searchMemories(root, args.query, limit);
          if (hits.length === 0) return `\u8BB0\u5FC6\u5E93\uFF08${root}\uFF09\u4E2D\u6CA1\u6709\u5339\u914D "${args.query}" \u7684\u6761\u76EE\u3002`;
          const lines = hits.map(
            (hit, index) => summaryLine(index, hit.id, hit.title, hit.tags, hit.pinned, hit.updated) + (hit.preview.length > 0 ? `
   \u6458\u8981\uFF1A${hit.preview}` : "")
          );
          return `\u5339\u914D ${hits.length} \u6761\uFF1A
${lines.join("\n")}

\u7528 memory_list \u6216\u76F4\u63A5\u8BFB\u53D6\u6587\u4EF6\u67E5\u770B\u5168\u6587\u3002`;
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
          const lines = all.slice(0, limit).map((item, index) => summaryLine(index, item.id, item.title, item.tags, item.pinned, item.updated));
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
        evolve: sectionValue(config.evolve)
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
    store: () => resolved().store,
    sessions: () => ctx.sessions.list()
  });
  const applyOverride = (patch) => {
    runtimeOverride = mergeConfig(runtimeOverride ?? {}, patch);
    return runtimeOverride;
  };
  const evolver = createEvolver(ctx, { resolved, resolveRoot });
  const disposeRoutes = registerRoutes(ctx, {
    resolved,
    currentOverride: () => runtimeOverride ?? {},
    applyOverride,
    resolveRoot,
    sessions: () => ctx.sessions.list(),
    evolver
  });
  const disposeTools = registerMemoryTools(ctx, { resolved, resolveRoot });
  const disposeCommand = registerMemoryCommand(ctx, { evolver });
  const disposeRecall = installRecall(ctx, {
    resolved,
    resolveRoot,
    currentRoot: () => resolveRoot()
  });
  ctx.effect(
    () => () => {
      disposeRoutes();
      disposeTools();
      disposeCommand();
      disposeRecall();
      evolver.dispose();
    },
    "dream-admin: \u8DEF\u7531 / \u5DE5\u5177 / \u547D\u4EE4 / \u53EC\u56DE / \u8BB0\u5FC6\u68A6\u5883 \u751F\u547D\u5468\u671F"
  );
  const cfg = resolved();
  ctx.logger.info(
    `dream-admin \u5DF2\u52A0\u8F7D\uFF08\u4F5C\u7528\u57DF: ${cfg.store.scope}\uFF0C\u76EE\u5F55: ${cfg.store.dir}\uFF0C\u53EC\u56DE: ${cfg.recall.enabled ? `\u5F00(${cfg.recall.limit})` : "\u5173"}\uFF0C\u8BB0\u5FC6\u68A6\u5883: ${cfg.evolve.enabled ? `\u5F00(${cfg.evolve.provider}/${cfg.evolve.model})` : "\u5173"}\uFF0C\u5F53\u524D\u8BB0\u5FC6\u6839: ${resolveRoot()}\uFF09`
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
