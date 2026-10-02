/**
 * DreamAdmin 的插件配置：schemastery schema、运行期校验、以及被 store /
 * 召回 / 记忆梦境消费的解析后快照。
 *
 * 同一份 schema 同时支撑 cordis.patch.yml 的 `config:` 块与插件管理页的表单，
 * 所以无论默认值来自哪里，形状都一致。
 *
 * 所有配置节都声明为 `.volatile()`：0.2 的设置体系会把 volatile 字段投影到
 * 插件管理页表单，且只改 volatile 字段时运行中的插件实例不会被重建。实例通过
 * 交付过来的 ref（`ref.get()`）惰性读取当前值，因此表单改动即时生效。
 *
 * 本插件还额外把 UI 的改动持久化到 `<DSH_HOME>/dream-admin/config.json`
 * （见 loadStoredConfig / saveStoredConfig），重启后仍然生效。
 *
 * @module dream-admin/config
 */
import z from '@deepseek-ai/schemastery';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { dshHome } from './paths.js';

/**
 * 稳定插件 id：cordis 插件名、npm 包名、bundle patch id、HTTP 路由前缀、
 * client ModuleLoader id —— 按合同全部相同。
 */
export const PLUGIN_NAME = 'dream-admin';

/** 工作区内的默认记忆目录名（相对工作区根）。 */
export const DEFAULT_MEMORY_DIR = 'memory';

/** 默认每次注入系统提示的记忆条数。 */
export const DEFAULT_RECALL_LIMIT = 5;

/** 默认注入系统提示的记忆文本上限（字符）。 */
export const DEFAULT_RECALL_MAX_CHARS = 4000;

/** 默认记忆梦境间隔（分钟）。 */
export const DEFAULT_EVOLVE_INTERVAL_MINUTES = 30;

/** 默认记忆梦境所需的记忆条数下限。 */
export const DEFAULT_EVOLVE_MIN_MEMORIES = 3;

/** 单次记忆梦境调用的输出上限（token）。 */
export const DEFAULT_EVOLVE_MAX_TOKENS = 4096;

/** 记忆梦境的系统提示：要求模型只做合并/去重/提炼，并且不发明事实。 */
export const DEFAULT_EVOLVE_PROMPT = [
  '你是 DreamAdmin 记忆库的整理引擎。输入是一批长期记忆条目（Markdown + 元数据）。',
  '你的任务：把重复、过时、可以合并的条目整理成更精炼、更一致的一组记忆。',
  '',
  '硬性规则：',
  '1. 只做合并、去重、纠错、补全表述；绝对不要发明输入中不存在的事实。',
  '2. 可以改写标题与正文，但必须保留所有可验证的细节（路径、命令、标识符、数字、用户偏好与纠正）。',
  '3. 已经被新记忆取代的旧结论，合并到最新条目里，不要保留自相矛盾的两份。',
  '4. 不确定的条目原样保留（不输出它的 op）。',
  '',
  '只输出一个 JSON 对象，不要任何解释文字、不要 Markdown 代码围栏：',
  '{',
  '  "ops": [',
  '    { "op": "update", "id": "<已存在的 id>", "title": "...", "tags": ["..."], "body": "..." },',
  '    { "op": "merge", "ids": ["<id1>", "<id2>"], "keep": "<id1>", "title": "...", "tags": ["..."], "body": "..." }',
  '  ]',
  '}',
  '',
  '没有任何改动时输出 {"ops":[]}。'
].join('\n');

/**
 * 插件入口 / 配置 schema。默认值写在这里，因此 config 块可以省略它们。
 */
const Config = z
  .object({
    store: z
      .object({
        dir: z
          .string()
          .default(DEFAULT_MEMORY_DIR)
          .description(
            '记忆目录：相对路径视为工作区内的子目录（默认 memory）；绝对路径则固定使用该目录，各工作区共用。'
          ),
        scope: z
          .union([z.const('workspace'), z.const('global')])
          .default('workspace')
          .description(
            'workspace：记忆跟着当前工作区文件夹走（<工作区>/<dir>）；global：所有工作区共用一个目录（<DSH_HOME>/dream-admin/memory，dir 为绝对路径时即该目录）。'
          )
      })
      .default({ dir: DEFAULT_MEMORY_DIR, scope: 'workspace' })
      .volatile(),
    recall: z
      .object({
        enabled: z.boolean().default(true).description('每次对话是否自动带上长期记忆（每个模型轮次重新装配）。'),
        limit: z
          .number()
          .step(1)
          .min(0)
          .max(50)
          .default(DEFAULT_RECALL_LIMIT)
          .description('每次最多带上几条记忆。'),
        maxChars: z
          .number()
          .step(1)
          .min(0)
          .default(DEFAULT_RECALL_MAX_CHARS)
          .description('每次带上的记忆正文字符上限，超出即截断。0 表示不限制。')
      })
      .default({ enabled: true, limit: DEFAULT_RECALL_LIMIT, maxChars: DEFAULT_RECALL_MAX_CHARS })
      .volatile(),
    evolve: z
      .object({
        enabled: z
          .boolean()
          .default(false)
          .description(
            '开启记忆梦境：按间隔调用你指定的模型，自动合并 / 去重 / 提炼记忆。也可以随时在对话框输入 /memoryup 立即整理一次。'
          ),
        provider: z
          .string()
          .default('')
          .description('记忆梦境使用的 provider 路由（从 DSH 模型列表中选择）；留空时 /memoryup 用当前对话模型。'),
        model: z
          .string()
          .default('')
          .description('该 provider 下的模型 id；留空时 /memoryup 用当前对话模型。'),
        intervalMinutes: z
          .number()
          .step(1)
          .min(1)
          .max(1440)
          .default(DEFAULT_EVOLVE_INTERVAL_MINUTES)
          .description('自动记忆梦境的间隔（分钟）。'),
        minMemories: z
          .number()
          .step(1)
          .min(1)
          .default(DEFAULT_EVOLVE_MIN_MEMORIES)
          .description('记忆条数低于该值时跳过自动记忆梦境（手动触发不受限）。'),
        maxTokens: z
          .number()
          .step(1)
          .min(1)
          .default(DEFAULT_EVOLVE_MAX_TOKENS)
          .description('单次记忆梦境调用的最大输出 token 数。'),
        prompt: z.string().default(DEFAULT_EVOLVE_PROMPT).description('记忆梦境调用的系统提示。')
      })
      .default({
        enabled: false,
        provider: '',
        model: '',
        intervalMinutes: DEFAULT_EVOLVE_INTERVAL_MINUTES,
        minMemories: DEFAULT_EVOLVE_MIN_MEMORIES,
        maxTokens: DEFAULT_EVOLVE_MAX_TOKENS,
        prompt: DEFAULT_EVOLVE_PROMPT
      })
      .volatile()
  })
  .description('DreamAdmin：随工作区管理的长期记忆 + 记忆梦境。');

/** 插件配置的推断类型：声明为 `.volatile()` 的节会以 ref 形式交付（`.get()` 取值）。 */
export type PluginConfig = typeof Config extends z<infer T> ? T : never;

/** 把一节 `.volatile()` ref 拆成普通快照值。 */
type UnwrapSection<S> = S extends { get(): infer V } ? V : S;

/** resolvePluginConfig 接受的普通（已拆 ref）配置节。 */
export type PluginConfigInput = { [K in keyof PluginConfig]: UnwrapSection<PluginConfig[K]> };

/** 解析后的存储策略。 */
export interface ResolvedStoreConfig {
  readonly dir: string;
  readonly scope: 'workspace' | 'global';
}

/** 解析后的召回策略。 */
export interface ResolvedRecallConfig {
  readonly enabled: boolean;
  readonly limit: number;
  readonly maxChars: number;
}

/** 解析后的记忆梦境策略。 */
export interface ResolvedEvolveConfig {
  readonly enabled: boolean;
  readonly provider: string;
  readonly model: string;
  readonly intervalMinutes: number;
  readonly minMemories: number;
  readonly maxTokens: number;
  readonly prompt: string;
}

/** 完整的、冻结后的插件配置快照。 */
export interface ResolvedPluginConfig {
  readonly store: ResolvedStoreConfig;
  readonly recall: ResolvedRecallConfig;
  readonly evolve: ResolvedEvolveConfig;
}

/**
 * 把一节可能带 ref 的配置值拆成普通值。声明为 `.volatile()` 的节交付到
 * `apply` 时是带 `.get()` 的 ref（0.2 的实时更新合同），普通节原样返回。
 */
export function sectionValue<T>(value: unknown): T {
  if (typeof value === 'object' && value !== null && typeof (value as { get?: unknown }).get === 'function') {
    return (value as { get: () => T }).get();
  }
  return value as T;
}

/** 解析并校验一份不可信配置，产出冻结后的运行期形状。 */
export function resolvePluginConfig(config: PluginConfigInput): ResolvedPluginConfig {
  const store = config?.store ?? ({} as PluginConfigInput['store']);
  const recall = config?.recall ?? ({} as PluginConfigInput['recall']);
  const evolve = config?.evolve ?? ({} as PluginConfigInput['evolve']);

  const dir = typeof store.dir === 'string' && store.dir.trim().length > 0 ? store.dir.trim() : DEFAULT_MEMORY_DIR;
  const scope: 'workspace' | 'global' = store.scope === 'global' ? 'global' : 'workspace';

  const limit = clampInt(recall.limit ?? DEFAULT_RECALL_LIMIT, 0, 50);
  const maxChars = clampInt(recall.maxChars ?? DEFAULT_RECALL_MAX_CHARS, 0, Number.MAX_SAFE_INTEGER);

  const provider = typeof evolve.provider === 'string' ? evolve.provider : '';
  const model = typeof evolve.model === 'string' ? evolve.model : '';
  const prompt =
    typeof evolve.prompt === 'string' && evolve.prompt.trim().length > 0 ? evolve.prompt : DEFAULT_EVOLVE_PROMPT;

  return {
    store: { dir, scope },
    recall: { enabled: recall.enabled ?? true, limit, maxChars },
    evolve: {
      enabled: evolve.enabled ?? false,
      provider,
      model,
      intervalMinutes: clampInt(evolve.intervalMinutes ?? DEFAULT_EVOLVE_INTERVAL_MINUTES, 1, 1440),
      minMemories: clampInt(evolve.minMemories ?? DEFAULT_EVOLVE_MIN_MEMORIES, 1, Number.MAX_SAFE_INTEGER),
      maxTokens: clampInt(evolve.maxTokens ?? DEFAULT_EVOLVE_MAX_TOKENS, 1, Number.MAX_SAFE_INTEGER),
      prompt
    }
  };
}

/** 把数字夹到 [min, max] 的整数区间。 */
function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(max, Math.max(min, n));
}

/** UI 配置的持久化文件位置（与工作区无关，全局一份）。 */
export function storedConfigPath(): string {
  return join(dshHome(), PLUGIN_NAME, 'config.json');
}

/** 读取 UI 持久化的配置覆盖；文件不存在或损坏时返回 undefined。 */
export function loadStoredConfig(): Partial<PluginConfigInput> | undefined {
  const file = storedConfigPath();
  try {
    const raw = readFileSync(file, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined;
    return parsed as Partial<PluginConfigInput>;
  } catch {
    return undefined;
  }
}

/** 写出 UI 配置覆盖（尽力而为，失败只记录日志）。 */
export function saveStoredConfig(value: Partial<PluginConfigInput>): void {
  const file = storedConfigPath();
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
  } catch {
    // 持久化失败不该影响运行中的插件；调用方会记录日志。
  }
}

/** 把普通对象按节合并（后者覆盖前者）。 */
export function mergeConfig(
  base: Partial<PluginConfigInput>,
  patch: Partial<PluginConfigInput>
): Partial<PluginConfigInput> {
  return {
    store: { ...base.store, ...patch.store } as PluginConfigInput['store'],
    recall: { ...base.recall, ...patch.recall } as PluginConfigInput['recall'],
    evolve: { ...base.evolve, ...patch.evolve } as PluginConfigInput['evolve']
  };
}

export { Config };
