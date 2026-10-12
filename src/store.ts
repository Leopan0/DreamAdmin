/**
 * 记忆库：一个目录下的一堆 Markdown 文件，每份带 YAML frontmatter。
 *
 * 选这个格式的理由：人可以直接读、可以进 git、可以用任何编辑器改（需求 5
 * 「记忆可以受用户的编辑」不需要专门的 UI 才能成立）。
 *
 *   ---
 *   id: "mem-..."
 *   title: "..."
 *   tags: ["a", "b"]
 *   created: "2026-10-02T07:00:00.000Z"
 *   updated: "2026-10-02T07:00:00.000Z"
 *   source: "manual" | "tool" | "auto" | "evolve"
 *   pinned: false
 *   workspace: "<工作区绝对路径，可选>"
 *   peer: "<工作区逻辑身份，可选>"
 *   summary: "<一句话摘要，可选；缺失时由正文首句推导>"
 *   ---
 *   正文……
 *
 * frontmatter 的读写用最小实现（不引第三方 YAML）：值按 JSON 标量写出，
 * 因此含中文、引号、冒号的内容都能无损往返。
 *
 * @module dream-admin/store
 */
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureDir } from './paths.js';

/** 记忆的来源。 */
export type MemorySource = 'manual' | 'tool' | 'auto' | 'evolve' | 'import';

/** 完整的一条记忆。 */
export interface MemoryRecord {
  id: string;
  title: string;
  tags: string[];
  created: string;
  updated: string;
  source: MemorySource;
  pinned: boolean;
  body: string;
  /** 一句话摘要；分层召回只注入它，正文留给 `memory_read` 按需读取。 */
  summary: string;
  /** 该记忆对应的绝对文件路径。 */
  file: string;
  /** 记忆归属的工作区绝对路径；空表示默认 / 全局。 */
  workspace?: string;
  /** 工作区逻辑身份；同一仓库的多个 clone / worktree 共用。 */
  peer?: string;
}

/** 列表用的轻量摘要（含正文预览）。 */
export interface MemorySummary {
  id: string;
  title: string;
  tags: string[];
  created: string;
  updated: string;
  source: MemorySource;
  pinned: boolean;
  preview: string;
  /** 一句话摘要（缺失时由正文首句推导）。 */
  summary: string;
  file: string;
  /** 记忆归属的工作区绝对路径；空表示默认 / 全局。 */
  workspace?: string;
  /** 工作区逻辑身份；同一仓库的多个 clone / worktree 共用。 */
  peer?: string;
}

/** 新建 / 更新记忆的入参。 */
export interface MemoryWriteInput {
  id?: string;
  title?: string;
  body: string;
  tags?: string[];
  pinned?: boolean;
  source?: MemorySource;
  /** 归属工作区绝对路径；省略时沿用旧值。 */
  workspace?: string;
  /** 工作区逻辑身份；省略时沿用旧值。 */
  peer?: string;
  /** 一句话摘要；省略时沿用旧值，仍没有则从正文首句推导。 */
  summary?: string;
}

/** 合法的记忆 id：足够安全，可以直接当文件名。 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

/** 正文预览长度（字符）。 */
const PREVIEW_CHARS = 160;

/** 摘要长度上限（字符）。 */
const SUMMARY_CHARS = 160;

/** 关键词检索时正文参与打分的字符上限，避免超长正文拖慢每次召回。 */
const MAX_SEARCH_BODY_CHARS = 8000;

/**
 * 解析结果缓存：key 是文件绝对路径，value 带 mtime 用于失效判断。
 * 目录里文件数通常很小，但召回会在每个模型轮次跑一次，缓存让常态变成 stat。
 */
const cache = new Map<string, { mtimeMs: number; record: MemoryRecord }>();

/** 判断 id 是否合法。 */
export function isValidId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

/** 由标题生成一个文件名安全的 id。 */
export function generateId(title: string | undefined): string {
  const slug = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const stamp = Date.now().toString(36);
  return `${slug.length > 0 ? slug : 'memory'}-${stamp}`;
}

/** 列出目录下全部记忆摘要，按 updated 倒序。 */
export function listMemories(root: string): MemorySummary[] {
  if (!existsSync(root)) return [];
  let names: string[];
  try {
    names = readdirSync(root).filter((name) => name.endsWith('.md'));
  } catch {
    return [];
  }
  const result: MemorySummary[] = [];
  for (const name of names) {
    const record = readMemoryFile(join(root, name));
    if (record === undefined) continue;
    result.push(toSummary(record));
  }
  result.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updated.localeCompare(a.updated);
  });
  return result;
}

/** 读取一条记忆；不存在或损坏时返回 undefined。 */
export function readMemory(root: string, id: string): MemoryRecord | undefined {
  if (!isValidId(id)) return undefined;
  return readMemoryFile(join(root, `${id}.md`));
}

/**
 * 写入（新建或覆盖）一条记忆。
 *
 * - `input.id` 命中已有条目时保留 `created`，刷新 `updated`；
 * - 未给 `id` 或 id 非法时按标题生成。
 *
 * @returns 写盘后的记录。
 */
export function writeMemory(root: string, input: MemoryWriteInput): MemoryRecord {
  ensureDir(root);
  const now = new Date().toISOString();
  const id = isValidId(input.id) ? input.id : generateId(input.title);
  const file = join(root, `${id}.md`);
  const existing = readMemoryFile(file);

  const body = typeof input.body === 'string' ? input.body : (existing?.body ?? '');
  const record: MemoryRecord = {
    id,
    title: normalizeTitle(input.title, existing),
    tags: normalizeTags(input.tags, existing),
    created: existing?.created ?? now,
    updated: now,
    source: input.source ?? existing?.source ?? 'manual',
    pinned: input.pinned ?? existing?.pinned ?? false,
    body,
    summary: normalizeSummary(input.summary, existing, body),
    workspace: normalizeWorkspace(input.workspace, existing),
    peer: normalizePeer(input.peer, existing),
    file
  };

  writeFileSync(file, serializeDocument(record), 'utf8');
  cache.set(file, { mtimeMs: mtimeOf(file), record });
  return record;
}

/** 删除一条记忆。返回是否真的删掉了。 */
export function deleteMemory(root: string, id: string): boolean {
  if (!isValidId(id)) return false;
  const file = join(root, `${id}.md`);
  cache.delete(file);
  if (!existsSync(file)) return false;
  try {
    unlinkSync(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * 关键词打分：BM25 + 中英文分词。
 *
 * 中文按二字滑窗切分，因此「包管理」能命中「包管理器」这类部分词 / 词序变化，
 * 比原来的子串匹配更接近语义召回；标题 / 标签 / 摘要 / 正文分别加权。
 *
 * @returns id → 分数；无命中时为空 Map。
 */
export function scoreMemories(root: string, query: string): Map<string, number> {
  const queryTokens = unique(tokenize(query));
  const scores = new Map<string, number>();
  if (queryTokens.length === 0) return scores;

  const docs: Array<{ id: string; fields: string[][]; length: number }> = [];
  for (const summary of listMemories(root)) {
    const record = readMemoryFile(summary.file);
    if (record === undefined) continue;
    const fields = [
      tokenize(record.title),
      tokenize(record.tags.join(' ')),
      tokenize(record.summary),
      tokenize(record.body.slice(0, MAX_SEARCH_BODY_CHARS))
    ];
    docs.push({ id: record.id, fields, length: fields.reduce((sum, field) => sum + field.length, 0) });
  }
  if (docs.length === 0) return scores;

  const weights = [4, 3, 2, 1];
  const avgLength = docs.reduce((sum, doc) => sum + doc.length, 0) / docs.length || 1;
  const documentFreq = new Map<string, number>();
  for (const doc of docs) {
    const seen = new Set<string>();
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
      score += idf * ((weighted * (k1 + 1)) / (weighted + k1 * norm));
    }
    if (score > 0) scores.set(doc.id, score);
  }
  return scores;
}

/** 本地关键词检索：按 BM25 分数取前 limit 条；空查询返回最近的记忆。 */
export function searchMemories(root: string, query: string, limit: number): MemorySummary[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return listMemories(root).slice(0, limit);
  const scores = scoreMemories(root, trimmed);
  if (scores.size === 0) return [];
  const byId = new Map(listMemories(root).map((summary) => [summary.id, summary]));
  return [...scores.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return (byId.get(b[0])?.updated ?? '').localeCompare(byId.get(a[0])?.updated ?? '');
    })
    .map(([id]) => byId.get(id))
    .filter((summary): summary is MemorySummary => summary !== undefined)
    .slice(0, limit);
}

/** 分词：拉丁词按非字母数字切分并拆开连接符；中日文按二字滑窗切分。 */
function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
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

/** 统计 token 在数组里出现的次数。 */
function countOccurrences(tokens: string[], target: string): number {
  let count = 0;
  for (const token of tokens) if (token === target) count += 1;
  return count;
}

/** 去重，保持首次出现的顺序。 */
function unique(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

/**
 * 依据记忆生成一段注入系统提示的文本。
 *
 * 分层注入：只给标题 / 标签 / 摘要（每条约几十 token），正文留在记忆库里，
 * 由模型用 `memory_read` 按需读取，避免把整段正文塞进每个模型轮次。
 */
export function renderRecall(records: MemoryRecord[], maxChars: number): string {
  if (records.length === 0) return '';
  const lines: string[] = [
    '## 长期记忆（DreamAdmin）',
    '',
    '以下条目来自长期记忆库，是此前会话沉淀下来的事实与偏好，优先于你的先验假设。',
    '这里只给摘要；需要正文时用 `memory_read` 按 id 读取，或先 `memory_search` 检索。',
    ''
  ];
  for (const record of records) {
    const flags = record.pinned ? ' [置顶]' : '';
    const tags = record.tags.length > 0 ? `（${record.tags.join(', ')}）` : '';
    lines.push(`- **${record.title}**${tags}${flags} — id: \`${record.id}\`${scopeSuffix(record)}`);
    const summary = record.summary.trim() || deriveSummary(record.body);
    if (summary.length > 0) lines.push(indent(summary));
    lines.push('');
  }
  return truncate(lines.join('\n'), maxChars);
}

/** 归属提示：优先显示工作区末段名，其次显示 peer。 */
function scopeSuffix(record: MemoryRecord): string {
  if (record.workspace !== undefined && record.workspace.length > 0) {
    return ` — 工作区: ${lastSegment(record.workspace)}`;
  }
  if (record.peer !== undefined && record.peer.length > 0) return ` — 工作区: ${record.peer}`;
  return '';
}

/** 取路径最后一段作为展示名。 */
function lastSegment(value: string): string {
  const parts = value.split(/[\\/]/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? value;
}

/** 取摘要。 */
function toSummary(record: MemoryRecord): MemorySummary {
  return {
    id: record.id,
    title: record.title,
    tags: record.tags,
    created: record.created,
    updated: record.updated,
    source: record.source,
    pinned: record.pinned,
    preview: truncate(record.body.replace(/\s+/g, ' ').trim(), PREVIEW_CHARS),
    summary: record.summary,
    file: record.file,
    workspace: record.workspace,
    peer: record.peer
  };
}

/** 带 mtime 缓存地读取并解析一个 .md 文件。 */
function readMemoryFile(file: string): MemoryRecord | undefined {
  if (!existsSync(file)) {
    cache.delete(file);
    return undefined;
  }
  let mtimeMs: number;
  try {
    mtimeMs = mtimeOf(file);
  } catch {
    return undefined;
  }
  const hit = cache.get(file);
  if (hit !== undefined && hit.mtimeMs === mtimeMs) return hit.record;

  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const { meta, body } = parseDocument(raw);
  const id = isValidId(meta.id) ? meta.id : null;
  if (id === null) return undefined;

  const record: MemoryRecord = {
    id,
    title: stringValue(meta.title) ?? id,
    tags: arrayValue(meta.tags),
    created: stringValue(meta.created) ?? '',
    updated: stringValue(meta.updated) ?? '',
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

/** 取文件 mtime（毫秒）。 */
function mtimeOf(file: string): number {
  return statSync(file).mtimeMs;
}

/** 归一化标题：显式给了就用，否则沿用旧值，再否则取正文首行。 */
function normalizeTitle(title: string | undefined, existing: MemoryRecord | undefined): string {
  if (typeof title === 'string' && title.trim().length > 0) return title.trim();
  if (existing !== undefined) return existing.title;
  return '未命名记忆';
}

/** 归一化标签：显式给了就用（去重去空），否则沿用旧值。 */
function normalizeTags(tags: string[] | undefined, existing: MemoryRecord | undefined): string[] {
  if (!Array.isArray(tags)) return existing?.tags ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== 'string') continue;
    const value = tag.trim();
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

/** 归一化归属工作区：显式给了就用（去空），否则沿用旧值。 */
function normalizeWorkspace(
  workspace: string | undefined,
  existing: MemoryRecord | undefined
): string | undefined {
  if (typeof workspace === 'string' && workspace.trim().length > 0) return workspace.trim();
  return existing?.workspace;
}

/** 归一化 peer：显式给了就用（去空），否则沿用旧值。 */
function normalizePeer(peer: string | undefined, existing: MemoryRecord | undefined): string | undefined {
  if (typeof peer === 'string' && peer.trim().length > 0) return peer.trim();
  return existing?.peer;
}

/** 归一化摘要：显式给了就用；正文没变则沿用旧摘要；否则从正文首句推导。 */
function normalizeSummary(
  summary: string | undefined,
  existing: MemoryRecord | undefined,
  body: string
): string {
  if (typeof summary === 'string' && summary.trim().length > 0) {
    return truncate(summary.replace(/\s+/g, ' ').trim(), SUMMARY_CHARS);
  }
  if (existing !== undefined && existing.body === body && existing.summary.length > 0) return existing.summary;
  const derived = deriveSummary(body);
  return derived.length > 0 ? derived : (existing?.summary ?? '');
}

/**
 * 从正文里提取一句话摘要：去掉代码块与 Markdown 记号，取首句，超长截断。
 * 这是「模型没有生成 summary」时的零成本兜底。
 */
export function deriveSummary(body: string, maxChars = SUMMARY_CHARS): string {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[#>*+-]|\d+\.)\s*/, '').trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length === 0) return '';
  const sentence = text.match(/^[\s\S]*?[。！？!?；;.]/)?.[0] ?? text;
  return truncate(sentence.trim(), maxChars);
}

/** 把 meta 里可能出现的枚举值收敛到 MemorySource。 */
function sourceValue(value: unknown): MemorySource {
  return value === 'tool' || value === 'auto' || value === 'evolve' || value === 'import' ? value : 'manual';
}

/** 取字符串型 meta 值。 */
function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** 取字符串数组型 meta 值。 */
function arrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/* ------------------------------------------------------------------ *
 * 最小 frontmatter 读写
 * ------------------------------------------------------------------ */

type MetaValue = string | boolean | number | string[];
type Meta = Record<string, MetaValue>;

/** 解析一份带 frontmatter 的 Markdown 文档。 */
function parseDocument(raw: string): { meta: Meta; body: string } {
  const text = raw.replace(/^\uFEFF/, '');
  if (!text.startsWith('---')) return { meta: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { meta: {}, body: text };

  const head = text.slice(3, end);
  let cursor = end + 4;
  if (text[cursor] === '\r') cursor += 1;
  if (text[cursor] === '\n') cursor += 1;
  return { meta: parseMeta(head), body: text.slice(cursor) };
}

/** 逐行解析 frontmatter（只支持本模块自己写出的形状）。 */
function parseMeta(head: string): Meta {
  const meta: Meta = {};
  for (const line of head.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const colon = trimmed.indexOf(':');
    if (colon <= 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const rawValue = trimmed.slice(colon + 1).trim();
    if (key.length === 0) continue;
    meta[key] = parseValue(rawValue);
  }
  return meta;
}

/** 解析单个标量 / 内联数组。 */
function parseValue(raw: string): MetaValue {
  if (raw.startsWith('[') && raw.endsWith(']')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
      // 落回逐项拆分
    }
    return raw
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // 落回原文
    }
  }
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

/** 把一条记录序列化成 Markdown 文本。 */
function serializeDocument(record: MemoryRecord): string {
  const meta = [
    `id: ${JSON.stringify(record.id)}`,
    `title: ${JSON.stringify(record.title)}`,
    `tags: [${record.tags.map((tag) => JSON.stringify(tag)).join(', ')}]`,
    `created: ${JSON.stringify(record.created)}`,
    `updated: ${JSON.stringify(record.updated)}`,
    `source: ${JSON.stringify(record.source)}`,
    `pinned: ${record.pinned ? 'true' : 'false'}`,
    ...(record.workspace === undefined ? [] : [`workspace: ${JSON.stringify(record.workspace)}`]),
    ...(record.peer === undefined ? [] : [`peer: ${JSON.stringify(record.peer)}`]),
    ...(record.summary.length === 0 ? [] : [`summary: ${JSON.stringify(record.summary)}`])
  ].join('\n');
  const body = record.body.endsWith('\n') ? record.body : record.body + '\n';
  return `---\n${meta}\n---\n${body}`;
}

/** 按字符数截断，超出时补省略号。 */
export function truncate(text: string, maxChars: number): string {
  if (maxChars <= 0) return text;
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

/** 给多行文本加两空格缩进，让它挂在列表项下面。 */
function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? `  ${line}` : line))
    .join('\n');
}
