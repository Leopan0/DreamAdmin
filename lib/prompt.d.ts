/**
 * 记忆召回：把当前工作区里「置顶 + 最近更新」的记忆注入系统提示。
 *
 * 用 `ctx.systemPrompt.context()` 注册一个**动态** context：每次模型轮次装配
 * 提示时它的 `text` 函数才被调用，因此读到的一定是最新的记忆库与最新的工作区。
 *
 * 这里注入的是「工作记忆」式的近期 + 置顶条目，而不是按当前提问做检索——
 * 装配期拿不到用户本轮消息。精确检索交给 `memory_search` 工具。
 *
 * @module dream-admin/prompt
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedPluginConfig } from './config.js';
import type { RootResolver } from './paths.js';
/** 召回依赖面。 */
export interface RecallDeps {
    /** 当前解析后的配置。 */
    resolved: () => ResolvedPluginConfig;
    /** 记忆根目录解析器。 */
    resolveRoot: RootResolver;
    /** 记忆根目录的当前值（供日志/调试）。 */
    currentRoot: () => string;
}
/**
 * 注册动态召回 context。
 *
 * @returns 取消注册的 disposer（必须由调用方在插件卸载时调用——注册挂在
 *   systemPrompt 服务上，不会随本插件 fiber 自动回收）。
 */
export declare function installRecall(ctx: Context, deps: RecallDeps): () => void;
/**
 * 中和 `{{` 序列，避免被系统提示模板当成变量引用。
 * 用等价的 `{ {` 替换，语义不变但不再触发插值。
 */
export declare function neutralizeBraces(text: string): string;
