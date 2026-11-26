import type { LLMProvider, ChatMessage, ToolSpec, AgentResult, ToolCall } from './types';

/** OpenAI Chat Completions 兼容适配器：Hy4 / DeepSeek 只差 base_url 与 model */
export class OpenAIProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string,
    private fetchFn: typeof fetch = fetch,
  ) {}

  async chat(messages: ChatMessage[], tools?: ToolSpec[]): Promise<AgentResult> {
    const body: Record<string, unknown> = { model: this.model, messages };
    if (tools?.length) body.tools = tools.map(t => ({ type: 'function', function: t }));
    const res = await this.fetchFn(this.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('模型调用失败（HTTP ' + res.status + '）：' + await res.text());
    const data = await res.json() as any;
    const msg = data.choices?.[0]?.message ?? {};
    const toolCalls: ToolCall[] | undefined = msg.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name ?? '',
      args: JSON.parse(tc.function?.arguments ?? '{}'),
    }));
    return { content: msg.content ?? null, toolCalls };
  }
}
