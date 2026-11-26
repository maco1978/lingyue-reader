import { describe, it, expect, vi, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { runAgent } from '../src/core/agent/agent';
import { findInBook } from '../src/core/agent/tools';
import type { Book } from '../src/core/types';

beforeAll(() => {
  const dom = new JSDOM('');
  (globalThis as any).DOMParser = dom.window.DOMParser;
});

const book: Book = {
  meta: { id: 'b1', title: '测试书', author: '', format: 'txt', presentation: 'reflowed' },
  spine: [
    { index: 0, title: '第一章', html: '<p>他站在门口，风把纸片吹起来。</p>' },
    { index: 1, title: '第二章', html: '<p>雨下了起来。</p>' },
  ],
  toc: [],
};

describe('runAgent', () => {
  it('模型请求 findInBook 时执行工具并把结果回灌，最后给出回答', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce({ content: null, toolCalls: [{ id: 'c1', name: 'findInBook', args: { query: '纸片' } }] })
      .mockResolvedValueOnce({ content: '这句话在第一段，描写风把纸片吹起。', toolCalls: undefined });
    const provider = { chat } as any;
    const result = await runAgent({
      provider, book, chapterIndex: 0, annotations: [], chatHistory: [], question: '纸片在哪？',
    });
    expect(result.answer).toContain('第一段');
    expect(chat).toHaveBeenCalledTimes(2);

    // 协议正确性：先回显模型那次「请求工具」的 assistant 消息（含 tool_calls 数组），
    // 再紧跟对应 tool_call_id 的 role:'tool' 消息；assistant 消息上不允许出现 tool_call_id。
    const secondMessages = chat.mock.calls[1][0];
    const assistantIdx = secondMessages.findIndex((m: any) => m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0);
    expect(assistantIdx).toBeGreaterThanOrEqual(0);
    const assistantMsg = secondMessages[assistantIdx];
    expect(assistantMsg.tool_calls[0].id).toBe('c1');
    expect(assistantMsg.tool_calls[0].type).toBe('function');
    expect(assistantMsg.tool_calls[0].function.name).toBe('findInBook');
    expect(JSON.parse(assistantMsg.tool_calls[0].function.arguments)).toEqual({ query: '纸片' });
    expect(assistantMsg.tool_call_id).toBeUndefined();

    const toolMsg = secondMessages[assistantIdx + 1];
    expect(toolMsg.role).toBe('tool');
    expect(toolMsg.tool_call_id).toBe('c1');
    expect(toolMsg.content.includes('纸片')).toBe(true);
    expect(secondMessages.some((m: any) => m.role === 'assistant' && m.tool_call_id !== undefined)).toBe(false);

    // 协议安全：部分 OpenAI 兼容服务要求 system 只能在首位；工具结果后不得再插 system 消息
    // （章节序号已包含在 tool 返回文本里，UI 用返回值 AgentOutput.sourceChapter）
    expect(secondMessages.filter((m: any) => m.role === 'system').length).toBe(1);
    expect(secondMessages[0].role).toBe('system');

    // sourceChapter 仍随结果返回供 UI「查看原文」
    expect(result.sourceChapter).toBe(0);
  });

  it('无工具请求时直接返回回答', async () => {
    const chat = vi.fn().mockResolvedValueOnce({ content: '这是总结。' });
    const result = await runAgent({ provider: { chat } as any, book, chapterIndex: 0, annotations: [], chatHistory: [], question: '总结' });
    expect(result.answer).toBe('这是总结。');
    expect(chat).toHaveBeenCalledTimes(1);
  });

  it('空 query 不误命中第一章', async () => {
    expect(findInBook(book, '   ')).toContain('未在书中找到');
  });
});
