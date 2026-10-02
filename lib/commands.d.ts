/**
 * 对话框命令 `/memoryup`：在对话里立即执行一次记忆梦境（整理 / 合并 / 去重记忆）。
 *
 * 走 DSH 的 `commands` 服务（`ctx.commands.register`）：命令直接跑在宿主侧，
 * 不产生模型消息，结果只在界面里显示一次。
 *
 * 模型选择：设置里单独配了 provider / model 就用它；没配就退回到**当前对话模型**
 * （取会话最近一次请求头里的路由），因此「没配置记忆模型」不再是死路。
 *
 * 命令名只能是 `[a-z][a-z0-9_-]*`（DSH 的硬约束），所以注册名是 `memoryup`。
 *
 * @module dream-admin/commands
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Evolver } from './evolve.js';
/** 命令名（小写，符合 DSH 的 `[a-z][a-z0-9_-]*` 约束）。 */
export declare const COMMAND_NAME = "memoryup";
/** 命令依赖面。 */
export interface CommandDeps {
    evolver: Evolver;
}
/**
 * 注册 `/memoryup`。
 *
 * `commands` 用 `ctx.inject` 延迟取用：无 UI 的 spine 不装配该服务时，
 * 本插件其余能力（工具 / 召回 / 管理页）照常工作，只是没有这条命令。
 *
 * @returns 注销命令的 disposer。
 */
export declare function registerMemoryCommand(ctx: Context, deps: CommandDeps): () => void;
