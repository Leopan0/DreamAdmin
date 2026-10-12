/**
 * 记忆梦境：调用用户选定的模型，对记忆库做合并 / 去重 / 提炼。
 *
 * 与「整理记忆」（capture）一样**按工作区独立运行**：每个工作区各自读自己的记忆库、
 * 各自计时、各自满足 `minMemories` 门槛，互不干扰。绝不只处理「当前 / 默认工作区」。
 *
 * 设计取舍：
 * - 只允许 `update` 与 `merge` 两类操作，**不开放 delete**。模型最危险的错误
 *   是丢事实，而合并已经能覆盖「删除冗余」的全部价值，所以把删除能力收掉。
 * - 一切以 id 为准：模型返回的 id 必须在记忆库里真实存在，否则该条 op 被忽略。
 * - 原始条目内容随请求一起发出，模型只能改写已有内容，不能在库里凭空造条目。
 * - 每次实际执行的入梦都往 `<记忆根>/dreams.jsonl` 追加一条记录，供管理页按工作区查看。
 *
 * @module dream-admin/evolve
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-llm';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResolvedPluginConfig } from './config.js';
import { collectStreamText, extractJson, toStringArray, type ModelRoute } from './llm.js';
import { ensureDir, listWorkspaces, type RootResolver } from './paths.js';
import { deleteMemory, listMemories, readMemory, writeMemory, type MemoryRecord } from './store.js';
import type { ProgressReporter } from './tasks.js';

/** 一次记忆梦境的结果。 */
export interface EvolveOutcome {
  ok: boolean;
  /** 未执行时的原因码。 */
  reason?:
    | 'disabled'
    | 'model_not_configured'
    | 'too_few_memories'
    | 'busy'
    | 'llm_error'
    | 'unparsable'
    | 'cancelled';
  /** 扫描到的记忆条数。 */
  scanned: number;
  /** 被改写的条数（含 merge 的目标）。 */
  updated: number;
  /** 被合并掉的条数（merge 中被删除的那些）。 */
  merged: number;
  /** 人类可读的执行说明。 */
  log: string;
  /** 本次实际使用的模型路由；未执行时为 undefined。 */
  route?: ModelRoute;
}

/** 一条落盘的入梦记录。 */
export interface DreamRecord {
  /** 记录时间（ISO）。 */
  at: string;
  /** 归属的工作区绝对路径。 */
  workspace: string;
  /** 是否成功执行（模型调用成功且返回了可解析的 ops）。 */
  ok: boolean;
  /** 未成功时的原因码。 */
  reason?: string;
  /** 送进模型的记忆条数。 */
  scanned: number;
  /** 被改写的条数（含 merge 的目标）。 */
  updated: number;
  /** 被合并掉的条数（merge 中被删除的那些）。 */
  merged: number;
  /** 人类可读的执行说明。 */
  log: string;
  /** 本次使用的 provider；未记录时省略。 */
  provider?: string;
  /** 本次使用的 model；未记录时省略。 */
  model?: string;
}

/** 一次 run 的可选项。 */
export interface EvolveRunOptions {
  /** 只对这个工作区入梦；省略时对所有已知工作区入梦（自动轮询）。 */
  workspace?: string;
  /** 未单独配置 provider / model 时使用的备用路由（通常是当前对话模型）。 */
  fallbackRoute?: ModelRoute;
  /** 阶段进度上报：长任务注册表把它接到轮询接口上。 */
  onProgress?: ProgressReporter;
}

/** 一次请求里最多带多少条记忆。 */
const MAX_INPUT_MEMORIES = 60;

/** 单条记忆送进模型时的正文长度上限（字符）。 */
const MAX_INPUT_BODY_CHARS = 2000;

/** 一次最多执行多少条 op。 */
const MAX_OPS = 50;

/** 入梦记录文件名：放在记忆根目录下，列表只认 `.md`，因此不会被当成记忆。 */
const DREAM_LOG_NAME = 'dreams.jsonl';

/** 每个工作区最多保留多少条入梦记录。 */
const MAX_DREAM_RECORDS = 200;

/** 记忆梦境依赖面。 */
export interface EvolveDeps {
  resolved: () => ResolvedPluginConfig;
  resolveRoot: RootResolver;
  /** 活着的会话列表（用于工作区发现）。 */
  sessions: () => unknown;
}

/** 记忆梦境执行器。 */
export interface Evolver {
  /**
   * 执行一次。
   * @param manual - true 时忽略 enabled / minMemories 门槛（对话框命令与手动触发）。
   * @param options - 目标工作区与备用模型路由。
   * @param signal - 可选取消信号，透传给模型调用。
   */
  run(manual: boolean, options?: EvolveRunOptions, signal?: AbortSignal): Promise<EvolveOutcome>;
  /** 停止定时器。 */
  dispose(): void;
}

/** 记忆库为空 / 未配置时的空结果。 */
function skipped(
  reason: EvolveOutcome['reason'],
  log: string,
  scanned = 0,
  route?: ModelRoute
): EvolveOutcome {
  return { ok: false, reason, scanned, updated: 0, merged: 0, log, route };
}

/** 到点后允许触发入梦的时间窗（毫秒）：吸收每分钟轮询的抖动，超过即视为错过、不补做。 */
const EVOLVE_TRIGGER_WINDOW_MS = 120_000;

/** 本地日期键（YYYY-MM-DD），用于「每天夜里只触发一遍」的判定。 */
function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * 创建记忆梦境执行器，并按配置挂上定时器。
 * 定时器与 disposer 由调用方在插件卸载时释放。
 */
export function createEvolver(ctx: Context, deps: EvolveDeps): Evolver {
  let running = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  /** 最近一次自动入梦的日期（YYYY-MM-DD），保证每天夜里只触发一遍。 */
  let lastDreamDay = '';

  const run = async (
    manual: boolean,
    options: EvolveRunOptions = {},
    signal?: AbortSignal
  ): Promise<EvolveOutcome> => {
    const cfg = deps.resolved().evolve;
    if (running) return skipped('busy', '上一次记忆梦境还没结束，跳过本次。');
    if (!manual && !cfg.enabled) return skipped('disabled', '记忆梦境未开启。');
    // 单独配置了 provider / model 就用它；否则用调用方给的备用路由（当前对话模型）。
    const configured = cfg.provider.length > 0 && cfg.model.length > 0;
    const route: ModelRoute = configured
      ? { provider: cfg.provider, model: cfg.model }
      : options.fallbackRoute ?? { provider: '', model: '' };
    if (route.provider.length === 0 || route.model.length === 0) {
      return skipped('model_not_configured', '未配置 provider / model，记忆梦境未执行。');
    }

    // 每个工作区各自入梦：手动指定时只处理它，否则处理全部已知工作区。
    const workspaces =
      manual && options.workspace !== undefined
        ? [options.workspace]
        : listWorkspaces(deps.sessions()).map((entry) => entry.path);
    if (workspaces.length === 0) {
      return skipped('too_few_memories', '没有已知工作区，记忆梦境未执行。', 0, route);
    }

    /** 阶段进度上报（长任务 / 对话框命令共用）。 */
    const report = options.onProgress;

    running = true;
    let scanned = 0;
    let updated = 0;
    let merged = 0;
    /** 真正调用过模型的工作区数。 */
    let dreamed = 0;
    let failures = 0;
    const notes: string[] = [];
    /** 写进入梦记录时附带的模型路由信息（缺省时省略该字段）。 */
    const routeInfo = {
      ...(route.provider.length > 0 ? { provider: route.provider } : {}),
      ...(route.model.length > 0 ? { model: route.model } : {})
    };

    try {
      report?.({ phase: 'prepare', completed: 0, total: workspaces.length });
      for (let index = 0; index < workspaces.length; index += 1) {
        const workspace = workspaces[index];
        if (signal?.aborted) break;

        report?.({ phase: 'scan', completed: index, total: workspaces.length, workspace });

        const root = deps.resolveRoot(workspace);
        const summaries = listMemories(root);
        if (!manual && summaries.length < cfg.minMemories) {
          notes.push(
            `${workspace}：记忆条数 ${summaries.length} 少于阈值 ${cfg.minMemories}，跳过记忆梦境。`
          );
          continue;
        }
        if (summaries.length === 0) {
          continue;
        }

        const records: MemoryRecord[] = [];
        for (const summary of summaries.slice(0, MAX_INPUT_MEMORIES)) {
          const record = readMemory(root, summary.id);
          if (record !== undefined) records.push(record);
        }

        const payload = records
          .map((record) => {
            const tags = record.tags.length > 0 ? `tags: ${record.tags.join(', ')}\n` : '';
            const body = record.body.length > MAX_INPUT_BODY_CHARS
              ? record.body.slice(0, MAX_INPUT_BODY_CHARS) + '\n…（已截断）'
              : record.body;
            const pinned = record.pinned ? 'pinned: true\n' : '';
            return `### id: ${record.id}\n标题: ${record.title}\n${tags}${pinned}正文:\n${body}`;
          })
          .join('\n\n---\n\n');

        report?.({ phase: 'model', completed: index, total: workspaces.length, workspace });
        let text = '';
        try {
          text = await collectStreamText(
            ctx.llm.stream({
              provider: route.provider,
              model: route.model,
              system: cfg.prompt,
              messages: [{ role: 'user', content: [{ type: 'text', text: payload }] }],
              maxTokens: cfg.maxTokens,
              ...(signal === undefined ? {} : { signal })
            })
          );
        } catch (error) {
          failures += 1;
          const message = describe(error);
          notes.push(`${workspace}：记忆梦境调用失败（${message}）`);
          appendDreamRecord(root, {
            at: new Date().toISOString(),
            workspace,
            ok: false,
            reason: 'llm_error',
            scanned: records.length,
            updated: 0,
            merged: 0,
            log: `记忆梦境调用失败：${message}`,
            ...routeInfo
          });
          continue;
        }

        const parsed = extractJson(text);
        const ops = parsed === undefined ? undefined : (parsed as { ops?: unknown }).ops;
        if (!Array.isArray(ops)) {
          failures += 1;
          notes.push(
            `${workspace}：模型没有返回可解析的 ops JSON，本次未改动。原始输出前 400 字：\n${text.slice(0, 400)}`
          );
          appendDreamRecord(root, {
            at: new Date().toISOString(),
            workspace,
            ok: false,
            reason: 'unparsable',
            scanned: records.length,
            updated: 0,
            merged: 0,
            log: `模型没有返回可解析的 ops JSON。原始输出前 400 字：\n${text.slice(0, 400)}`,
            ...routeInfo
          });
          continue;
        }

        report?.({ phase: 'apply', completed: index, total: workspaces.length, workspace });
        const applied = applyOps(root, ops);
        scanned += records.length;
        updated += applied.updated;
        merged += applied.merged;
        dreamed += 1;
        const detail =
          applied.notes.length === 0
            ? '模型认为无需改动。'
            : `执行 ${applied.notes.length} 个操作：${applied.notes.join('；')}`;
        notes.push(`${workspace}：扫描 ${records.length} 条，${detail}`);
        appendDreamRecord(root, {
          at: new Date().toISOString(),
          workspace,
          ok: true,
          scanned: records.length,
          updated: applied.updated,
          merged: applied.merged,
          log: `扫描 ${records.length} 条，${detail}`,
          ...routeInfo
        });
      }

      report?.({ phase: 'apply', completed: workspaces.length, total: workspaces.length });
      const log = notes.length === 0 ? '没有需要入梦的工作区。' : notes.join('\n');
      if (signal?.aborted) {
        ctx.logger.info(`dream-admin: 记忆梦境已取消 — ${log}`);
        return { ok: false, reason: 'cancelled', scanned, updated, merged, route, log };
      }
      if (failures > 0) {
        ctx.logger.warn(`dream-admin: 记忆梦境部分失败 — ${log}`);
        return { ok: false, reason: 'llm_error', scanned, updated, merged, route, log };
      }
      if (dreamed === 0) {
        ctx.logger.info(`dream-admin: 记忆梦境跳过 — ${log}`);
        return { ok: false, reason: 'too_few_memories', scanned, updated, merged, route, log };
      }
      ctx.logger.info(`dream-admin: 记忆梦境完成 — ${log}`);
      return { ok: true, scanned, updated, merged, route, log };
    } finally {
      running = false;
    }
  };

  // 固定每分钟轮询一次：每天夜里到点（atHour:00）后的时间窗内触发一遍；过了就错过、不补做。
  // 到点时刻直接读配置，因此在管理页改时刻后立即生效，不需要重建定时器或重载插件。
  timer = setInterval(() => {
    const cfg = deps.resolved().evolve;
    if (!cfg.enabled) return;
    const now = new Date();
    const scheduled = new Date(now);
    scheduled.setHours(cfg.atHour, 0, 0, 0);
    const delta = now.getTime() - scheduled.getTime();
    if (delta < 0 || delta >= EVOLVE_TRIGGER_WINDOW_MS) return;
    const today = dayKey(now);
    if (lastDreamDay === today) return;
    lastDreamDay = today;
    void run(false);
  }, 60_000);
  // 定时器不该拖住宿主进程退出。
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    (timer as { unref: () => void }).unref();
  }

  return {
    run,
    dispose() {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    }
  };
}

/** 应用模型的 ops。返回改写 / 合并条数与人类可读的 op 说明。 */
function applyOps(
  root: string,
  ops: unknown[]
): { updated: number; merged: number; notes: string[] } {
  let updated = 0;
  let merged = 0;
  const notes: string[] = [];

  for (const raw of ops.slice(0, MAX_OPS)) {
    const op = raw as {
      op?: unknown;
      id?: unknown;
      ids?: unknown;
      keep?: unknown;
      title?: unknown;
      tags?: unknown;
      summary?: unknown;
      body?: unknown;
    };
    const kind = typeof op.op === 'string' ? op.op : '';
    const summary = typeof op.summary === 'string' ? op.summary : undefined;

    if (kind === 'update') {
      const id = typeof op.id === 'string' ? op.id : '';
      const existing = readMemory(root, id);
      if (existing === undefined) continue;
      if (typeof op.body !== 'string' || op.body.trim().length === 0) continue;
      writeMemory(root, {
        id,
        title: typeof op.title === 'string' ? op.title : existing.title,
        tags: toStringArray(op.tags),
        summary,
        body: op.body,
        pinned: existing.pinned,
        source: 'evolve'
      });
      updated += 1;
      notes.push(`update ${id}`);
      continue;
    }

    if (kind === 'merge') {
      const ids = (toStringArray(op.ids) ?? []).filter((id) => readMemory(root, id) !== undefined);
      if (ids.length < 2) continue;
      const keep = ids.includes(typeof op.keep === 'string' ? op.keep : '') ? (op.keep as string) : ids[0];
      const target = readMemory(root, keep);
      if (target === undefined) continue;
      if (typeof op.body !== 'string' || op.body.trim().length === 0) continue;
      writeMemory(root, {
        id: keep,
        title: typeof op.title === 'string' ? op.title : target.title,
        tags: toStringArray(op.tags),
        summary,
        body: op.body,
        pinned: target.pinned || ids.some((id) => readMemory(root, id)?.pinned === true),
        source: 'evolve'
      });
      updated += 1;
      for (const id of ids) {
        if (id === keep) continue;
        if (deleteMemory(root, id)) merged += 1;
      }
      notes.push(`merge ${ids.join(' + ')} -> ${keep}`);
    }
  }

  return { updated, merged, notes };
}

/** 提取错误信息。 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ------------------------------------------------------------------ *
 * 入梦记录：每个工作区一份 `<记忆根>/dreams.jsonl`
 * ------------------------------------------------------------------ */

/** 追加一条入梦记录。尽力而为，失败不影响入梦本身。 */
function appendDreamRecord(root: string, record: DreamRecord): void {
  try {
    ensureDir(root);
    const file = join(root, DREAM_LOG_NAME);
    const lines = readDreamLines(file);
    lines.push(JSON.stringify(record));
    writeFileSync(file, lines.slice(-MAX_DREAM_RECORDS).join('\n') + '\n', 'utf8');
  } catch {
    // 记录失败不该影响入梦；run 已经通过 logger 输出了这次的结果。
  }
}

/** 读取某个工作区的入梦记录，按时间倒序（最新在前）。 */
export function listDreamRecords(root: string, limit = 100): DreamRecord[] {
  const records: DreamRecord[] = [];
  for (const line of readDreamLines(join(root, DREAM_LOG_NAME))) {
    const record = parseDreamRecord(line);
    if (record !== undefined) records.push(record);
  }
  records.reverse();
  return limit > 0 ? records.slice(0, limit) : records;
}

/** 读取记录文件的非空行；文件不存在或读不到时返回空数组。 */
function readDreamLines(file: string): string[] {
  if (!existsSync(file)) return [];
  try {
    return readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);
  } catch {
    return [];
  }
}

/** 解析一行 JSONL；损坏的行返回 undefined（跳过该行而不是整份失败）。 */
function parseDreamRecord(line: string): DreamRecord | undefined {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  const at = typeof raw.at === 'string' ? raw.at : '';
  const workspace = typeof raw.workspace === 'string' ? raw.workspace : '';
  if (at.length === 0 || workspace.length === 0) return undefined;
  const record: DreamRecord = {
    at,
    workspace,
    ok: raw.ok === true,
    scanned: finitenessOrZero(raw.scanned),
    updated: finitenessOrZero(raw.updated),
    merged: finitenessOrZero(raw.merged),
    log: typeof raw.log === 'string' ? raw.log : ''
  };
  if (typeof raw.reason === 'string') record.reason = raw.reason;
  if (typeof raw.provider === 'string') record.provider = raw.provider;
  if (typeof raw.model === 'string') record.model = raw.model;
  return record;
}

/** 数字字段收敛：非有限数字一律归零。 */
function finitenessOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
