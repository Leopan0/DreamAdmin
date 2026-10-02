/**
 * 存储位置解析：把「当前工作区」翻译成一个绝对的记忆根目录。
 *
 * 解析优先级（见 {@link resolveMemoryRoot}）：
 *   1. 调用方显式给出的工作区路径（HTTP 查询参数 / 工具参数）；
 *   2. 配置 scope === 'global' 时的全局目录（`dir` 为绝对路径时即该目录）；
 *   3. 最近活跃会话的 `header.cwd`（即工作区文件夹）；
 *   4. 兜底：全局目录。
 *
 * 工作区模式下的落点是 `<工作区>/<dir>`（`dir` 默认 `memory`；为绝对路径时直接
 * 用它，此时各工作区共用同一个目录）；如果没有工作区上下文，就退回到 DSH 数据
 * 目录下的 `dream-admin/memory`，绝不写进程 cwd ——那会随宿主启动位置漂移。
 *
 * @module dream-admin/paths
 */
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve, sep } from 'node:path';

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
export function dshHome(): string {
  const raw = process.env['DSH_HOME'];
  if (typeof raw === 'string' && raw.trim().length > 0) return resolve(raw.trim());
  return join(homedir(), '.dsh');
}

/** 全局（跨工作区）记忆根目录；`dir` 为绝对路径时直接采用该目录。 */
export function globalMemoryRoot(dir?: string): string {
  return isAbsolutePath(dir) ? resolve(dir.trim()) : join(dshHome(), 'dream-admin', 'memory');
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

/**
 * 计算工作区模式下记忆根目录的落点。
 * `dir` 是绝对路径时直接用它；否则接在工作区路径下。
 */
export function workspaceMemoryRoot(workspace: string, dir: string): string {
  return isAbsolute(dir) ? resolve(dir) : join(workspace, dir);
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

/** 触发点上下文依赖面：解析根目录需要的全部信息。 */
export interface RootResolverDeps {
  /** 当前解析后的存储策略。 */
  store: () => { dir: string; scope: 'workspace' | 'global' };
  /** 当前活着的会话列表（惰性求值）。 */
  sessions: () => unknown;
}

/** 记忆根目录解析器。 */
export type RootResolver = (workspace?: string) => string;

/** 构造一个记忆根目录解析器。 */
export function createRootResolver(deps: RootResolverDeps): RootResolver {
  return (workspace?: string) => {
    const store = deps.store();
    if (isAbsolutePath(workspace)) {
      return store.scope === 'global'
        ? globalMemoryRoot(store.dir)
        : workspaceMemoryRoot(workspace.trim(), store.dir);
    }
    if (store.scope === 'global') return globalMemoryRoot(store.dir);
    const active = listWorkspaces(deps.sessions())[0];
    if (active !== undefined) return workspaceMemoryRoot(active.path, store.dir);
    return globalMemoryRoot();
  };
}
