/** 一个可作为记忆根父目录的工作区候选。 */
export interface WorkspaceRef {
    /** 工作区绝对路径。 */
    path: string;
    /** 展示名（工作区标题，缺失时取路径最后一段）。 */
    name: string;
    /** 该候选的来源：`workspace` = DSH 工作区注册表；`session` = 会话 cwd 兜底。 */
    source: 'workspace' | 'session';
}
/** DSH 数据目录。优先 `DSH_HOME`，否则退回 `~/.dsh`。 */
export declare function dshHome(): string;
/** 工作区内的记忆目录名（固定，不再可配）。 */
export declare const MEMORY_DIR_NAME = "memory";
/** 没有工作区上下文时的兜底记忆根目录。 */
export declare function globalMemoryRoot(): string;
/** 递归创建目录并返回它。 */
export declare function ensureDir(dir: string): string;
/** 判断一个值是否是可用的绝对路径字符串。 */
export declare function isAbsolutePath(value: unknown): value is string;
/** 取路径最后一段作为展示名。 */
export declare function displayName(dir: string): string;
/** 工作区模式下的记忆根目录：`<工作区>/memory`。 */
export declare function workspaceMemoryRoot(workspace: string): string;
/**
 * peer 共享记忆根目录：同一仓库的多个 clone / worktree 共用一份。
 * 放在 DSH 数据目录下（共享必然意味着不能放在各自仓库里）。
 */
export declare function peerMemoryRoot(peer: string): string;
/**
 * 从会话列表中提取去重后的工作区候选（按会话创建时间倒序）。
 * `sessions` 是 `ctx.sessions.list()` 的返回值；这里只做结构读取，不做类型断言。
 */
export declare function listWorkspaces(sessions: unknown): WorkspaceRef[];
/**
 * DSH 工作区注册表（`ctx.workspaceRegistry`）的只读子集。
 * 它是宿主侧可选能力：宿主没挂时插件保持原样，不报错。
 */
export interface WorkspaceRegistryLike {
    /** 有序的工作区列表（同步缓存读取）。 */
    list(): Array<{
        path?: unknown;
        title?: unknown;
    }>;
}
/**
 * 从 DSH 工作区注册表提取工作区候选，**保持注册表顺序**。
 * 这是「下拉里列出 DSH 展示的所有工作区」的真源：注册表按目录持久记录工作区，
 * 不依赖会话是否还活着，因此已关闭/无会话的工作区也不会漏。
 */
export declare function registryWorkspaces(registry: WorkspaceRegistryLike): WorkspaceRef[];
/** 判断某个工作区是否为 DSH 的默认工作区（目录名固定为 `default-workspace`）。 */
export declare function isDefaultWorkspace(path: string): boolean;
/** 触发点上下文依赖面：解析根目录需要的全部信息。 */
export interface RootResolverDeps {
    /** 当前的分组方式。 */
    groupBy: () => 'workspace' | 'peer';
    /** 当前活着的会话列表（惰性求值）。 */
    sessions: () => unknown;
}
/** 记忆根目录解析器。 */
export type RootResolver = (workspace?: string) => string;
/** 构造一个记忆根目录解析器。 */
export declare function createRootResolver(deps: RootResolverDeps): RootResolver;
