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
import type { ResolvedPluginConfig } from './config.js';
import { type ModelRoute } from './llm.js';
import { type RootResolver } from './paths.js';
import type { SessionReader } from './sessions.js';
import type { ProgressReporter } from './tasks.js';
/** 一次整理记忆的结果。 */
export interface CaptureOutcome {
    ok: boolean;
    /** 未执行时的原因码。 */
    reason?: 'disabled' | 'model_not_configured' | 'busy' | 'no_workspaces' | 'no_sessions' | 'llm_error' | 'unparsable' | 'cancelled';
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
    /** 阶段进度上报：长任务注册表把它接到轮询接口上。 */
    onProgress?: ProgressReporter;
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
/**
 * 创建整理记忆执行器，并按配置挂上定时器。
 * 定时器与 disposer 由调用方在插件卸载时释放。
 */
export declare function createCapturer(ctx: Context, deps: CaptureDeps): Capturer;
