/**
 * dream-admin —— DeepSeek Harness 的「随工作区管理的长期记忆」插件。
 *
 * 四层能力：
 *
 *   1. 记忆库（核心）：一个目录下的一堆 Markdown + YAML frontmatter 文件，
 *      工作区模式下落点是 `<工作区>/memory`，没有工作区时回落
 *      `<DSH_HOME>/dream-admin/memory`。用户可以用任何编辑器直接改。
 *   2. 召回：`ctx.systemPrompt.context()` 注册动态 context，每个模型轮次把
 *      「置顶 + 最近更新」的记忆**摘要**注入系统提示（分层注入省 token），正文由
 *      `memory_read` 按需读取。
 *   3. 工具：`memory_search`（BM25 关键词 + 可选模型改写融合）/ `memory_read` /
 *      `memory_list` / `memory_forget`。
 *   4. 整理记忆（可开关）：按间隔读取各工作区的历史会话（含已关闭的会话），
 *      调用用户指定的模型提炼出值得长期记住的事实并写入记忆库；也可以在对话框
 *      输入 `/记忆` 立即整理一次（见 client/index.ts，直接调用本插件的 HTTP 接口）。
 *   5. 入梦（可开关）：按间隔调用用户指定的模型，对已有记忆做合并 / 去重 / 提炼；
 *      也可以在对话框输入 `/入梦` 立即入梦一次。
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
import { createCapturer } from './capture.js';
import { createEvolver } from './evolve.js';
import {
  createRootResolver,
  listWorkspaces,
  registryWorkspaces,
  type WorkspaceRef,
  type WorkspaceRegistryLike
} from './paths.js';
import { installRecall } from './prompt.js';
import { registerRoutes } from './routes.js';
import { createSemanticEngine } from './semantic.js';
import { createSessionReader } from './sessions.js';
import { createTaskRegistry } from './tasks.js';
import { registerMemoryTools } from './tools.js';

export { Config, PLUGIN_NAME, resolvePluginConfig } from './config.js';
export type { PluginConfig, PluginConfigInput } from './config.js';

/** cordis 插件名，用于加载器诊断。 */
export const name = PLUGIN_NAME;

/**
 * 本入口通过 `ctx` 访问的服务。
 *
 * - `llm`：整理记忆 / 入梦调用的模型入口（provider / model 从 DSH 模型列表里选）。
 * - `tools`：注册 memory_* 工具。
 * - `sessions`：读会话 header 的 cwd，得到「当前工作区」。
 * - `systemPrompt`：注入召回的记忆。
 * - `webServer`：承载管理页所需的 `/dream-admin/*` 路由。
 *
 * `sessionQuery`（读历史会话）是**可选**服务，不写进 inject：它由
 * `dsh-session-query-sqlite` 后端挂载，未挂载时「整理记忆」只是产不出内容，
 * 其余能力照常工作。见 sessions.ts 里的 `ctx.inject`。
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
        search: sectionValue(config.search),
        evolve: sectionValue(config.evolve),
        capture: sectionValue(config.capture)
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
    groupBy: () => resolved().store.groupBy,
    sessions: () => ctx.sessions.list()
  });

  // DSH 工作区注册表（`ctx.workspaceRegistry`）：宿主侧可选能力。它是「面板里列出
  // DSH 展示的所有工作区」的真源，按目录持久记录，不依赖会话是否还活着；没挂时回退
  // 到按会话 cwd 发现，行为与以前一致。
  let workspaceRegistry: WorkspaceRegistryLike | undefined;
  ctx.inject(['workspaceRegistry'], (serviceCtx) => {
    workspaceRegistry = (serviceCtx as Context & { workspaceRegistry?: WorkspaceRegistryLike })
      .workspaceRegistry;
    serviceCtx.effect(
      () => () => {
        workspaceRegistry = undefined;
      },
      'dream-admin: workspaceRegistry 绑定'
    );
  });

  /** 面板用的工作区候选：优先 DSH 注册表，其次会话 cwd。 */
  const listWorkspaceCandidates = (): WorkspaceRef[] => {
    const fromRegistry = workspaceRegistry === undefined ? [] : registryWorkspaces(workspaceRegistry);
    return fromRegistry.length > 0 ? fromRegistry : listWorkspaces(ctx.sessions.list());
  };

  const applyOverride = (patch: Partial<PluginConfigInput>): Partial<PluginConfigInput> => {
    runtimeOverride = mergeConfig(runtimeOverride ?? {}, patch);
    return runtimeOverride;
  };

  const semantic = createSemanticEngine({ resolved: () => resolved().search, llm: ctx.llm });

  const evolver = createEvolver(ctx, { resolved, resolveRoot, sessions: () => ctx.sessions.list() });
  const sessionReader = createSessionReader(ctx);
  const capturer = createCapturer(ctx, {
    resolved,
    resolveRoot,
    sessions: () => ctx.sessions.list(),
    sessionReader
  });

  // 长任务注册表：让「整理记忆」「入梦」的执行从「一个同步请求」变成
  // 「可轮询进度、可中断的任务」，管理页与对话框命令共用。
  const tasks = createTaskRegistry();

  const disposeRoutes = registerRoutes(ctx, {
    resolved,
    currentOverride: () => runtimeOverride ?? {},
    applyOverride,
    resolveRoot,
    sessions: () => ctx.sessions.list(),
    listWorkspaces: listWorkspaceCandidates,
    evolver,
    capturer,
    semantic,
    tasks
  });

  const disposeTools = registerMemoryTools(ctx, { resolved, resolveRoot, semantic });

  const disposeRecall = installRecall(ctx, {
    resolved,
    resolveRoot,
    currentRoot: () => resolveRoot()
  });

  ctx.effect(
    () => () => {
      disposeRoutes();
      disposeTools();
      disposeRecall();
      // 先取消在跑的长任务，再停各自的定时器。
      tasks.dispose();
      evolver.dispose();
      capturer.dispose();
      semantic.dispose();
      sessionReader.dispose();
    },
    'dream-admin: 路由 / 工具 / 召回 / 整理记忆 / 入梦 生命周期'
  );

  const cfg = resolved();
  ctx.logger.info(
    `dream-admin 已加载（分组: ${cfg.store.groupBy}，` +
    `召回: ${cfg.recall.enabled ? `开(${cfg.recall.limit})` : '关'}，` +
    `语义检索: ${cfg.search.semantic ? `开(${cfg.search.provider}/${cfg.search.model})` : '关'}，` +
    `整理记忆: ${cfg.capture.enabled ? `开(${cfg.capture.provider}/${cfg.capture.model})` : '关'}，` +
    `入梦: ${cfg.evolve.enabled ? `开(${cfg.evolve.provider}/${cfg.evolve.model})` : '关'}，` +
    `当前记忆根: ${resolveRoot()}）`
  );
}
