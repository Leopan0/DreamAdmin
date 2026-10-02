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
 *   POST   /dream-admin/evolve          立即执行一次记忆梦境
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
import type { Evolver } from './evolve.js';
import { globalMemoryRoot, listWorkspaces, type RootResolver, type WorkspaceRef } from './paths.js';
import { deleteMemory, listMemories, readMemory, searchMemories, writeMemory } from './store.js';

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
  /** 记忆梦境执行器。 */
  evolver: Evolver;
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
        const items: WorkspaceRef[] = listWorkspaces(deps.sessions());
        json(res, 200, {
          items,
          active: resolveRoot(),
          global: globalMemoryRoot()
        });
      }
    }),

    ctx.webServer.register({
      kind: 'exact',
      path: `/${PLUGIN_NAME}/memories`,
      handler: (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const workspace = optional(url.searchParams.get('workspace'));
        const query = optional(url.searchParams.get('q'));
        const limit = clampLimit(url.searchParams.get('limit'), 200);
        const root = resolveRoot(workspace);
        const items = query !== undefined ? searchMemories(root, query, limit) : listMemories(root).slice(0, limit);
        json(res, 200, { root, items });
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
            const targetRoot = resolveRoot(
              typeof body.workspace === 'string' ? body.workspace : workspace
            );
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
              source: 'manual'
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
      path: `/${PLUGIN_NAME}/evolve`,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          json(res, 405, { error: 'method not allowed' });
          return;
        }
        const outcome = await deps.evolver.run(true);
        json(res, outcome.ok ? 200 : 409, outcome);
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
    evolve: cfg.evolve,
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
