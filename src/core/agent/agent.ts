import type { Book, Annotation } from '../types';
import type { LLMProvider } from './types';
import { buildContext } from './context';
import { AGENT_TOOLS, findInBook, locate } from './tools';

interface AgentInput {
  provider: LLMProvider;
  book: Book;
  chapterIndex: number;
  annotations: Annotation[];
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
  question: string;
}

export interface AgentOutput {
  answer: string;
  /** 工具命中的章节序号，供 UI 显示「原文出处」按钮；多次命中取最后一次成功 */
  sourceChapter?: number;
}

/** 一轮 Agent：构造上下文 → 调 LLM → 若有 tool_calls 则执行并回灌 → 再调 LLM 得最终回答 */
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const messages = buildContext(input);
  const first = await input.provider.chat(messages, AGENT_TOOLS);
  if (!first.toolCalls?.length) return { answer: first.content ?? '' };

  // OpenAI 兼容回灌协议：先把模型请求工具的那条 assistant 消息原样回显（含 tool_calls 数组），再逐个跟 role:'tool' 结果
  messages.push({
    role: 'assistant',
    content: first.content ?? '',
    tool_calls: first.toolCalls.map(c => ({
      id: c.id,
      type: 'function' as const,
      function: { name: c.name, arguments: JSON.stringify(c.args) },
    })),
  });

  let sourceChapter: number | undefined;
  for (const call of first.toolCalls) {
    let result = '';
    if (call.name === 'findInBook') {
      const query = String(call.args.query ?? '');
      result = findInBook(input.book, query);
      const hit = locate(input.book, query);
      if (hit) sourceChapter = hit.chapterIndex;
    } else {
      result = '未知工具：' + call.name;
    }
    messages.push({ role: 'tool', content: result, tool_call_id: call.id });
  }
  if (sourceChapter !== undefined) {
    messages.push({ role: 'system', content: '（原文出处章节序号：' + sourceChapter + '）' });
  }
  const final = await input.provider.chat(messages);
  return { answer: final.content ?? '', sourceChapter };
}
