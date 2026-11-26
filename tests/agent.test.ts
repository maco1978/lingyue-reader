import { describe, it, expect, vi, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { runAgent } from '../src/core/agent/agent';
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
    const secondMessages = chat.mock.calls[1][0];
    expect(secondMessages.some((m: any) => m.role === 'tool' && m.content.includes('纸片'))).toBe(true);
  });

  it('无工具请求时直接返回回答', async () => {
    const chat = vi.fn().mockResolvedValueOnce({ content: '这是总结。' });
    const result = await runAgent({ provider: { chat } as any, book, chapterIndex: 0, annotations: [], chatHistory: [], question: '总结' });
    expect(result.answer).toBe('这是总结。');
    expect(chat).toHaveBeenCalledTimes(1);
  });
});
