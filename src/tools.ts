/**
 * 面向模型的记忆工具：search / read / list / forget。
 *
 * 用 `@deepseek-ai/dsh-tools` 的 `defineTool` 定义（它会做参数 schema 转换与
 * 执行期校验）。该模块由 DSH 宿主提供，因此保持外部导入。
 *
 * @module dream-admin/tools
 */
import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { ResolvedPluginConfig } from './config.js';
import type { RootResolver } from './paths.js';
import type { SemanticEngine } from './semantic.js';
import {
  deleteMemory,
  isValidId,
  listMemories,
  readMemory,
  type MemorySummary
} from './store.js';

/** 工具依赖面。 */
export interface ToolDeps {
  resolved: () => ResolvedPluginConfig;
  resolveRoot: RootResolver;
  /** 语义检索引擎（关键词 + 可选模型扩写词融合）。 */
  semantic: SemanticEngine;
}

/** 工具注册失败时抛出的可读错误。 */
function fail(message: string): never {
  throw new Error(message);
}

/** 把渲染用的出错行拼好。 */
function failureLine(id: string, action: string, site: string): string {
  return `ERROR: memory/${action}_failed — id=${id} site=${site}`;
}

/** 渲染一条摘要行（含工作区 / peer 归属与一句话摘要）。 */
function summaryLine(index: number, item: MemorySummary): string {
  const flags = item.pinned ? ' [置顶]' : '';
  const tagText = item.tags.length > 0 ? ` (${item.tags.join(', ')})` : '';
  const line = `${index + 1}. ${item.title}${tagText}${flags} — id: ${item.id} — 更新于 ${item.updated}${scopeLabel(item.workspace, item.peer)}`;
  return item.summary.length > 0 ? `${line}\n   摘要：${item.summary}` : line;
}

/** 归属标签：优先工作区末段名，其次 peer。 */
function scopeLabel(workspace: string | undefined, peer: string | undefined): string {
  if (workspace !== undefined && workspace.length > 0) return ` — 工作区: ${lastSegment(workspace)}`;
  if (peer !== undefined && peer.length > 0) return ` — 工作区: ${peer}`;
  return '';
}

/** 取路径最后一段作为展示名。 */
function lastSegment(value: string): string {
  const parts = value.split(/[\\/]/).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? value;
}

/**
 * 注册全部记忆工具。
 * @returns 取消注册的 disposer。
 */
export function registerMemoryTools(ctx: Context, deps: ToolDeps): () => void {
  const disposers: Array<() => void> = [];

  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'memory_search',
        description:
          '在长期记忆库里检索（本地 BM25 关键词；若开启语义召回则与模型扩写出的相关词结果融合）。' +
          '系统提示里只注入了少量摘要，需要找历史结论或细节时用这个工具，再用 memory_read 读正文。',
        parameters: {
          query: { type: 'string', required: true, description: '检索词，空格分隔多个词；中文按二字词匹配。' },
          limit: { type: 'number', description: '返回条数上限，默认 8。' },
          workspace: { type: 'string', description: '工作区绝对路径；省略时用当前活跃工作区。' }
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }]
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
          if (exec.signal.aborted) fail('memory_search 已取消');
          const root = deps.resolveRoot(args.workspace);
          const limit = clampLimit(args.limit, 8);
          const hits = await deps.semantic.search(root, args.query, limit, exec.signal);
          if (hits.length === 0) return `记忆库（${root}）中没有匹配 "${args.query}" 的条目。`;
          const lines = hits.map((hit, index) => summaryLine(index, hit));
          return `匹配 ${hits.length} 条：\n${lines.join('\n')}\n\n用 memory_read 读取某条的完整正文。`;
        }
      })
    )
  );

  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'memory_list',
        description: '列出当前工作区长期记忆库里的条目（置顶优先，然后按更新时间倒序）。',
        parameters: {
          limit: { type: 'number', description: '返回条数上限，默认 20。' },
          workspace: { type: 'string', description: '工作区绝对路径；省略时用当前活跃工作区。' }
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }]
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
          if (exec.signal.aborted) fail('memory_list 已取消');
          const root = deps.resolveRoot(args.workspace);
          const all = listMemories(root);
          if (all.length === 0) return `记忆库（${root}）还是空的。`;
          const limit = clampLimit(args.limit, 20);
          const lines = all.slice(0, limit).map((item, index) => summaryLine(index, item));
          return `共 ${all.length} 条（显示前 ${Math.min(limit, all.length)} 条）：\n${lines.join('\n')}\n目录：${root}`;
        }
      })
    )
  );

  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'memory_read',
        description:
          '按 id 读取一条记忆的完整正文与元信息。系统提示只注入摘要，需要细节（命令、路径、完整结论）时用这个工具。',
        parameters: {
          id: { type: 'string', required: true, description: '要读取的记忆 id。' },
          workspace: { type: 'string', description: '工作区绝对路径；省略时用当前活跃工作区。' }
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }]
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
          if (exec.signal.aborted) fail('memory_read 已取消');
          const root = deps.resolveRoot(args.workspace);
          if (!isValidId(args.id)) return `id 非法：${args.id}`;
          const record = readMemory(root, args.id);
          if (record === undefined) return `没有找到 id 为 ${args.id} 的记忆（目录：${root}）。`;
          const meta = [
            record.tags.length > 0 ? `标签: ${record.tags.join(', ')}` : '',
            record.summary.length > 0 ? `摘要: ${record.summary}` : '',
            `来源: ${record.source}${record.pinned ? ' · 置顶' : ''}`,
            record.workspace !== undefined ? `工作区: ${record.workspace}` : '',
            record.peer !== undefined ? `工作区身份: ${record.peer}` : '',
            `更新于: ${record.updated}`
          ].filter((line) => line.length > 0);
          return `# ${record.title}\n\n${meta.join('\n')}\n\n---\n\n${record.body}`;
        }
      })
    )
  );

  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'memory_forget',
        description: '删除当前工作区记忆库里的一条记忆。删除不可撤销。',
        parameters: {
          id: { type: 'string', required: true, description: '要删除的记忆 id。' },
          workspace: { type: 'string', description: '工作区绝对路径；省略时用当前活跃工作区。' }
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }]
        },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
          if (exec.signal.aborted) fail('memory_forget 已取消');
          const root = deps.resolveRoot(args.workspace);
          if (!isValidId(args.id)) return `id 非法：${args.id}`;
          const existing = readMemory(root, args.id);
          if (existing === undefined) return `没有找到 id 为 ${args.id} 的记忆（目录：${root}）。`;
          const removed = deleteMemory(root, args.id);
          return removed ? `已删除记忆 "${existing.title}"（id: ${args.id}）。` : failureLine(args.id, 'forget', root);
        }
      })
    )
  );

  return () => {
    for (const dispose of disposers) dispose();
  };
}

/** 把 limit 参数收敛到 [1, 100]。 */
function clampLimit(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(1, Math.trunc(value)));
}
