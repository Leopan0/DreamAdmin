import type { Context } from '@deepseek-ai/cordis';
import { type PluginConfigInput, type ResolvedPluginConfig } from './config.js';
import type { Capturer } from './capture.js';
import { type Evolver } from './evolve.js';
import { type RootResolver, type WorkspaceRef } from './paths.js';
import type { SemanticEngine } from './semantic.js';
import type { TaskRegistry } from './tasks.js';
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
    /** 面板用的工作区候选（DSH 工作区注册表优先，其次会话 cwd）。 */
    listWorkspaces: () => WorkspaceRef[];
    /** 入梦执行器。 */
    evolver: Evolver;
    /** 整理记忆执行器。 */
    capturer: Capturer;
    /** 语义检索引擎（关键词 + 可选模型扩写词融合）。 */
    semantic: SemanticEngine;
    /** 长任务注册表：承载「整理记忆」「入梦」的进度与取消。 */
    tasks: TaskRegistry;
}
/** 注册全部 HTTP 路由。@returns 一次性释放全部路由的 disposer。 */
export declare function registerRoutes(ctx: Context, deps: RouteDeps): () => void;
