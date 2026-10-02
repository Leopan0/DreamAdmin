/**
 * 记忆召回：把当前工作区里「置顶 + 最近更新」的记忆注入系统提示。
 *
 * 用 `ctx.systemPrompt.context()` 注册一个**动态** context：每次模型轮次装配
 * 提示时它的 `text` 函数才被调用，因此读到的一定是最新的记忆库与最新的工作区。
 *
 * 这里注入的是「工作记忆」式的近期 + 置顶条目，而不是按当前提问做检索——
 * 装配期拿不到用户本轮消息。精确检索交给 `memory_search` 工具。
 *
 * @module dream-admin/prompt
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type { ResolvedPluginConfig } from './config.js';
import type { RootResolver } from './paths.js';
import { listMemories, readMemory, renderRecall, truncate } from './store.js';

/** 注入系统提示的 context 名（全局唯一，避免与别的插件撞名）。 */
const RECALL_CONTEXT_NAME = 'dream-admin:memory';

/** 排序位置：放在运行时上下文的中段，避免抢在身份 / 环境事实之前。 */
const RECALL_CONTEXT_ORDER = 60;

/** 召回依赖面。 */
export interface RecallDeps {
  /** 当前解析后的配置。 */
  resolved: () => ResolvedPluginConfig;
  /** 记忆根目录解析器。 */
  resolveRoot: RootResolver;
  /** 记忆根目录的当前值（供日志/调试）。 */
  currentRoot: () => string;
}

/**
 * 注册动态召回 context。
 *
 * @returns 取消注册的 disposer（必须由调用方在插件卸载时调用——注册挂在
 *   systemPrompt 服务上，不会随本插件 fiber 自动回收）。
 */
export function installRecall(ctx: Context, deps: RecallDeps): () => void {
  return ctx.systemPrompt.context({
    name: RECALL_CONTEXT_NAME,
    order: RECALL_CONTEXT_ORDER,
    text: () => buildRecallText(deps)
  });
}

/** 装配一次召回文本；任何异常都吞掉，绝不让记忆库问题打断模型调用。 */
function buildRecallText(deps: RecallDeps): string {
  try {
    const recall = deps.resolved().recall;
    if (!recall.enabled || recall.limit <= 0) return '';

    const root = deps.resolveRoot();
    const summaries = listMemories(root).slice(0, recall.limit);
    if (summaries.length === 0) return '';

    const records = [];
    for (const summary of summaries) {
      const record = readMemory(root, summary.id);
      if (record !== undefined) records.push(record);
    }

    const maxChars = recall.maxChars > 0 ? recall.maxChars : Number.MAX_SAFE_INTEGER;
    const text = truncate(renderRecall(records, maxChars), maxChars);
    // 记忆是用户可编辑的自由文本，可能含有 `{{`；装配期会把 `{{name}}` 当作
    // 提示变量引用解析，解析失败会直接抛错。这里做一次中和，保证注入永远安全。
    return neutralizeBraces(text);
  } catch {
    return '';
  }
}

/**
 * 中和 `{{` 序列，避免被系统提示模板当成变量引用。
 * 用等价的 `{ {` 替换，语义不变但不再触发插值。
 */
export function neutralizeBraces(text: string): string {
  return text.replace(/\{\{/g, '{ {');
}
