/**
 * 会话历史读取：用 DSH 的 `ctx.sessionQuery` 服务，按工作区把历史会话翻成
 * 「可提炼的对话转录」。
 *
 * 关键取舍：
 * - sessionQuery 是可选服务（由 `dsh-session-query-sqlite` 后端挂载），因此用
 *   `ctx.inject` 延迟绑定：后端没装时「整理记忆」只是产不出内容，插件其余能力照常。
 * - 只取 user / assistant 的**文本块**：工具调用、工具结果与推理过程对记忆提炼
 *   是噪声。
 * - `user/message` 只保留 `source.kind === 'user'`（真人输入），跳过 agent.inject()
 *   注入的上下文（文件变更通知、子目录 AGENTS.md、技能内容、定时任务提醒等）。
 * - 子代理会话（`header.origin === 'subagent'`）不计入，避免挤占真正的用户对话。
 * - 增量靠 seq 水位：只取 seq 大于上次水位的表面事件，因此定时整理不会反复重读
 *   同一段历史。
 *
 * 该模块只做结构读取（不引 `dsh-session-query` 的类型），避免与后端的安装形态耦合。
 *
 * @module dream-admin/sessions
 */
import type { Context } from '@deepseek-ai/cordis';
import { resolve } from 'node:path';

/** 一条参与提炼的对话消息。 */
export interface SessionMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** 一段可提炼的会话。 */
export interface SessionDigest {
  id: string;
  createdAt: number;
  /** 该会话表面事件的最大 seq，作为下次读取的水位。 */
  lastSeq: number;
  messages: SessionMessage[];
}

/** 一次扫描的结果。 */
export interface SessionScan {
  /** 有新内容、值得提炼的会话（按创建时间倒序）。 */
  digests: SessionDigest[];
  /** sessionId → 本次读到的最大 seq；成功整理后合并进水位。 */
  watermarks: Map<string, number>;
}

/** 读取参数。 */
export interface ReadSessionsOptions {
  /** 最多取多少个最近会话。 */
  maxSessions: number;
  /** 单条会话最多取多少条最近消息。 */
  maxMessages: number;
  /** sessionId → 已整理到的 seq 水位。 */
  since: Map<string, number>;
}

/** 会话历史读取器。 */
export interface SessionReader {
  /** sessionQuery 是否已挂载。 */
  available(): boolean;
  /** 扫描某工作区里「有新内容」的历史会话（含已关闭会话）。 */
  read(workspace: string, options: ReadSessionsOptions, signal?: AbortSignal): Promise<SessionScan>;
  /** 解除对 sessionQuery 的绑定。 */
  dispose(): void;
}

/** 会话 header 的只读子集。 */
interface SessionHeaderLike {
  id?: unknown;
  cwd?: unknown;
  createdAt?: unknown;
  origin?: unknown;
}

/** sessionQuery 服务的只读子集（`dsh-session-query` 的结构子集）。 */
interface SessionQueryLike {
  listSessions(signal?: AbortSignal): Promise<Array<{ header?: SessionHeaderLike }>>;
  readSurface(sessionId: string): Promise<{ events?: unknown[] }>;
}

/** 会话事件的最小结构。 */
interface SessionEventLike {
  type?: unknown;
  seq?: unknown;
  data?: unknown;
}

/**
 * 创建会话历史读取器，并用 `ctx.inject` 延迟绑定 sessionQuery。
 * 绑定生命周期挂在注入回调自己的 effect 作用域上，服务重载时自动跟随。
 */
export function createSessionReader(ctx: Context): SessionReader {
  let query: SessionQueryLike | undefined;
  const fiber = ctx.inject(['sessionQuery'], (serviceCtx) => {
    query = (serviceCtx as Context & { sessionQuery?: SessionQueryLike }).sessionQuery;
    serviceCtx.effect(
      () => () => {
        query = undefined;
      },
      'dream-admin: sessionQuery 绑定'
    );
  });

  return {
    available: () => query !== undefined,

    async read(workspace: string, options: ReadSessionsOptions, signal?: AbortSignal): Promise<SessionScan> {
      const service = query;
      if (service === undefined) return { digests: [], watermarks: new Map() };

      const records = await service.listSessions(signal);
      const target = normalizePath(workspace);
      const matching = records
        .map((record) => record?.header)
        .filter((header): header is SessionHeaderLike => header !== undefined)
        .filter((header) => typeof header.cwd === 'string' && normalizePath(header.cwd) === target)
        // 子代理会话不计入：它们与父会话共享 cwd，但内容是内部委派，不是用户的真实对话。
        .filter((header) => header.origin !== 'subagent')
        .sort((a, b) => createdAtOf(b) - createdAtOf(a))
        .slice(0, options.maxSessions);

      const digests: SessionDigest[] = [];
      const watermarks = new Map<string, number>();

      for (const header of matching) {
        const id = typeof header.id === 'string' ? header.id : '';
        if (id.length === 0) continue;

        let events: unknown[];
        try {
          const surface = await service.readSurface(id);
          events = Array.isArray(surface?.events) ? surface.events : [];
        } catch {
          // 单条会话读失败（损坏 / 已删除）不影响其余会话。
          continue;
        }

        const lastSeq = maxSeqOf(events);
        watermarks.set(id, lastSeq);

        const since = options.since.get(id) ?? -1;
        const messages = extractMessages(events, since).slice(-options.maxMessages);
        if (messages.length === 0) continue;

        digests.push({ id, createdAt: createdAtOf(header), lastSeq, messages });
      }

      return { digests, watermarks };
    },

    dispose() {
      void fiber.dispose();
    }
  };
}

/** 从表面事件里提取 seq 大于水位、且可提炼的对话消息。 */
function extractMessages(events: unknown[], sinceSeq: number): SessionMessage[] {
  const result: SessionMessage[] = [];
  for (const raw of events) {
    const event = raw as SessionEventLike;
    const seq = typeof event.seq === 'number' ? event.seq : -1;
    if (seq <= sinceSeq) continue;

    const role =
      event.type === 'user/message' ? 'user' : event.type === 'assistant/message' ? 'assistant' : undefined;
    if (role === undefined) continue;
    if (role === 'user' && !isHumanUserMessage(event)) continue;

    const text = eventText(event, role);
    if (text.length === 0) continue;
    result.push({ role, text });
  }
  return result;
}

/**
 * 判断一条 `user/message` 是否来自真人输入。
 * 只排除明确标注为非 user 的 source.kind（agent.inject 注入的上下文）；
 * 结构缺失时保守地保留。
 */
function isHumanUserMessage(event: SessionEventLike): boolean {
  const data = event.data as { source?: { kind?: unknown } } | undefined;
  const kind = data?.source?.kind;
  return typeof kind !== 'string' || kind.length === 0 || kind === 'user';
}

/** 取一条消息的纯文本（只取 text 块，忽略 reasoning 与 tool-call）。 */
function eventText(event: SessionEventLike, role: 'user' | 'assistant'): string {
  const data = event.data as { content?: unknown; message?: { content?: unknown } } | undefined;
  const content = role === 'user' ? data?.content : data?.message?.content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    const item = block as { type?: unknown; text?: unknown };
    if (item?.type === 'text' && typeof item.text === 'string') {
      const text = item.text.trim();
      if (text.length > 0) parts.push(text);
    }
  }
  return parts.join('\n');
}

/** 表面事件里的最大 seq；没有事件时为 -1。 */
function maxSeqOf(events: unknown[]): number {
  let max = -1;
  for (const raw of events) {
    const seq = (raw as SessionEventLike).seq;
    if (typeof seq === 'number' && seq > max) max = seq;
  }
  return max;
}

/** 会话创建时间；缺失按 0 处理。 */
function createdAtOf(header: SessionHeaderLike): number {
  return typeof header.createdAt === 'number' && Number.isFinite(header.createdAt) ? header.createdAt : 0;
}

/** 归一化路径用于比较（Windows 下大小写不敏感）。 */
function normalizePath(value: string): string {
  const resolved = resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
