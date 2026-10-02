import type { Context } from '@deepseek-ai/cordis';
import { type PluginConfigInput, type ResolvedPluginConfig } from './config.js';
import type { Evolver } from './evolve.js';
import { type RootResolver } from './paths.js';
/** 路由依赖面。 */
export interface RouteDeps {
    /** 当前解析后的配置。 */
    resolved: () => ResolvedPluginConfig;
    /** 当前生效的配置覆盖（含 patch 层与 UI 层）。 */
    currentOverride: () => Partial<PluginConfigInput>;
    /** 写入一份新的配置覆盖（运行期 + 落盘）。 */
    applyOverride: (patch: Partial<PluginConfigInput>) => Partial<PluginConfigInput>;
    /** 记忆根目录解析器。 */
    resolveRoot: RootResolver;
    /** 活着的会话列表（用于工作区发现）。 */
    sessions: () => unknown;
    /** 记忆梦境执行器。 */
    evolver: Evolver;
}
/** 注册全部 HTTP 路由。@returns 一次性释放全部路由的 disposer。 */
export declare function registerRoutes(ctx: Context, deps: RouteDeps): () => void;
