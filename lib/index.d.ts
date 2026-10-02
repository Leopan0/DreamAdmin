/**
 * dream-admin —— DeepSeek Harness 的「随工作区管理的长期记忆」插件。
 *
 * 四层能力：
 *
 *   1. 记忆库（核心）：一个目录下的一堆 Markdown + YAML frontmatter 文件，
 *      工作区模式下落点是 `<工作区>/memory`，没有工作区时回落
 *      `<DSH_HOME>/dream-admin/memory`。用户可以用任何编辑器直接改。
 *   2. 召回：`ctx.systemPrompt.context()` 注册动态 context，每个模型轮次把
 *      「置顶 + 最近更新」的记忆注入系统提示。
 *   3. 工具：`memory_save` / `memory_search` / `memory_list` / `memory_forget`。
 *   4. 记忆梦境（可开关）：按间隔调用用户指定的模型，对记忆做合并 / 去重 / 提炼；
 *      也可以在对话框输入 `/memoryup` 立即整理一次（未单独配置模型时用当前对话模型）。
 *
 * 另有一组 `GET/POST /dream-admin/*` 路由，供浏览器侧的「记忆管理」页面（与
 * 插件管理同级的顶级面板）读写记忆与配置。
 *
 * @module dream-admin
 */
import type { Context } from '@deepseek-ai/cordis';
import { type PluginConfig } from './config.js';
export { Config, PLUGIN_NAME, resolvePluginConfig } from './config.js';
export type { PluginConfig, PluginConfigInput } from './config.js';
/** cordis 插件名，用于加载器诊断。 */
export declare const name = "dream-admin";
/**
 * 本入口通过 `ctx` 访问的服务。
 *
 * - `llm`：记忆梦境调用的模型入口（provider / model 从 DSH 模型列表里选）。
 * - `tools`：注册 memory_* 工具。
 * - `sessions`：读会话 header 的 cwd，得到「当前工作区」。
 * - `systemPrompt`：注入召回的记忆。
 * - `webServer`：承载管理页所需的 `/dream-admin/*` 路由。
 */
export declare const inject: string[];
/** Cordis 插件入口。 */
export declare function apply(ctx: Context, config: PluginConfig): void;
