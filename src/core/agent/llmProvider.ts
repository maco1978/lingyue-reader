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
    if (!res.ok) throw new Error('模型调用失败（HTTP ' + res.status + '）：' + (await res.text()).slice(0, 500));
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
  }
}
