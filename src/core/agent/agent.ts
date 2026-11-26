import type { Book, Annotation } from '../types';
import type { LLMProvider, ChatMessage } from './types';
import { buildContext } from './context';
import { AGENT_TOOLS, findInBook } from './tools';

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
  /** 工具命中的章节序号，供 UI 显示「原文出处」按钮 */
  sourceChapter?: number;
}

/** 一轮 Agent：构造上下文 → 调 LLM → 若有 tool_calls 则执行并回灌 → 再调 LLM 得最终回答 */
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const messages = buildContext(input);
  const first = await input.provider.chat(messages, AGENT_TOOLS);
  if (!first.toolCalls?.length) return { answer: first.content ?? '' };

  let sourceChapter: number | undefined;
  for (const call of first.toolCalls) {
    let result = '';
    if (call.name === 'findInBook') {
      result = findInBook(input.book, String(call.args.query ?? ''));
      const m = result.match(/章节序号 (\d+)/);
      if (m) sourceChapter = Number(m[1]);
    } else {
      result = '未知工具：' + call.name;
    }
    messages.push({ role: 'assistant', content: first.content ?? '', tool_call_id: call.id });
    messages.push({ role: 'tool', content: result, tool_call_id: call.id });
  }
  if (sourceChapter !== undefined) {
    messages.push({ role: 'system', content: '（原文出处章节序号：' + sourceChapter + '）' });
  }
  const final = await input.provider.chat(messages);
  return { answer: final.content ?? '', sourceChapter };
}
