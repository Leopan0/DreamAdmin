/** 一个可作为记忆根父目录的工作区候选。 */
export interface WorkspaceRef {
    /** 工作区绝对路径。 */
    path: string;
    /** 展示名（路径最后一段）。 */
    name: string;
    /** 该候选的来源。 */
    source: 'session' | 'default';
}
/** DSH 数据目录。优先 `DSH_HOME`，否则退回 `~/.dsh`。 */
export declare function dshHome(): string;
/** 全局（跨工作区）记忆根目录；`dir` 为绝对路径时直接采用该目录。 */
export declare function globalMemoryRoot(dir?: string): string;
/** 递归创建目录并返回它。 */
export declare function ensureDir(dir: string): string;
/** 判断一个值是否是可用的绝对路径字符串。 */
export declare function isAbsolutePath(value: unknown): value is string;
/** 取路径最后一段作为展示名。 */
export declare function displayName(dir: string): string;
/**
 * 计算工作区模式下记忆根目录的落点。
 * `dir` 是绝对路径时直接用它；否则接在工作区路径下。
 */
export declare function workspaceMemoryRoot(workspace: string, dir: string): string;
/**
 * 从会话列表中提取去重后的工作区候选（按会话创建时间倒序）。
 * `sessions` 是 `ctx.sessions.list()` 的返回值；这里只做结构读取，不做类型断言。
 */
export declare function listWorkspaces(sessions: unknown): WorkspaceRef[];
/** 触发点上下文依赖面：解析根目录需要的全部信息。 */
export interface RootResolverDeps {
    /** 当前解析后的存储策略。 */
    store: () => {
        dir: string;
        scope: 'workspace' | 'global';
    };
    /** 当前活着的会话列表（惰性求值）。 */
    sessions: () => unknown;
}
/** 记忆根目录解析器。 */
export type RootResolver = (workspace?: string) => string;
/** 构造一个记忆根目录解析器。 */
export declare function createRootResolver(deps: RootResolverDeps): RootResolver;
