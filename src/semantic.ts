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
import { collectStreamText, extractJson, toStringArray, type ChatStreamer } from './llm.js';
import { listMemories, scoreMemories, type MemorySummary } from './store.js';

/** 单次扩写最多采用多少个词。 */
const MAX_TERMS = 8;

/**
 * 归一化后按权重融合「原检索词」与「扩写词」两路分数，取前 limit 条。
 * `expanded` 为 undefined 时表示只有关键词一路。
 */
function rank(
  root: string,
  base: Map<string, number>,
  expanded: Map<string, number> | undefined,
  weight: number,
  limit: number
): MemorySummary[] {
  const byId = new Map(listMemories(root).map((summary) => [summary.id, summary]));
  const maxBase = Math.max(0, ...base.values());
  const maxExpanded = Math.max(0, ...(expanded?.values() ?? []));
  const ids = new Set<string>([...base.keys(), ...(expanded?.keys() ?? [])]);
  const scored: Array<{ score: number; summary: MemorySummary }> = [];

  for (const id of ids) {
    const summary = byId.get(id);
    if (summary === undefined) continue;
    const baseScore = maxBase > 0 ? (base.get(id) ?? 0) / maxBase : 0;
    const expandedScore = maxExpanded > 0 ? (expanded?.get(id) ?? 0) / maxExpanded : 0;
    const blended = expanded === undefined ? baseScore : (1 - weight) * baseScore + weight * expandedScore;
    if (blended <= 0) continue;
    scored.push({ score: blended + (summary.pinned ? 0.05 : 0), summary });
  }

  scored.sort((a, b) => b.score - a.score || b.summary.updated.localeCompare(a.summary.updated));
  return scored.slice(0, limit).map((entry) => entry.summary);
}

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
export function createSemanticEngine(deps: {
  resolved: () => ResolvedSearchConfig;
  llm: ChatStreamer;
}): SemanticEngine {
  /** 用模型把检索词扩写成一组相关词；未配置 / 失败 / 无结果时返回 undefined。 */
  const expand = async (
    query: string,
    cfg: ResolvedSearchConfig,
    signal?: AbortSignal
  ): Promise<string[] | undefined> => {
    let text = '';
    try {
      text = await collectStreamText(
        deps.llm.stream({
          provider: cfg.provider,
          model: cfg.model,
          system: cfg.prompt,
          messages: [{ role: 'user', content: [{ type: 'text', text: query }] }],
          maxTokens: cfg.maxTokens,
          ...(signal === undefined ? {} : { signal })
        })
      );
    } catch {
      return undefined;
    }

    const parsed = extractJson(text);
    const terms = parsed === undefined ? undefined : toStringArray((parsed as { terms?: unknown }).terms);
    if (terms === undefined) return undefined;

    const seen = new Set<string>();
    const result: string[] = [];
    for (const term of terms) {
      const value = term.trim();
      if (value.length === 0 || seen.has(value)) continue;
      seen.add(value);
      result.push(value);
      if (result.length >= MAX_TERMS) break;
    }
    return result;
  };

  const available = (): boolean => {
    const cfg = deps.resolved();
    return cfg.semantic && cfg.provider.length > 0 && cfg.model.length > 0;
  };

  const search = async (
    root: string,
    query: string,
    limit: number,
    signal?: AbortSignal
  ): Promise<MemorySummary[]> => {
    const cfg = deps.resolved();
    const trimmed = query.trim();
    if (trimmed.length === 0) return listMemories(root).slice(0, limit);

    const base = scoreMemories(root, trimmed);
    if (!available()) return rank(root, base, undefined, cfg.weight, limit);

    const terms = await expand(trimmed, cfg, signal);
    if (terms === undefined || terms.length === 0) return rank(root, base, undefined, cfg.weight, limit);

    const expanded = scoreMemories(root, terms.join(' '));
    return rank(root, base, expanded, cfg.weight, limit);
  };

  return {
    search,
    available,
    dispose() {
      // 无常驻资源；保留接口以便未来扩展。
    }
  };
}
