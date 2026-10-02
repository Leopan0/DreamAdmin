/**
 * 面向模型的记忆工具：save / search / list / forget。
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
import {
  deleteMemory,
  isValidId,
  listMemories,
  readMemory,
  searchMemories,
  writeMemory
} from './store.js';

/** 工具依赖面。 */
export interface ToolDeps {
  resolved: () => ResolvedPluginConfig;
  resolveRoot: RootResolver;
}

/** 工具注册失败时抛出的可读错误。 */
function fail(message: string): never {
  throw new Error(message);
}

/** 把渲染用的出错行拼好。 */
function failureLine(id: string, send: string, site: string): string {
  return `ERROR: memory/read_failed — id=${id} cmd=${send} site=${site}`;
}

/** 渲染一条摘要行。 */
function summaryLine(index: number, id: string, title: string, tags: string[], pinned: boolean, updated: string): string {
  const flags = pinned ? ' [置顶]' : '';
  const tagText = tags.length > 0 ? ` (${tags.join(', ')})` : '';
  return `${index + 1}. ${title}${tagText}${flags} — id: ${id} — 更新于 ${updated}`;
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
        name: 'memory_save',
        description:
          '把一条长期记忆写入当前工作区的记忆库（Markdown + frontmatter，用户可在 DreamAdmin 记忆管理页编辑）。' +
          '适用于用户明确表达的偏好、项目约定、关键事实与结论。传 id 时覆盖同一条记忆。',
        parameters: {
          body: { type: 'string', required: true, description: '记忆正文（Markdown）。' },
          title: { type: 'string', description: '短标题；省略时沿用已有标题或「未命名记忆」。' },
          tags: { type: 'array', items: { type: 'string' }, description: '标签，便于检索。' },
          id: { type: 'string', description: '要覆盖的记忆 id；省略则新建。' },
          pinned: { type: 'boolean', description: '是否置顶（置顶条目必定参与系统提示召回）。' },
          workspace: { type: 'string', description: '工作区绝对路径；省略时用当前活跃工作区。' }
        },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }]
        },
        isConcurrencySafe: () => false,
        async execute(args, exec) {
          if (exec.signal.aborted) fail('memory_save 已取消');
          const root = deps.resolveRoot(args.workspace);
          const record = writeMemory(root, {
            id: args.id,
            title: args.title,
            body: args.body,
            tags: args.tags,
            pinned: args.pinned,
            source: 'tool'
          });
          return `已保存记忆 "${record.title}"（id: ${record.id}）\n目录：${root}\n文件：${record.file}`;
        }
      })
    )
  );

  disposers.push(
    ctx.tools.register(
      defineTool({
        name: 'memory_search',
        description:
          '在当前工作区的长期记忆库里做关键词检索（匹配标题 / 标签 / 正文）。' +
          '系统提示里只注入了最近的少量记忆，需要精确找某条历史结论时用这个工具。',
        parameters: {
          query: { type: 'string', required: true, description: '检索关键词，空格分隔多个词。' },
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
          const hits = searchMemories(root, args.query, limit);
          if (hits.length === 0) return `记忆库（${root}）中没有匹配 "${args.query}" 的条目。`;
          const lines = hits.map((hit, index) =>
            summaryLine(index, hit.id, hit.title, hit.tags, hit.pinned, hit.updated) +
            (hit.preview.length > 0 ? `\n   摘要：${hit.preview}` : '')
          );
          return `匹配 ${hits.length} 条：\n${lines.join('\n')}\n\n用 memory_list 或直接读取文件查看全文。`;
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
          const lines = all
            .slice(0, limit)
            .map((item, index) => summaryLine(index, item.id, item.title, item.tags, item.pinned, item.updated));
          return `共 ${all.length} 条（显示前 ${Math.min(limit, all.length)} 条）：\n${lines.join('\n')}\n目录：${root}`;
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
