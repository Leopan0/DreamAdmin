/**
 * 记忆梦境：调用用户选定的模型，对记忆库做合并 / 去重 / 提炼。
 *
 * 设计取舍：
 * - 只允许 `update` 与 `merge` 两类操作，**不开放 delete**。模型最危险的错误
 *   是丢事实，而合并已经能覆盖「删除冗余」的全部价值，所以把删除能力收掉。
 * - 一切以 id 为准：模型返回的 id 必须在记忆库里真实存在，否则该条 op 被忽略。
 * - 原始条目内容随请求一起发出，模型只能改写已有内容，不能在库里凭空造条目。
 *
 * @module dream-admin/evolve
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-llm';
import type { ResolvedPluginConfig } from './config.js';
import type { RootResolver } from './paths.js';
import { deleteMemory, listMemories, readMemory, writeMemory } from './store.js';

/** 一次模型调用的路由（provider + model）。 */
export interface ModelRoute {
  readonly provider: string;
  readonly model: string;
}

/** 一次记忆梦境的结果。 */
export interface EvolveOutcome {
  ok: boolean;
  /** 未执行时的原因码。 */
  reason?: 'disabled' | 'model_not_configured' | 'too_few_memories' | 'busy' | 'llm_error' | 'unparsable';
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

/** 一次请求里最多带多少条记忆。 */
const MAX_INPUT_MEMORIES = 60;

/** 单条记忆送进模型时的正文长度上限（字符）。 */
const MAX_INPUT_BODY_CHARS = 2000;

/** 一次最多执行多少条 op。 */
const MAX_OPS = 50;

/** 记忆梦境依赖面。 */
export interface EvolveDeps {
  resolved: () => ResolvedPluginConfig;
  resolveRoot: RootResolver;
}

/** 记忆梦境执行器。 */
export interface Evolver {
  /**
   * 执行一次。
   * @param manual - true 时忽略 enabled / minMemories 门槛（对话框命令与手动触发）。
   * @param fallbackRoute - 未单独配置 provider / model 时使用的备用路由（通常是当前对话模型）。
   * @param signal - 可选取消信号，透传给模型调用。
   */
  run(manual: boolean, fallbackRoute?: ModelRoute, signal?: AbortSignal): Promise<EvolveOutcome>;
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

/**
 * 创建记忆梦境执行器，并按配置挂上定时器。
 * 定时器与 disposer 由调用方在插件卸载时释放。
 */
export function createEvolver(ctx: Context, deps: EvolveDeps): Evolver {
  let running = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  /** 上一次自动执行的时刻；定时器按分钟轮询，间隔改动无需重建定时器。 */
  let lastAutoRunAt = Date.now();

  const run = async (
    manual: boolean,
    fallbackRoute?: ModelRoute,
    signal?: AbortSignal
  ): Promise<EvolveOutcome> => {
    const cfg = deps.resolved().evolve;
    if (running) return skipped('busy', '上一次记忆梦境还没结束，跳过本次。');
    if (!manual && !cfg.enabled) return skipped('disabled', '记忆梦境未开启。');
    // 单独配置了 provider / model 就用它；否则用调用方给的备用路由（当前对话模型）。
    const configured = cfg.provider.length > 0 && cfg.model.length > 0;
    const route: ModelRoute = configured
      ? { provider: cfg.provider, model: cfg.model }
      : fallbackRoute ?? { provider: '', model: '' };
    if (route.provider.length === 0 || route.model.length === 0) {
      return skipped('model_not_configured', '未配置 provider / model，记忆梦境未执行。');
    }

    const root = deps.resolveRoot();
    const summaries = listMemories(root);
    if (!manual && summaries.length < cfg.minMemories) {
      return skipped(
        'too_few_memories',
        `记忆条数 ${summaries.length} 少于阈值 ${cfg.minMemories}，跳过记忆梦境。`,
        summaries.length,
        route
      );
    }
    if (summaries.length === 0) {
      return skipped('too_few_memories', '记忆库为空，无事可做。', 0, route);
    }

    running = true;
    try {
      const records = [];
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

      let text = '';
      for await (const chunk of ctx.llm.stream({
        provider: route.provider,
        model: route.model,
        system: cfg.prompt,
        messages: [{ role: 'user', content: [{ type: 'text', text: payload }] }],
        maxTokens: cfg.maxTokens,
        ...(signal === undefined ? {} : { signal })
      })) {
        if (chunk.type === 'text-delta') text += chunk.text;
      }

      const parsed = extractJson(text);
      const ops = parsed === undefined ? undefined : (parsed as { ops?: unknown }).ops;
      if (!Array.isArray(ops)) {
        return {
          ok: false,
          reason: 'unparsable',
          scanned: records.length,
          updated: 0,
          merged: 0,
          route,
          log: `模型没有返回可解析的 ops JSON，本次未改动。原始输出前 400 字：\n${text.slice(0, 400)}`
        };
      }

      let updated = 0;
      let merged = 0;
      const notes: string[] = [];

      for (const raw of ops.slice(0, MAX_OPS)) {
        const op = raw as { op?: unknown; id?: unknown; ids?: unknown; keep?: unknown; title?: unknown; tags?: unknown; body?: unknown };
        const kind = typeof op.op === 'string' ? op.op : '';

        if (kind === 'update') {
          const id = typeof op.id === 'string' ? op.id : '';
          const existing = readMemory(root, id);
          if (existing === undefined) continue;
          if (typeof op.body !== 'string' || op.body.trim().length === 0) continue;
          writeMemory(root, {
            id,
            title: typeof op.title === 'string' ? op.title : existing.title,
            tags: toStringArray(op.tags),
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

      if (manual) lastAutoRunAt = Date.now();
      const log =
        notes.length === 0
          ? `扫描 ${records.length} 条，模型认为无需改动。`
          : `扫描 ${records.length} 条，执行 ${notes.length} 个操作：\n${notes.join('\n')}`;
      ctx.logger.info(`dream-admin: 记忆梦境完成 — ${log}`);
      return { ok: true, scanned: records.length, updated, merged, route, log };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.logger.warn(`dream-admin: 记忆梦境失败 — ${message}`);
      return {
        ok: false,
        reason: 'llm_error',
        scanned: 0,
        updated: 0,
        merged: 0,
        route,
        log: `记忆梦境调用失败：${message}`
      };
    } finally {
      running = false;
    }
  };

  // 固定每分钟轮询一次，是否到点由 intervalMinutes 现算：这样用户在管理页改
  // 间隔后立即生效，不需要重建定时器或重载插件。
  timer = setInterval(() => {
    const cfg = deps.resolved().evolve;
    if (!cfg.enabled) return;
    if (Date.now() - lastAutoRunAt < cfg.intervalMinutes * 60_000) return;
    lastAutoRunAt = Date.now();
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

/** 从模型输出里抠出第一个 JSON 对象。 */
function extractJson(text: string): unknown | undefined {
  const withoutFence = text.replace(/```[a-zA-Z]*\n?/g, '');
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** 把模型给的 tags 收敛成字符串数组。 */
function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}
