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
 *   source: "manual" | "tool" | "evolve"
 *   pinned: false
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
export type MemorySource = 'manual' | 'tool' | 'evolve' | 'import';

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
  /** 该记忆对应的绝对文件路径。 */
  file: string;
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
  file: string;
}

/** 新建 / 更新记忆的入参。 */
export interface MemoryWriteInput {
  id?: string;
  title?: string;
  body: string;
  tags?: string[];
  pinned?: boolean;
  source?: MemorySource;
}

/** 合法的记忆 id：足够安全，可以直接当文件名。 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;

/** 正文预览长度（字符）。 */
const PREVIEW_CHARS = 160;

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

  const record: MemoryRecord = {
    id,
    title: normalizeTitle(input.title, existing),
    tags: normalizeTags(input.tags, existing),
    created: existing?.created ?? now,
    updated: now,
    source: input.source ?? existing?.source ?? 'manual',
    pinned: input.pinned ?? existing?.pinned ?? false,
    body: typeof input.body === 'string' ? input.body : (existing?.body ?? ''),
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
 * 关键词检索：对 title / tags / body 做大小写不敏感的多词命中打分。
 * 置顶条目获得固定加成，同分按 updated 倒序。
 */
export function searchMemories(root: string, query: string, limit: number): MemorySummary[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
  const all = listMemories(root);
  if (terms.length === 0) return all.slice(0, limit);

  const scored: Array<{ score: number; summary: MemorySummary }> = [];
  for (const summary of all) {
    const record = readMemoryFile(summary.file);
    if (record === undefined) continue;
    const haystackTitle = record.title.toLowerCase();
    const haystackTags = record.tags.join(' ').toLowerCase();
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
  scored.sort((a, b) => (b.score - a.score) || b.summary.updated.localeCompare(a.summary.updated));
  return scored.slice(0, limit).map((entry) => entry.summary);
}

/** 依据记忆生成一段注入系统提示的文本。 */
export function renderRecall(records: MemoryRecord[], maxChars: number): string {
  if (records.length === 0) return '';
  const lines: string[] = [
    '## 长期记忆（DreamAdmin）',
    '',
    '以下条目来自当前工作区的长期记忆库，是此前会话沉淀下来的事实与偏好，优先于你的先验假设。',
    '如需更精确的内容，用 `memory_search` 工具检索；需要记住新事实时用 `memory_save`。',
    ''
  ];
  for (const record of records) {
    const flags = record.pinned ? ' [置顶]' : '';
    const tags = record.tags.length > 0 ? `（${record.tags.join(', ')}）` : '';
    lines.push(`- **${record.title}**${tags}${flags} — id: \`${record.id}\``);
    const body = record.body.trim();
    if (body.length > 0) lines.push(indent(truncate(body, 600)));
    lines.push('');
  }
  return truncate(lines.join('\n'), maxChars);
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
    file: record.file
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
    file
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

/** 把 meta 里可能出现的枚举值收敛到 MemorySource。 */
function sourceValue(value: unknown): MemorySource {
  return value === 'tool' || value === 'evolve' || value === 'import' ? value : 'manual';
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
    `pinned: ${record.pinned ? 'true' : 'false'}`
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
