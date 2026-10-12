/**
 * 模型调用的公共件：调用路由、流式文本累积、模型 JSON 输出的抠取与收敛。
 *
 * 这三件事原本在 evolve / capture / semantic 里各写一份，甚至让 semantic 反向
 * import evolve 的两个纯函数（把一个执行器模块拖进检索路径）。收敛到这里后，
 * 依赖方向只剩一条：能力模块 → 公共件。
 *
 * 「流式累积」在这里统一带 `typeof text === 'string'` 判空，避免某个 provider
 * 的 chunk 形状不同时把 `undefined` 拼进文本、再喂给 JSON 解析。
 *
 * @module dream-admin/llm
 */

/** 一次模型调用的路由（provider + model）。 */
export interface ModelRoute {
  readonly provider: string;
  readonly model: string;
}

/** 调用模型所需的最小流式接口（`ctx.llm` 结构上满足它）。 */
export interface ChatStreamer {
  stream(options: {
    provider: string;
    model: string;
    system: string;
    messages: Array<{ role: 'user'; content: Array<{ type: 'text'; text: string }> }>;
    maxTokens: number;
    signal?: AbortSignal;
  }): AsyncIterable<{ type?: unknown; text?: unknown }>;
}

/** 把任意一次流式调用的 text-delta 累积成纯文本。 */
export async function collectStreamText(chunks: AsyncIterable<unknown>): Promise<string> {
  let text = '';
  for await (const raw of chunks) {
    const chunk = raw as { type?: unknown; text?: unknown };
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text;
  }
  return text;
}

/** 从模型输出里抠出第一个 JSON 对象（容忍 Markdown 代码围栏）。 */
export function extractJson(text: string): unknown | undefined {
  const withoutFence = text.replace(/```[a-zA-Z]*\n?/g, '');
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** 把模型给的 tags 收敛成字符串数组。 */
export function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}
