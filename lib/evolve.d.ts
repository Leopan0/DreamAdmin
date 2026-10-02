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
import type { ResolvedPluginConfig } from './config.js';
import type { RootResolver } from './paths.js';
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
/**
 * 创建记忆梦境执行器，并按配置挂上定时器。
 * 定时器与 disposer 由调用方在插件卸载时释放。
 */
export declare function createEvolver(ctx: Context, deps: EvolveDeps): Evolver;
