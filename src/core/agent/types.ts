export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** role=tool 时回填对应 tool_call.id */
  tool_call_id?: string;
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
