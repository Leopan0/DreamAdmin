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
 * 关键词打分：BM25 + 中英文分词。
 *
 * 中文按二字滑窗切分，因此「包管理」能命中「包管理器」这类部分词 / 词序变化，
 * 比原来的子串匹配更接近语义召回；标题 / 标签 / 摘要 / 正文分别加权。
 *
 * @returns id → 分数；无命中时为空 Map。
 */
export declare function scoreMemories(root: string, query: string): Map<string, number>;
/** 本地关键词检索：按 BM25 分数取前 limit 条；空查询返回最近的记忆。 */
export declare function searchMemories(root: string, query: string, limit: number): MemorySummary[];
/**
 * 依据记忆生成一段注入系统提示的文本。
 *
 * 分层注入：只给标题 / 标签 / 摘要（每条约几十 token），正文留在记忆库里，
 * 由模型用 `memory_read` 按需读取，避免把整段正文塞进每个模型轮次。
 */
export declare function renderRecall(records: MemoryRecord[], maxChars: number): string;
/**
 * 从正文里提取一句话摘要：去掉代码块与 Markdown 记号，取首句，超长截断。
 * 这是「模型没有生成 summary」时的零成本兜底。
 */
export declare function deriveSummary(body: string, maxChars?: number): string;
/** 按字符数截断，超出时补省略号。 */
export declare function truncate(text: string, maxChars: number): string;
