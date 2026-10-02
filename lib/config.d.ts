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
/**
 * 稳定插件 id：cordis 插件名、npm 包名、bundle patch id、HTTP 路由前缀、
 * client ModuleLoader id —— 按合同全部相同。
 */
export declare const PLUGIN_NAME = "dream-admin";
/** 工作区内的默认记忆目录名（相对工作区根）。 */
export declare const DEFAULT_MEMORY_DIR = "memory";
/** 默认每次注入系统提示的记忆条数。 */
export declare const DEFAULT_RECALL_LIMIT = 5;
/** 默认注入系统提示的记忆文本上限（字符）。 */
export declare const DEFAULT_RECALL_MAX_CHARS = 4000;
/** 默认记忆梦境间隔（分钟）。 */
export declare const DEFAULT_EVOLVE_INTERVAL_MINUTES = 30;
/** 默认记忆梦境所需的记忆条数下限。 */
export declare const DEFAULT_EVOLVE_MIN_MEMORIES = 3;
/** 单次记忆梦境调用的输出上限（token）。 */
export declare const DEFAULT_EVOLVE_MAX_TOKENS = 4096;
/** 记忆梦境的系统提示：要求模型只做合并/去重/提炼，并且不发明事实。 */
export declare const DEFAULT_EVOLVE_PROMPT: string;
/**
 * 插件入口 / 配置 schema。默认值写在这里，因此 config 块可以省略它们。
 */
declare const Config: z<Schemastery.ObjectS<NoInfer<{
    store: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        dir: z<string, string, "defined">;
        scope: z<"workspace" | "global", "workspace" | "global", "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        dir: z<string, string, "defined">;
        scope: z<"workspace" | "global", "workspace" | "global", "defined">;
    }>>>, "volatile-defined">;
    recall: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        limit: z<number, number, "defined">;
        maxChars: z<number, number, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        limit: z<number, number, "defined">;
        maxChars: z<number, number, "defined">;
    }>>>, "volatile-defined">;
    evolve: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        provider: z<string, string, "defined">;
        model: z<string, string, "defined">;
        intervalMinutes: z<number, number, "defined">;
        minMemories: z<number, number, "defined">;
        maxTokens: z<number, number, "defined">;
        prompt: z<string, string, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        provider: z<string, string, "defined">;
        model: z<string, string, "defined">;
        intervalMinutes: z<number, number, "defined">;
        minMemories: z<number, number, "defined">;
        maxTokens: z<number, number, "defined">;
        prompt: z<string, string, "defined">;
    }>>>, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    store: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        dir: z<string, string, "defined">;
        scope: z<"workspace" | "global", "workspace" | "global", "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        dir: z<string, string, "defined">;
        scope: z<"workspace" | "global", "workspace" | "global", "defined">;
    }>>>, "volatile-defined">;
    recall: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        limit: z<number, number, "defined">;
        maxChars: z<number, number, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        limit: z<number, number, "defined">;
        maxChars: z<number, number, "defined">;
    }>>>, "volatile-defined">;
    evolve: z<NoInfer<Schemastery.ObjectS<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        provider: z<string, string, "defined">;
        model: z<string, string, "defined">;
        intervalMinutes: z<number, number, "defined">;
        minMemories: z<number, number, "defined">;
        maxTokens: z<number, number, "defined">;
        prompt: z<string, string, "defined">;
    }>>>, NoInfer<Schemastery.ObjectT<NoInfer<{
        enabled: z<boolean, boolean, "defined">;
        provider: z<string, string, "defined">;
        model: z<string, string, "defined">;
        intervalMinutes: z<number, number, "defined">;
        minMemories: z<number, number, "defined">;
        maxTokens: z<number, number, "defined">;
        prompt: z<string, string, "defined">;
    }>>>, "volatile-defined">;
}>>, "plain">;
/** 插件配置的推断类型：声明为 `.volatile()` 的节会以 ref 形式交付（`.get()` 取值）。 */
export type PluginConfig = typeof Config extends z<infer T> ? T : never;
/** 把一节 `.volatile()` ref 拆成普通快照值。 */
type UnwrapSection<S> = S extends {
    get(): infer V;
} ? V : S;
/** resolvePluginConfig 接受的普通（已拆 ref）配置节。 */
export type PluginConfigInput = {
    [K in keyof PluginConfig]: UnwrapSection<PluginConfig[K]>;
};
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
export declare function sectionValue<T>(value: unknown): T;
/** 解析并校验一份不可信配置，产出冻结后的运行期形状。 */
export declare function resolvePluginConfig(config: PluginConfigInput): ResolvedPluginConfig;
/** UI 配置的持久化文件位置（与工作区无关，全局一份）。 */
export declare function storedConfigPath(): string;
/** 读取 UI 持久化的配置覆盖；文件不存在或损坏时返回 undefined。 */
export declare function loadStoredConfig(): Partial<PluginConfigInput> | undefined;
/** 写出 UI 配置覆盖（尽力而为，失败只记录日志）。 */
export declare function saveStoredConfig(value: Partial<PluginConfigInput>): void;
/** 把普通对象按节合并（后者覆盖前者）。 */
export declare function mergeConfig(base: Partial<PluginConfigInput>, patch: Partial<PluginConfigInput>): Partial<PluginConfigInput>;
export { Config };
