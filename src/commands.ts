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
import type { EvolveOutcome, Evolver, ModelRoute } from './evolve.js';

/** 命令名（小写，符合 DSH 的 `[a-z][a-z0-9_-]*` 约束）。 */
export const COMMAND_NAME = 'memoryup';

/** 命令不接受参数。 */
const USAGE = '用法：/memoryup（不需要参数）';

/** 命令拿得到的 agent 视图：只需要会话最近一次请求的模型路由。 */
interface CommandAgent {
  session: {
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
}

/**
 * 注册 `/memoryup`。
 *
 * `commands` 用 `ctx.inject` 延迟取用：无 UI 的 spine 不装配该服务时，
 * 本插件其余能力（工具 / 召回 / 管理页）照常工作，只是没有这条命令。
 *
 * @returns 注销命令的 disposer。
 */
export function registerMemoryCommand(ctx: Context, deps: CommandDeps): () => void {
  const fiber = ctx.inject(['commands'], (commandCtx) => {
    const registry = (commandCtx as Context & { commands?: CommandRegistry }).commands;
    if (registry === undefined) return;
    // 交给注入回调自己的 effect 作用域：服务重载时旧注册先撤销，再重新注册。
    commandCtx.effect(
      () =>
        registry.register({
          name: COMMAND_NAME,
          description: '立即整理一次记忆',
          handler: async ({ agent, rawInput, signal }) => {
            if (rawInput.trim().length > 0) return { kind: 'error', text: USAGE };
            const outcome = await deps.evolver.run(true, currentRoute(agent), signal);
            if (signal.aborted) return { kind: 'error', text: '记忆整理已取消。' };
            return settle(outcome);
          }
        }),
      'dream-admin: /memoryup'
    );
  });

  return () => {
    void fiber.dispose();
  };
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

/** 把记忆梦境结果翻成一行命令结果。 */
function settle(outcome: EvolveOutcome): CommandResult {
  const prefix = outcome.route === undefined ? '' : `模型 ${outcome.route.provider}/${outcome.route.model}：`;
  switch (outcome.reason) {
    case undefined:
      return { kind: 'success', text: `${prefix}${outcome.log}` };
    case 'too_few_memories':
      return { kind: 'success', text: outcome.log };
    case 'busy':
      return { kind: 'error', text: '上一次记忆整理还没结束，请稍后再试。' };
    case 'model_not_configured':
      return {
        kind: 'error',
        text: '没有可用的模型：请在设置里为记忆梦境选择模型，或在一个已经用过模型的会话里执行。'
      };
    case 'disabled':
      return { kind: 'error', text: '记忆梦境未开启。' };
    case 'llm_error':
    case 'unparsable':
      return { kind: 'error', text: `${prefix}${outcome.log}` };
  }
}
