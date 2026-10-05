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
import type { CaptureOutcome, Capturer } from './capture.js';
import type { EvolveOutcome, Evolver, ModelRoute } from './evolve.js';

/** 入梦命令名（小写，符合 DSH 的 `[a-z][a-z0-9_-]*` 约束）。 */
export const EVOLVE_COMMAND_NAME = 'memoryup';

/** 整理记忆命令名。 */
export const CAPTURE_COMMAND_NAME = 'memorysave';

/** 命令拿得到的 agent 视图：会话 header（取 cwd）与最近一次请求的模型路由。 */
interface CommandAgent {
  session: {
    header?: { cwd?: unknown };
    requestHeader(): { config: { provider: string; model: string } } | undefined;
  };
}

/** 命令调用上下文（`dsh-commands` invocation 里本命令用到的部分）。 */
interface CommandInvocation {
  agent: CommandAgent;
  rawInput: string;
  signal: AbortSignal;
}

/** 命令结果：`text` 直接渲染在界面上，不进入模型历史。 */
interface CommandResult {
  kind: 'success' | 'error';
  text: string;
}

/** 命令注册表（`dsh-commands` 服务的结构子集）。 */
interface CommandRegistry {
  register(definition: {
    name: string;
    description: string;
    handler: (invocation: CommandInvocation) => CommandResult | Promise<CommandResult>;
  }): () => void;
}

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
export function registerMemoryCommand(ctx: Context, deps: CommandDeps): () => void {
  const fiber = ctx.inject(['commands'], (commandCtx) => {
    const registry = (commandCtx as Context & { commands?: CommandRegistry }).commands;
    if (registry === undefined) return;
    // 交给注入回调自己的 effect 作用域：服务重载时旧注册先撤销，再重新注册。
    commandCtx.effect(
      () => {
        const disposeCapture = registry.register({
          name: CAPTURE_COMMAND_NAME,
          description: '立即整理一次记忆：读取当前工作区的历史会话并提炼成记忆',
          handler: async ({ agent, rawInput, signal }) => {
            if (rawInput.trim().length > 0) return { kind: 'error', text: `用法：/${CAPTURE_COMMAND_NAME}（不需要参数）` };
            const outcome = await deps.capturer.run(
              true,
              { workspace: currentWorkspace(agent), fallbackRoute: currentRoute(agent) },
              signal
            );
            if (signal.aborted) return { kind: 'error', text: '整理记忆已取消。' };
            return settleCapture(outcome);
          }
        });

        const disposeEvolve = registry.register({
          name: EVOLVE_COMMAND_NAME,
          description: '立即入梦一次：对已有记忆做合并 / 去重 / 提炼',
          handler: async ({ agent, rawInput, signal }) => {
            if (rawInput.trim().length > 0) return { kind: 'error', text: `用法：/${EVOLVE_COMMAND_NAME}（不需要参数）` };
            const outcome = await deps.evolver.run(true, currentRoute(agent), signal);
            if (signal.aborted) return { kind: 'error', text: '入梦已取消。' };
            return settleEvolve(outcome);
          }
        });

        return () => {
          disposeCapture();
          disposeEvolve();
        };
      },
      'dream-admin: /memorysave + /memoryup'
    );
  });

  return () => {
    void fiber.dispose();
  };
}

/** 取当前会话所在的工作区（header.cwd）；取不到时返回 undefined，由执行器回退到全部工作区。 */
function currentWorkspace(agent: CommandAgent): string | undefined {
  const cwd = agent.session.header?.cwd;
  return typeof cwd === 'string' && cwd.trim().length > 0 ? cwd.trim() : undefined;
}

/** 取当前会话最近一次请求使用的模型路由；会话还没发起过请求时返回 undefined。 */
function currentRoute(agent: CommandAgent): ModelRoute | undefined {
  const config = agent.session.requestHeader()?.config;
  if (config === undefined) return undefined;
  const provider = typeof config.provider === 'string' ? config.provider : '';
  const model = typeof config.model === 'string' ? config.model : '';
  if (provider.length === 0 || model.length === 0) return undefined;
  return { provider, model };
}

/** 把整理记忆结果翻成一行命令结果。 */
function settleCapture(outcome: CaptureOutcome): CommandResult {
  const prefix = outcome.route === undefined ? '' : `模型 ${outcome.route.provider}/${outcome.route.model}：`;
  switch (outcome.reason) {
    case undefined:
      return { kind: 'success', text: `${prefix}${outcome.log}` };
    case 'busy':
      return { kind: 'error', text: '上一次整理记忆还没结束，请稍后再试。' };
    case 'model_not_configured':
      return {
        kind: 'error',
        text: '没有可用的模型：请在设置里为「整理记忆」选择模型，或在一个已经用过模型的会话里执行。'
      };
    case 'disabled':
      return { kind: 'error', text: '整理记忆未开启。' };
    case 'no_workspaces':
    case 'no_sessions':
    case 'llm_error':
    case 'unparsable':
      return { kind: 'error', text: `${prefix}${outcome.log}` };
  }
}

/** 把入梦结果翻成一行命令结果。 */
function settleEvolve(outcome: EvolveOutcome): CommandResult {
  const prefix = outcome.route === undefined ? '' : `模型 ${outcome.route.provider}/${outcome.route.model}：`;
  switch (outcome.reason) {
    case undefined:
      return { kind: 'success', text: `${prefix}${outcome.log}` };
    case 'too_few_memories':
      return { kind: 'success', text: outcome.log };
    case 'busy':
      return { kind: 'error', text: '上一次入梦还没结束，请稍后再试。' };
    case 'model_not_configured':
      return {
        kind: 'error',
        text: '没有可用的模型：请在设置里为「入梦」选择模型，或在一个已经用过模型的会话里执行。'
      };
    case 'disabled':
      return { kind: 'error', text: '入梦未开启。' };
    case 'llm_error':
    case 'unparsable':
      return { kind: 'error', text: `${prefix}${outcome.log}` };
  }
}
