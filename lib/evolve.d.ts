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
import type { ResolvedPluginConfig } from './config.js';
import { type ModelRoute } from './llm.js';
import { type RootResolver } from './paths.js';
import type { ProgressReporter } from './tasks.js';
/** 一次记忆梦境的结果。 */
export interface EvolveOutcome {
    ok: boolean;
    /** 未执行时的原因码。 */
    reason?: 'disabled' | 'model_not_configured' | 'too_few_memories' | 'busy' | 'llm_error' | 'unparsable' | 'cancelled';
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
/**
 * 创建记忆梦境执行器，并按配置挂上定时器。
 * 定时器与 disposer 由调用方在插件卸载时释放。
 */
export declare function createEvolver(ctx: Context, deps: EvolveDeps): Evolver;
/** 读取某个工作区的入梦记录，按时间倒序（最新在前）。 */
export declare function listDreamRecords(root: string, limit?: number): DreamRecord[];
