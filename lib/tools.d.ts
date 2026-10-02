/**
 * 面向模型的记忆工具：save / search / list / forget。
 *
 * 用 `@deepseek-ai/dsh-tools` 的 `defineTool` 定义（它会做参数 schema 转换与
 * 执行期校验）。该模块由 DSH 宿主提供，因此保持外部导入。
 *
 * @module dream-admin/tools
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ResolvedPluginConfig } from './config.js';
import type { RootResolver } from './paths.js';
/** 工具依赖面。 */
export interface ToolDeps {
    resolved: () => ResolvedPluginConfig;
    resolveRoot: RootResolver;
}
/**
 * 注册全部记忆工具。
 * @returns 取消注册的 disposer。
 */
export declare function registerMemoryTools(ctx: Context, deps: ToolDeps): () => void;
