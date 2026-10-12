/**
 * 存储位置解析：把「当前工作区」翻译成一个绝对的记忆根目录。
 *
 * 解析优先级（见 {@link createRootResolver}）：
 *   1. 调用方显式给出的工作区路径（HTTP 查询参数 / 工具参数）；
 *   2. 最近活跃会话的 `header.cwd`（即工作区文件夹）；
 *   3. 兜底：DSH 数据目录下的 `dream-admin/memory`。
 *
 * 工作区模式下的落点固定是 `<工作区>/memory`；当 `groupBy === 'peer'` 时改用
 * `<DSH_HOME>/dream-admin/peers/<peer>/memory`，让同一仓库的多个 clone / worktree
 * 共用一份记忆（详见 peers.ts）。绝不写进程 cwd ——那会随宿主启动位置漂移。
 *
 * @module dream-admin/paths
 */
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { resolvePeer } from './peers.js';

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
export function dshHome(): string {
  const raw = process.env['DSH_HOME'];
  if (typeof raw === 'string' && raw.trim().length > 0) return resolve(raw.trim());
  return join(homedir(), '.dsh');
}

/** 工作区内的记忆目录名（固定，不再可配）。 */
export const MEMORY_DIR_NAME = 'memory';

/** 没有工作区上下文时的兜底记忆根目录。 */
export function globalMemoryRoot(): string {
  return join(dshHome(), 'dream-admin', MEMORY_DIR_NAME);
}

/** 递归创建目录并返回它。 */
export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** 判断一个值是否是可用的绝对路径字符串。 */
export function isAbsolutePath(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && isAbsolute(value.trim());
}

/** 取路径最后一段作为展示名。 */
export function displayName(dir: string): string {
  const parts = dir.split(sep).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? dir;
}

/** 工作区模式下的记忆根目录：`<工作区>/memory`。 */
export function workspaceMemoryRoot(workspace: string): string {
  return join(workspace, MEMORY_DIR_NAME);
}

/**
 * peer 共享记忆根目录：同一仓库的多个 clone / worktree 共用一份。
 * 放在 DSH 数据目录下（共享必然意味着不能放在各自仓库里）。
 */
export function peerMemoryRoot(peer: string): string {
  return join(dshHome(), 'dream-admin', 'peers', peer, MEMORY_DIR_NAME);
}

/**
 * 从会话列表中提取去重后的工作区候选（按会话创建时间倒序）。
 * `sessions` 是 `ctx.sessions.list()` 的返回值；这里只做结构读取，不做类型断言。
 */
export function listWorkspaces(sessions: unknown): WorkspaceRef[] {
  const list = Array.isArray(sessions) ? sessions : [];
  const ordered = [...list].sort((a, b) => createdAt(b) - createdAt(a));
  const seen = new Set<string>();
  const result: WorkspaceRef[] = [];
  for (const session of ordered) {
    const cwd = (session as { header?: { cwd?: unknown } } | undefined)?.header?.cwd;
    if (!isAbsolutePath(cwd)) continue;
    const path = resolve(cwd.trim());
    if (seen.has(path)) continue;
    seen.add(path);
    result.push({ path, name: displayName(path), source: 'session' });
  }
  return result;
}

/** 读取会话创建时间，读不到按 0 处理。 */
function createdAt(session: unknown): number {
  const value = (session as { header?: { createdAt?: unknown } } | undefined)?.header?.createdAt;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * DSH 工作区注册表（`ctx.workspaceRegistry`）的只读子集。
 * 它是宿主侧可选能力：宿主没挂时插件保持原样，不报错。
 */
export interface WorkspaceRegistryLike {
  /** 有序的工作区列表（同步缓存读取）。 */
  list(): Array<{ path?: unknown; title?: unknown }>;
}

/** DSH 默认工作区固定使用的目录名（由宿主拥有）。 */
const DEFAULT_WORKSPACE_DIR = 'default-workspace';

/**
 * 从 DSH 工作区注册表提取工作区候选，**保持注册表顺序**。
 * 这是「下拉里列出 DSH 展示的所有工作区」的真源：注册表按目录持久记录工作区，
 * 不依赖会话是否还活着，因此已关闭/无会话的工作区也不会漏。
 */
export function registryWorkspaces(registry: WorkspaceRegistryLike): WorkspaceRef[] {
  let list: unknown;
  try {
    list = registry.list();
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const result: WorkspaceRef[] = [];
  for (const item of list) {
    const raw = (item ?? {}) as { path?: unknown; title?: unknown };
    if (!isAbsolutePath(raw.path)) continue;
    const path = resolve(raw.path.trim());
    if (seen.has(path)) continue;
    seen.add(path);
    const title =
      typeof raw.title === 'string' && raw.title.trim().length > 0 ? raw.title.trim() : displayName(path);
    result.push({ path, name: title, source: 'workspace' });
  }
  return result;
}

/** 判断某个工作区是否为 DSH 的默认工作区（目录名固定为 `default-workspace`）。 */
export function isDefaultWorkspace(path: string): boolean {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0);
  return (parts[parts.length - 1] ?? '') === DEFAULT_WORKSPACE_DIR;
}

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
export function createRootResolver(deps: RootResolverDeps): RootResolver {
  /** 工作区模式下的实际落点：peer 分组且能解析出 peer 时按 peer 共享。 */
  const workspaceRoot = (workspace: string): string => {
    if (deps.groupBy() === 'peer') {
      const peer = resolvePeer(workspace);
      if (peer !== undefined) return peerMemoryRoot(peer);
    }
    return workspaceMemoryRoot(workspace);
  };

  return (workspace?: string) => {
    if (isAbsolutePath(workspace)) return workspaceRoot(workspace.trim());
    const active = listWorkspaces(deps.sessions())[0];
    if (active !== undefined) return workspaceRoot(active.path);
    return globalMemoryRoot();
  };
}
