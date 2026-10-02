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
/** 判断 id 是否合法。 */
export declare function isValidId(id: unknown): id is string;
/** 由标题生成一个文件名安全的 id。 */
export declare function generateId(title: string | undefined): string;
/** 列出目录下全部记忆摘要，按 updated 倒序。 */
export declare function listMemories(root: string): MemorySummary[];
/** 读取一条记忆；不存在或损坏时返回 undefined。 */
export declare function readMemory(root: string, id: string): MemoryRecord | undefined;
/**
 * 写入（新建或覆盖）一条记忆。
 *
 * - `input.id` 命中已有条目时保留 `created`，刷新 `updated`；
 * - 未给 `id` 或 id 非法时按标题生成。
 *
 * @returns 写盘后的记录。
 */
export declare function writeMemory(root: string, input: MemoryWriteInput): MemoryRecord;
/** 删除一条记忆。返回是否真的删掉了。 */
export declare function deleteMemory(root: string, id: string): boolean;
/**
 * 关键词检索：对 title / tags / body 做大小写不敏感的多词命中打分。
 * 置顶条目获得固定加成，同分按 updated 倒序。
 */
export declare function searchMemories(root: string, query: string, limit: number): MemorySummary[];
/** 依据记忆生成一段注入系统提示的文本。 */
export declare function renderRecall(records: MemoryRecord[], maxChars: number): string;
/** 按字符数截断，超出时补省略号。 */
export declare function truncate(text: string, maxChars: number): string;
