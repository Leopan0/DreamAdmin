/**
 * 语义召回引擎（模型辅助）。
 *
 * 背景：DSH 的 `llm` 服务只提供对话流式接口与模型目录，**没有 embeddings 接口**，
 * 也不暴露 provider 的 base URL / 密钥，因此无法用「模型下拉」配置真正的向量检索。
 *
 * 因此这里采用与「整理记忆」「入梦」**完全一致**的配置方式（开关 + 供应商 + 模型
 * 下拉），引擎随插件创建；检索时用所选模型把检索词**扩写**成同义 / 近义 / 中英文
 * 相关词，再与本地 BM25 分数按权重融合：
 *   - 未开启 / 未选模型 → 纯关键词 BM25；
 *   - 扩写调用失败（模型报错 / 输出不可解析）→ 静默退回纯关键词，绝不让检索中断。
 *
 * @module dream-admin/semantic
 */
import type { ResolvedSearchConfig } from './config.js';
import { type ChatStreamer } from './llm.js';
import { type MemorySummary } from './store.js';
/**
 * 语义召回引擎：随插件创建；是否生效取决于配置（开关 + provider + model）。
 */
export interface SemanticEngine {
    /** 执行一次检索（关键词，或关键词 + 模型扩写融合）。 */
    search(root: string, query: string, limit: number, signal?: AbortSignal): Promise<MemorySummary[]>;
    /** 是否已配置可用（开关已开且选了供应商与模型）。 */
    available(): boolean;
    /** 释放资源。 */
    dispose(): void;
}
/** 创建语义召回引擎。 */
export declare function createSemanticEngine(deps: {
    resolved: () => ResolvedSearchConfig;
    llm: ChatStreamer;
}): SemanticEngine;
