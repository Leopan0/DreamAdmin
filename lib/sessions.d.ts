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
/**
 * 创建会话历史读取器，并用 `ctx.inject` 延迟绑定 sessionQuery。
 * 绑定生命周期挂在注入回调自己的 effect 作用域上，服务重载时自动跟随。
 */
export declare function createSessionReader(ctx: Context): SessionReader;
