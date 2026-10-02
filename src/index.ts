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
// 类型副作用导入：把 ctx.webServer / ctx.llm / ctx.tools / ctx.systemPrompt
// 的服务增补拉进编译期；运行时被擦除。
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-llm';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import {
  Config,
  PLUGIN_NAME,
  loadStoredConfig,
  mergeConfig,
  resolvePluginConfig,
  sectionValue,
  type PluginConfig,
  type PluginConfigInput,
  type ResolvedPluginConfig
} from './config.js';
import { createEvolver } from './evolve.js';
import { registerMemoryCommand } from './commands.js';
import { createRootResolver } from './paths.js';
import { installRecall } from './prompt.js';
import { registerRoutes } from './routes.js';
import { registerMemoryTools } from './tools.js';

export { Config, PLUGIN_NAME, resolvePluginConfig } from './config.js';
export type { PluginConfig, PluginConfigInput } from './config.js';

/** cordis 插件名，用于加载器诊断。 */
export const name = PLUGIN_NAME;

/**
 * 本入口通过 `ctx` 访问的服务。
 *
 * - `llm`：记忆梦境调用的模型入口（provider / model 从 DSH 模型列表里选）。
 * - `tools`：注册 memory_* 工具。
 * - `sessions`：读会话 header 的 cwd，得到「当前工作区」。
 * - `systemPrompt`：注入召回的记忆。
 * - `webServer`：承载管理页所需的 `/dream-admin/*` 路由。
 */
export const inject = ['llm', 'tools', 'sessions', 'systemPrompt', 'webServer'];

/** Cordis 插件入口。 */
export function apply(ctx: Context, config: PluginConfig): void {
  // UI（记忆管理页）写入的配置覆盖；启动时先读持久化文件，重启后仍然生效。
  let runtimeOverride: Partial<PluginConfigInput> | undefined = loadStoredConfig();

  // 每次访问都重新解析：volatile 节交付的是活引用，解析很便宜且永远是最新值。
  // 一份非法配置不应该打断正在进行的会话 —— 保留上一份可用快照。
  let lastGood: ResolvedPluginConfig | undefined;
  const resolved = (): ResolvedPluginConfig => {
    const raw = mergeConfig(
      {
        store: sectionValue(config.store),
        recall: sectionValue(config.recall),
        evolve: sectionValue(config.evolve)
      },
      runtimeOverride ?? {}
    ) as PluginConfigInput;
    try {
      const next = resolvePluginConfig(raw);
      lastGood = next;
      return next;
    } catch (error) {
      if (lastGood === undefined) throw error;
      ctx.logger.error('dream-admin: 配置非法，继续沿用上一份可用配置');
      ctx.logger.error(error);
      return lastGood;
    }
  };

  const resolveRoot = createRootResolver({
    store: () => resolved().store,
    sessions: () => ctx.sessions.list()
  });

  const applyOverride = (patch: Partial<PluginConfigInput>): Partial<PluginConfigInput> => {
    runtimeOverride = mergeConfig(runtimeOverride ?? {}, patch);
    return runtimeOverride;
  };

  const evolver = createEvolver(ctx, { resolved, resolveRoot });

  const disposeRoutes = registerRoutes(ctx, {
    resolved,
    currentOverride: () => runtimeOverride ?? {},
    applyOverride,
    resolveRoot,
    sessions: () => ctx.sessions.list(),
    evolver
  });

  const disposeTools = registerMemoryTools(ctx, { resolved, resolveRoot });

  const disposeCommand = registerMemoryCommand(ctx, { evolver });

  const disposeRecall = installRecall(ctx, {
    resolved,
    resolveRoot,
    currentRoot: () => resolveRoot()
  });

  ctx.effect(
    () => () => {
      disposeRoutes();
      disposeTools();
      disposeCommand();
      disposeRecall();
      evolver.dispose();
    },
    'dream-admin: 路由 / 工具 / 命令 / 召回 / 记忆梦境 生命周期'
  );

  const cfg = resolved();
  ctx.logger.info(
    `dream-admin 已加载（作用域: ${cfg.store.scope}，目录: ${cfg.store.dir}，` +
    `召回: ${cfg.recall.enabled ? `开(${cfg.recall.limit})` : '关'}，` +
    `记忆梦境: ${cfg.evolve.enabled ? `开(${cfg.evolve.provider}/${cfg.evolve.model})` : '关'}，` +
    `当前记忆根: ${resolveRoot()}）`
  );
}
