/**
 * 整理记忆：按工作区读取历史会话（含已关闭的会话），调用用户选定的模型把会话里
 * 值得长期记住的事实提炼成记忆条目。
 *
 * 与「入梦」（evolve）的分工：
 * - 整理记忆（本模块）：**从会话历史生成 / 更新记忆**，是记忆库的入口。
 * - 入梦（evolve）：只对**已有记忆**做合并 / 去重 / 提炼，不读会话。
 * 两者各有独立开关、模型与定时器。
 *
 * 设计取舍：
 * - 按工作区独立运行：每个工作区各自计时、各自持有会话 seq 水位，互不干扰。
 * - 只开放 `create` 与 `update` 两类 op，**不开放 delete**：删除走管理页或
 *   memory_forget，避免模型误删。
 * - `update` 的 id 必须在记忆库里真实存在，否则该条 op 被忽略。
 * - 成功消化某个工作区后才推进它的水位与计时；失败（模型报错 / 输出不可解析）
 *   则不推进，下次重试。
 *
 * @module dream-admin/capture
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-llm';
import type { ResolvedPluginConfig } from './config.js';
import { extractJson, toStringArray, type ModelRoute } from './evolve.js';
import { listWorkspaces, type RootResolver } from './paths.js';
import type { SessionDigest, SessionReader } from './sessions.js';
import { listMemories, readMemory, writeMemory } from './store.js';

/** 一次整理记忆的结果。 */
export interface CaptureOutcome {
  ok: boolean;
  /** 未执行时的原因码。 */
  reason?:
    | 'disabled'
    | 'model_not_configured'
    | 'busy'
    | 'no_workspaces'
    | 'no_sessions'
    | 'llm_error'
    | 'unparsable';
  /** 本次纳入整理的工作区数。 */
  workspaces: number;
  /** 参与整理的会话数（有新内容的）。 */
  sessions: number;
  /** 新建的记忆条数。 */
  created: number;
  /** 更新的记忆条数。 */
  updated: number;
  /** 人类可读的执行说明。 */
  log: string;
  /** 本次实际使用的模型路由；未执行时为 undefined。 */
  route?: ModelRoute;
}

/** 一次 run 的可选项。 */
export interface CaptureRunOptions {
  /** 只整理这个工作区；省略时整理全部已知工作区（自动轮询）。 */
  workspace?: string;
  /** 未单独配置 provider / model 时使用的备用路由（通常是当前对话模型）。 */
  fallbackRoute?: ModelRoute;
}

/** 整理记忆执行器。 */
export interface Capturer {
  /**
   * 执行一次。
   * @param manual - true 时忽略 enabled 与间隔门槛（对话框命令与手动触发）。
   * @param options - 目标工作区与备用模型路由。
   * @param signal - 可选取消信号，透传给会话读取与模型调用。
   */
  run(manual: boolean, options?: CaptureRunOptions, signal?: AbortSignal): Promise<CaptureOutcome>;
  /** 停止定时器。 */
  dispose(): void;
}

/** 整理记忆依赖面。 */
export interface CaptureDeps {
  resolved: () => ResolvedPluginConfig;
  resolveRoot: RootResolver;
  /** 活着的会话列表（用于工作区发现）。 */
  sessions: () => unknown;
  /** 会话历史读取器。 */
  sessionReader: SessionReader;
}

/** 一次最多执行多少条 op。 */
const MAX_OPS = 100;

/** 单条消息送进模型时的字符上限。 */
const MAX_MESSAGE_CHARS = 1500;

/** 记忆索引里最多列出多少条已有记忆。 */
const MAX_INDEX_MEMORIES = 120;

/** 记忆索引里每条摘要的字符上限。 */
const MAX_INDEX_PREVIEW_CHARS = 160;

/** 未执行时的结果。 */
function skipped(reason: CaptureOutcome['reason'], log: string, route?: ModelRoute): CaptureOutcome {
  return { ok: false, reason, workspaces: 0, sessions: 0, created: 0, updated: 0, log, route };
}

/**
 * 创建整理记忆执行器，并按配置挂上定时器。
 * 定时器与 disposer 由调用方在插件卸载时释放。
 */
export function createCapturer(ctx: Context, deps: CaptureDeps): Capturer {
  let running = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  /** 每个工作区各自的上次整理时刻（毫秒）。 */
  const lastRunAt = new Map<string, number>();
  /** 每个工作区各自的会话 seq 水位：sessionId → 已整理到的 seq。 */
  const watermarks = new Map<string, Map<string, number>>();

  const run = async (
    manual: boolean,
    options: CaptureRunOptions = {},
    signal?: AbortSignal
  ): Promise<CaptureOutcome> => {
    const cfg = deps.resolved().capture;
    if (running) return skipped('busy', '上一次整理记忆还没结束，跳过本次。');
    if (!manual && !cfg.enabled) return skipped('disabled', '整理记忆未开启。');

    // 单独配置了 provider / model 就用它；否则用调用方给的备用路由（当前对话模型）。
    const configured = cfg.provider.length > 0 && cfg.model.length > 0;
    const route: ModelRoute = configured
      ? { provider: cfg.provider, model: cfg.model }
      : options.fallbackRoute ?? { provider: '', model: '' };
    if (route.provider.length === 0 || route.model.length === 0) {
      return skipped('model_not_configured', '未配置 provider / model，整理记忆未执行。');
    }

    if (!deps.sessionReader.available()) {
      return skipped('no_sessions', '会话历史服务（sessionQuery）不可用，无法读取历史会话。');
    }

    const workspaces =
      manual && options.workspace !== undefined
        ? [options.workspace]
        : listWorkspaces(deps.sessions()).map((entry) => entry.path);
    if (workspaces.length === 0) return skipped('no_workspaces', '没有已知工作区，无法整理记忆。', route);

    running = true;
    let created = 0;
    let updated = 0;
    let sessions = 0;
    let failures = 0;
    const notes: string[] = [];

    try {
      for (const workspace of workspaces) {
        if (signal?.aborted) break;

        // 自动模式：每个工作区各自计时；首次发现的工作区从当前时刻起算。
        if (!manual) {
          const prev = lastRunAt.get(workspace);
          if (prev === undefined) {
            lastRunAt.set(workspace, Date.now());
            continue;
          }
          if (Date.now() - prev < cfg.intervalMinutes * 60_000) continue;
        }

        const state = watermarks.get(workspace) ?? new Map<string, number>();
        let scan;
        try {
          scan = await deps.sessionReader.read(
            workspace,
            { maxSessions: cfg.maxSessions, maxMessages: cfg.maxMessages, since: state },
            signal
          );
        } catch (error) {
          failures += 1;
          notes.push(`${workspace}：读取历史会话失败（${describe(error)}）`);
          continue;
        }

        if (scan.digests.length === 0) {
          lastRunAt.set(workspace, Date.now());
          continue;
        }

        const root = deps.resolveRoot(workspace);
        const userText = [
          buildMemoryIndex(root),
          '',
          '## 会话记录',
          '',
          buildTranscript(scan.digests, cfg.maxChars)
        ].join('\n');

        let text = '';
        try {
          for await (const chunk of ctx.llm.stream({
            provider: route.provider,
            model: route.model,
            system: cfg.prompt,
            messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
            maxTokens: cfg.maxTokens,
            ...(signal === undefined ? {} : { signal })
          })) {
            if (chunk.type === 'text-delta') text += chunk.text;
          }
        } catch (error) {
          failures += 1;
          notes.push(`${workspace}：模型调用失败（${describe(error)}）`);
          continue;
        }

        const parsed = extractJson(text);
        const ops = parsed === undefined ? undefined : (parsed as { ops?: unknown }).ops;
        if (!Array.isArray(ops)) {
          failures += 1;
          notes.push(`${workspace}：模型没有返回可解析的 ops JSON，本次未改动。原始输出前 400 字：\n${text.slice(0, 400)}`);
          continue;
        }

        const applied = applyOps(root, workspace, ops);
        created += applied.created;
        updated += applied.updated;
        sessions += scan.digests.length;
        notes.push(
          `${workspace}：整理 ${scan.digests.length} 个会话，新增 ${applied.created} 条，更新 ${applied.updated} 条`
        );

        // 成功消化后才推进水位与计时。
        watermarks.set(workspace, new Map([...state, ...scan.watermarks]));
        lastRunAt.set(workspace, Date.now());
      }

      const log = notes.length === 0 ? '没有需要整理的新内容。' : notes.join('\n');
      if (failures === 0) {
        ctx.logger.info(`dream-admin: 整理记忆完成 — ${log}`);
      } else {
        ctx.logger.warn(`dream-admin: 整理记忆部分失败 — ${log}`);
      }
      return {
        ok: failures === 0,
        ...(failures === 0 ? {} : { reason: 'llm_error' as const }),
        workspaces: workspaces.length,
        sessions,
        created,
        updated,
        route,
        log
      };
    } finally {
      running = false;
    }
  };

  // 固定每分钟轮询一次：先廉价判断有没有工作区到点，再真正读取会话。
  timer = setInterval(() => {
    const cfg = deps.resolved().capture;
    if (!cfg.enabled) return;
    const now = Date.now();
    const workspaces = listWorkspaces(deps.sessions()).map((entry) => entry.path);
    let due = false;
    for (const workspace of workspaces) {
      const prev = lastRunAt.get(workspace);
      if (prev === undefined) {
        lastRunAt.set(workspace, now);
        continue;
      }
      if (now - prev >= cfg.intervalMinutes * 60_000) due = true;
    }
    if (due) void run(false);
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

/** 组装已有记忆索引（id + 标题 + 摘要），让模型优先复用而不是制造重复。 */
function buildMemoryIndex(root: string): string {
  const summaries = listMemories(root).slice(0, MAX_INDEX_MEMORIES);
  if (summaries.length === 0) return '## 已有记忆索引\n\n（当前工作区还没有记忆）';
  const lines = summaries.map((entry) => {
    const tags = entry.tags.length > 0 ? `（${entry.tags.join(', ')}）` : '';
    const preview = entry.preview.slice(0, MAX_INDEX_PREVIEW_CHARS);
    return `- ${entry.id} — ${entry.title}${tags}：${preview}`;
  });
  return `## 已有记忆索引\n\n${lines.join('\n')}`;
}

/** 把会话摘要拼成转录文本，从最新会话开始，超出字符预算即停。 */
function buildTranscript(digests: SessionDigest[], maxChars: number): string {
  const budget = maxChars > 0 ? maxChars : Number.MAX_SAFE_INTEGER;
  const blocks: string[] = [];
  let used = 0;
  for (const digest of digests) {
    const header = `### 会话 ${digest.id}（${new Date(digest.createdAt).toISOString()}）`;
    const body = digest.messages
      .map((message) => `${message.role === 'user' ? '用户' : '助手'}：${clamp(message.text, MAX_MESSAGE_CHARS)}`)
      .join('\n');
    const block = `${header}\n${body}`;
    if (used > 0 && used + block.length > budget) break;
    blocks.push(block);
    used += block.length;
  }
  return blocks.join('\n\n---\n\n');
}

/** 应用模型的 ops。返回新增 / 更新条数。 */
function applyOps(root: string, workspace: string, ops: unknown[]): { created: number; updated: number } {
  let created = 0;
  let updated = 0;
  for (const raw of ops.slice(0, MAX_OPS)) {
    const op = raw as { op?: unknown; id?: unknown; title?: unknown; tags?: unknown; body?: unknown };
    const body = typeof op.body === 'string' ? op.body.trim() : '';
    if (body.length === 0) continue;
    const title = typeof op.title === 'string' ? op.title : undefined;
    const tags = toStringArray(op.tags);

    if (op.op === 'update') {
      const id = typeof op.id === 'string' ? op.id : '';
      if (readMemory(root, id) === undefined) continue;
      writeMemory(root, { id, title, tags, body, source: 'auto' });
      updated += 1;
      continue;
    }

    if (op.op === 'create') {
      writeMemory(root, { title, tags, body, source: 'auto', workspace });
      created += 1;
    }
  }
  return { created, updated };
}

/** 按字符数截断。 */
function clamp(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(0, maxChars) + '…';
}

/** 提取错误信息。 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
