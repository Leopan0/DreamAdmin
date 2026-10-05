/**
 * 对话框命令：
 *   `/memorysave` —— 立即整理一次记忆（读取当前工作区的历史会话，提炼成记忆）。
 *   `/memoryup`   —— 立即入梦一次（对已有记忆做合并 / 去重 / 提炼）。
 *
 * 两者都走 DSH 的 `commands` 服务（`ctx.commands.register`）：命令直接跑在宿主侧，
 * 不产生模型消息，结果只在界面里显示一次。
 *
 * 模型选择：设置里单独配了 provider / model 就用它；没配就退回到**当前对话模型**
 * （取会话最近一次请求头里的路由），因此「没配置记忆模型」不再是死路。
 *
 * 命令名只能是 `[a-z][a-z0-9_-]*`（DSH 的硬约束），所以注册名是小写 id。
 *
 * @module dream-admin/commands
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Capturer } from './capture.js';
import type { Evolver } from './evolve.js';
/** 入梦命令名（小写，符合 DSH 的 `[a-z][a-z0-9_-]*` 约束）。 */
export declare const EVOLVE_COMMAND_NAME = "memoryup";
/** 整理记忆命令名。 */
export declare const CAPTURE_COMMAND_NAME = "memorysave";
/** 命令依赖面。 */
export interface CommandDeps {
    evolver: Evolver;
    capturer: Capturer;
}
/**
 * 注册 `/memorysave` 与 `/memoryup`。
 *
 * `commands` 用 `ctx.inject` 延迟取用：无 UI 的 spine 不装配该服务时，
 * 本插件其余能力（工具 / 召回 / 管理页）照常工作，只是没有这两条命令。
 *
 * @returns 注销命令的 disposer。
 */
export declare function registerMemoryCommand(ctx: Context, deps: CommandDeps): () => void;
