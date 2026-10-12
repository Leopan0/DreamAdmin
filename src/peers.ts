/**
 * 工作区逻辑身份（peer）。
 *
 * 类比 OpenViking 的 peer：记忆除了记录「物理落点」（workspace 绝对路径），
 * 还记录一个「逻辑身份」——同一个仓库的多个 clone / worktree 归到同一个 peer，
 * 从而在管理页与检索里表现为同一个工作区，而不是各记各的。
 *
 * 解析顺序：
 *   1. 仓库的 `origin` remote（归一化成 `host-owner-repo`）；
 *   2. 目录路径兜底（`dir-<slug>`）。
 *
 * 只读 `.git/config`，不启动 git 进程：零依赖、零额外开销。
 *
 * @module dream-admin/peers
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** 解析工作区路径对应的 peer id；没有可用路径时返回 undefined。 */
export function resolvePeer(workspace: string | undefined): string | undefined {
  if (typeof workspace !== 'string' || workspace.trim().length === 0) return undefined;
  const abs = resolve(workspace.trim());
  const remote = readGitRemote(abs);
  if (remote !== undefined) {
    const normalized = normalizeRemote(remote);
    if (normalized.length > 0) return normalized;
  }
  return `dir-${slug(abs)}`;
}

/** 读取工作区 git `origin` remote 的 URL；非仓库或没有 origin 时返回 undefined。 */
function readGitRemote(workspace: string): string | undefined {
  try {
    const entry = join(workspace, '.git');
    if (!existsSync(entry)) return undefined;
    const configs = statSync(entry).isDirectory() ? [join(entry, 'config')] : worktreeConfigs(entry);
    for (const config of configs) {
      const remote = readRemoteFrom(config);
      if (remote !== undefined) return remote;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** worktree 的 `.git` 是文件：跟随 gitdir / commondir 找到真正的 config。 */
function worktreeConfigs(entry: string): string[] {
  try {
    const match = readFileSync(entry, 'utf8').match(/gitdir:\s*(.+)/);
    if (match === null) return [];
    const gitdir = resolve(match[1].trim());
    const configs = [join(gitdir, 'config')];
    const common = join(gitdir, 'commondir');
    if (existsSync(common)) {
      const relative = readFileSync(common, 'utf8').trim();
      if (relative.length > 0) configs.unshift(join(resolve(gitdir, relative), 'config'));
    }
    return configs;
  } catch {
    return [];
  }
}

/** 从 git config 文本里取 `[remote "origin"]` 段的 `url`。 */
function readRemoteFrom(config: string): string | undefined {
  try {
    let inOrigin = false;
    for (const line of readFileSync(config, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('[')) {
        inOrigin = /^\[remote\s+"origin"\]$/.test(trimmed);
        continue;
      }
      if (!inOrigin) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      if (trimmed.slice(0, eq).trim() === 'url') return trimmed.slice(eq + 1).trim();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** 把各种 git remote 形式归一化成 `host-owner-repo` 形状。 */
function normalizeRemote(remote: string): string {
  let value = remote.trim().toLowerCase();
  value = value.replace(/^[a-z+]+:\/\//, ''); // scheme://
  value = value.replace(/^[^@/]+@/, ''); // user@
  value = value.replace(/^www\./, '');
  value = value.replace(/^([^/:]+):\d+\//, '$1/'); // host:port/
  value = value.replace(/^([^/]+):(?!\/)/, '$1/'); // scp 形式 host:owner/repo
  value = value.replace(/\.git$/, '');
  value = value.replace(/\/+$/, '');
  return slug(value);
}

/** 把任意字符串压成 `a-b-c` 形状的安全标识。 */
function slug(value: string): string {
  const result = value.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return result.length > 0 ? result : 'unknown';
}
