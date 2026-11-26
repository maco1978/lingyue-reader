export interface ToolCallWire {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** role=tool 时回填对应 tool_call.id */
  tool_call_id?: string;
  /** assistant 消息请求工具时，回灌协议要求原样回显 tool_calls 数组（OpenAI 兼容 wire 形状） */
  tool_calls?: ToolCallWire[];
}

/** 给模型的工具描述（OpenAI function 形状） */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AgentResult {
  content: string | null;
  toolCalls?: ToolCall[];
}

export interface LLMProvider {
  chat(messages: ChatMessage[], tools?: ToolSpec[]): Promise<AgentResult>;
}
