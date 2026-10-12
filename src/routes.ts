/**
 * HTTP 接口：记忆管理页（client half）与外部脚本消费的全部端点。
 *
 * 全部挂在 `/<包名>/...` 前缀下的 exact 路由上：
 *   GET    /dream-admin/health
 *   GET    /dream-admin/config          读当前配置 + 解析出的记忆根目录
 *   POST   /dream-admin/config          合并一份配置覆盖（落盘持久化）
 *   GET    /dream-admin/models          provider / model 目录（供下拉框）
 *   GET    /dream-admin/workspaces      已知工作区候选
 *   GET    /dream-admin/memories        列表（?workspace=&q=&limit=）
 *   GET    /dream-admin/memory          单条（?id=&workspace=）
 *   POST   /dream-admin/memory          新建 / 覆盖（body: {id?, workspace?, title, body, tags, pinned}）
 *   DELETE /dream-admin/memory          删除（?id=&workspace=）
 *   POST   /dream-admin/capture         起一次「整理记忆」任务（可带 ?workspace=），立即返回任务 id
 *   POST   /dream-admin/evolve          起一次「入梦」任务（可带 ?workspace=；省略则对所有已知工作区入梦）
 *   GET    /dream-admin/evolve-history  入梦记录（?workspace=&limit=）
 *   GET    /dream-admin/tasks           长任务快照（?id= 取单个，省略则返回最近的全部）
 *   POST   /dream-admin/cancel          请求取消（?id= 取消某个任务；省略则取消全部在跑的任务）
 *
 * 「整理记忆」「入梦」都是长任务：POST 只登记并启动，随即返回 `{ taskId, task }`；
 * 进度与终态由 `GET /tasks` 轮询，随时可用 `POST /cancel` 中断。这样管理页与
 * 对话框命令走的是同一套状态。
 *
 * @module dream-admin/routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-host-webserver';
import {
  PLUGIN_NAME,
  mergeConfig,
  resolvePluginConfig,
  saveStoredConfig,
  storedConfigPath,
  type PluginConfigInput,
  type ResolvedPluginConfig
} from './config.js';
import type { Capturer } from './capture.js';
import { listDreamRecords, type Evolver } from './evolve.js';
import { globalMemoryRoot, isDefaultWorkspace, type RootResolver, type WorkspaceRef } from './paths.js';
import { resolvePeer } from './peers.js';
import type { SemanticEngine } from './semantic.js';
import { deleteMemory, listMemories, readMemory, writeMemory } from './store.js';
import type { TaskRegistry } from './tasks.js';

/** 路由依赖面。 */
export interface RouteDeps {
  /** 当前解析后的配置。 */
  resolved: () => ResolvedPluginConfig;
  /** 当前生效的配置覆盖（含 patch 层与 UI 层）。 */
  currentOverride: () => Partial<PluginConfigInput>;
  /** 写入一份新的配置覆盖（运行期 + 落盘）。 */
  applyOverride: (patch: Partial<PluginConfigInput>) => Partial<PluginConfigInput>;
  /** 记忆根目录解析器。 */
  resolveRoot: RootResolver;
  /** 活着的会话列表（用于工作区发现）。 */
  sessions: () => unknown;
  /** 面板用的工作区候选（DSH 工作区注册表优先，其次会话 cwd）。 */
  listWorkspaces: () => WorkspaceRef[];
  /** 入梦执行器。 */
  evolver: Evolver;
  /** 整理记忆执行器。 */
  capturer: Capturer;
  /** 语义检索引擎（关键词 + 可选模型扩写词融合）。 */
  semantic: SemanticEngine;
  /** 长任务注册表：承载「整理记忆」「入梦」的进度与取消。 */
  tasks: TaskRegistry;
}

/** 注册全部 HTTP 路由。@returns 一次性释放全部路由的 disposer。 */
export function registerRoutes(ctx: Context, deps: RouteDeps): () => void {
  const resolveRoot = deps.resolveRoot;

  const disposers = [
    ctx.webServer.register({
      kind: 'exact',
      path: `/${PLUGIN_NAME}/health`,
      handler: (_req, res) => {
        const cfg = deps.resolved();
        json(res, 200, {
          status: 'ok',
          plugin: PLUGIN_NAME,
          store: cfg.store,
          recall: cfg.recall,
          search: { ...cfg.search, prompt: undefined },
          /** 语义召回当前是否已配置生效（开关 + 供应商 + 模型），供排查「语义没生效」。 */
          semanticReady: deps.semantic.available(),
          capture: { ...cfg.capture, prompt: undefined },
          evolve: { ...cfg.evolve, prompt: undefined },
          root: resolveRoot(),
          configFile: storedConfigPath(),
          uptime: process.uptime()
        });
      }
    }),

    ctx.webServer.register({
      kind: 'exact',
      path: `/${PLUGIN_NAME}/config`,
      handler: async (req, res) => {
        if (req.method === 'GET') {
          json(res, 200, configView(deps, resolveRoot()));
          return;
        }
        if (req.method === 'POST') {
          try {
            const body = JSON.parse(await readBody(req)) as Partial<PluginConfigInput>;
            deps.applyOverride(body);
            saveStoredConfig(deps.currentOverride());
            json(res, 200, { ok: true, ...configView(deps, resolveRoot()) });
          } catch (error) {
            json(res, 400, { ok: false, error: message(error) });
          }
          return;
        }
        json(res, 405, { error: 'method not allowed' });
      }
    }),

    ctx.webServer.register({
      kind: 'exact',
      path: `/${PLUGIN_NAME}/models`,
      handler: async (_req, res) => {
        try {
          const providers = ctx.llm.listProviders();
          const result: Array<{ provider: string; name: string; models: Array<{ id: string; name: string }> }> = [];
          for (const provider of providers) {
            try {
              const models = await ctx.llm.listModels(provider.id);
              result.push({
                provider: provider.id,
                name: provider.name,
                models: models.map((model) => ({ id: model.id, name: model.name }))
              });
            } catch {
              result.push({ provider: provider.id, name: provider.name, models: [] });
            }
          }
          json(res, 200, result);
        } catch (error) {
          json(res, 500, { error: message(error) });
        }
      }
    }),

    ctx.webServer.register({
      kind: 'exact',
      path: `/${PLUGIN_NAME}/workspaces`,
      handler: (_req, res) => {
        const candidates = deps.listWorkspaces();
        const items = candidates.map((entry) => ({
          ...entry,
          peer: resolvePeer(entry.path)
        }));
        json(res, 200, {
          items,
          // DSH 的默认工作区（目录名固定为 `default-workspace`）；找不到时为空串。
          default: candidates.find((entry) => isDefaultWorkspace(entry.path))?.path ?? '',
          active: resolveRoot(),
          global: globalMemoryRoot()
        });
      }
    }),

    ctx.webServer.register({
      kind: 'exact',
      path: `/${PLUGIN_NAME}/memories`,
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const workspace = optional(url.searchParams.get('workspace'));
        const query = optional(url.searchParams.get('q'));
        const limit = clampLimit(url.searchParams.get('limit'), 200);
        const root = resolveRoot(workspace);
        try {
          const items =
            query !== undefined
              ? await deps.semantic.search(root, query, limit)
              : listMemories(root).slice(0, limit);
          json(res, 200, { root, items });
        } catch (error) {
          json(res, 500, { error: message(error) });
        }
      }
    }),

    ctx.webServer.register({
      kind: 'exact',
      path: `/${PLUGIN_NAME}/memory`,
      handler: async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const workspace = optional(url.searchParams.get('workspace'));
        const id = optional(url.searchParams.get('id'));
        const root = resolveRoot(workspace);

        if (req.method === 'GET') {
          if (id === undefined) {
            json(res, 400, { error: 'id is required' });
            return;
          }
          json(res, 200, { root, memory: readMemory(root, id) ?? null });
          return;
        }

        if (req.method === 'POST') {
          try {
            const body = JSON.parse(await readBody(req)) as {
              id?: unknown;
              workspace?: unknown;
              title?: unknown;
              body?: unknown;
              tags?: unknown;
              pinned?: unknown;
            };
            const targetWorkspace = typeof body.workspace === 'string' ? body.workspace : workspace;
            const targetRoot = resolveRoot(targetWorkspace);
            if (typeof body.body !== 'string' || body.body.trim().length === 0) {
              json(res, 400, { ok: false, error: 'body is required' });
              return;
            }
            const record = writeMemory(targetRoot, {
              id: typeof body.id === 'string' ? body.id : undefined,
              title: typeof body.title === 'string' ? body.title : undefined,
              body: body.body,
              tags: toTags(body.tags),
              pinned: typeof body.pinned === 'boolean' ? body.pinned : undefined,
              source: 'manual',
              workspace: targetWorkspace
            });
            json(res, 200, { ok: true, root: targetRoot, memory: record });
          } catch (error) {
            json(res, 400, { ok: false, error: message(error) });
          }
          return;
        }

        if (req.method === 'DELETE') {
          if (id === undefined) {
            json(res, 400, { error: 'id is required' });
            return;
          }
          json(res, 200, { ok: true, deleted: deleteMemory(root, id) });
          return;
        }

        json(res, 405, { error: 'method not allowed' });
      }
    }),

    ctx.webServer.register({
      kind: 'exact',
      path: `/${PLUGIN_NAME}/capture`,
      handler: (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { error: 'method not allowed' });
          return;
        }
        const url = new URL(req.url ?? '/', 'http://localhost');
        const workspace = optional(url.searchParams.get('workspace'));
        const task = deps.tasks.start('capture', (report, signal) =>
          deps.capturer.run(true, { workspace, onProgress: report }, signal)
        );
        json(res, 202, { ok: true, taskId: task.id, task });
      }
    }),

    ctx.webServer.register({
      kind: 'exact',
      path: `/${PLUGIN_NAME}/evolve`,
      handler: (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { error: 'method not allowed' });
          return;
        }
        const url = new URL(req.url ?? '/', 'http://localhost');
        const workspace = optional(url.searchParams.get('workspace'));
        const task = deps.tasks.start('evolve', (report, signal) =>
          deps.evolver.run(true, { workspace, onProgress: report }, signal)
        );
        json(res, 202, { ok: true, taskId: task.id, task });
      }
    }),

    ctx.webServer.register({
      kind: 'exact',
      path: `/${PLUGIN_NAME}/tasks`,
      handler: (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const id = optional(url.searchParams.get('id'));
        if (id === undefined) {
          json(res, 200, { ok: true, items: deps.tasks.list() });
          return;
        }
        const task = deps.tasks.get(id);
        if (task === undefined) {
          json(res, 404, { ok: false, error: 'task not found' });
          return;
        }
        json(res, 200, { ok: true, task });
      }
    }),

    ctx.webServer.register({
      kind: 'exact',
      path: `/${PLUGIN_NAME}/cancel`,
      handler: (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { error: 'method not allowed' });
          return;
        }
        const url = new URL(req.url ?? '/', 'http://localhost');
        const id = optional(url.searchParams.get('id'));
        if (id !== undefined) {
          json(res, 200, { ok: true, cancelled: deps.tasks.cancel(id) ? 1 : 0 });
          return;
        }
        // 不带 id：取消全部在跑的任务（对话框 /取消 用）。
        let cancelled = 0;
        for (const task of deps.tasks.list()) {
          if (task.status === 'running' && deps.tasks.cancel(task.id)) cancelled += 1;
        }
        json(res, 200, { ok: true, cancelled });
      }
    }),

    ctx.webServer.register({
      kind: 'exact',
      path: `/${PLUGIN_NAME}/evolve-history`,
      handler: (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const workspace = optional(url.searchParams.get('workspace'));
        const limit = clampLimit(url.searchParams.get('limit'), 100);
        const root = resolveRoot(workspace);
        json(res, 200, { root, items: listDreamRecords(root, limit) });
      }
    })
  ];

  return () => {
    for (const dispose of disposers) dispose();
  };
}

/** 交给前端的配置视图。 */
function configView(deps: RouteDeps, root: string) {
  const cfg = deps.resolved();
  return {
    store: cfg.store,
    recall: cfg.recall,
    search: cfg.search,
    evolve: cfg.evolve,
    capture: cfg.capture,
    root,
    override: deps.currentOverride(),
    configFile: storedConfigPath(),
    defaults: resolvePluginConfig({} as PluginConfigInput)
  };
}

/** 写 JSON 响应。 */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

/** 读取请求体。 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk?: Buffer) => {
      if (chunk) data += chunk.toString('utf8');
    });
    req.on('end', () => resolve(data));
  });
}

/** 空串 / null 归一化成 undefined。 */
function optional(value: string | null): string | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** 把任意输入收敛成标签数组。 */
function toTags(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  return undefined;
}

/** 把 query 里的 limit 收敛到 [1, 1000]。 */
function clampLimit(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(1000, Math.max(1, Math.trunc(parsed)));
}

/** 错误信息提取。 */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
