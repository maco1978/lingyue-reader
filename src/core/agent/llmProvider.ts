import type { LLMProvider, ChatMessage, ToolSpec, AgentResult, ToolCall } from './types';
import { TimeoutError, withTimeout } from '../net';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 600;

export interface LlmProviderOptions {
  /** 单次请求（含读响应体）的超时，默认 60 秒 */
  timeoutMs?: number;
  /** 失败后的重试次数（不含首次），默认 1 */
  retries?: number;
  retryDelayMs?: number;
}

/** HTTP 层错误带状态码，用来判断是否值得重试 */
export class LlmHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'LlmHttpError';
  }
}

/** 只重试「等一会儿可能就好了」的失败；4xx（429 除外）重试也没用 */
export function isRetryableError(e: unknown): boolean {
  if (e instanceof TimeoutError) return true;
  if (e instanceof LlmHttpError) return e.status === 429 || e.status >= 500;
  // fetch 的网络层失败通常是 TypeError（断网 / DNS / CORS）
  return e instanceof TypeError;
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}

/** OpenAI Chat Completions 兼容适配器：Hy4 / DeepSeek 只差 base_url 与 model */
export class OpenAIProvider implements LLMProvider {
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;

  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string,
    private fetchFn: typeof fetch = fetch,
    options: LlmProviderOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);
    this.retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS);
  }

  async chat(messages: ChatMessage[], tools?: ToolSpec[]): Promise<AgentResult> {
    const body: Record<string, unknown> = { model: this.model, messages };
    if (tools?.length) body.tools = tools.map(t => ({ type: 'function', function: t }));

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      if (attempt > 0) await sleep(this.retryDelayMs);
      try {
        return await this.once(body);
      } catch (e) {
        lastError = e;
        if (!isRetryableError(e)) throw e;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('模型调用失败');
  }

  private once(body: Record<string, unknown>): Promise<AgentResult> {
    return withTimeout('模型调用', this.timeoutMs, undefined, async signal => {
      const res = await this.fetchFn(this.baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.apiKey },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 500);
        throw new LlmHttpError('模型调用失败（HTTP ' + res.status + '）：' + detail, res.status);
      }
      const data = await res.json() as any;
      const msg = data.choices?.[0]?.message ?? {};
      const toolCalls: ToolCall[] | undefined = msg.tool_calls?.map((tc: any) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function?.arguments ?? '{}');
        } catch {
          // LLM 生成的参数不可信：截断/非法 JSON 时回退为空对象，让下游工具层因缺必填参数自然拒绝
        }
        return {
          id: tc.id,
          name: tc.function?.name ?? '',
          args,
        };
      });
      return { content: msg.content ?? null, toolCalls };
    });
  }
}
