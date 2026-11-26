import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { buildContext } from '../src/core/agent/context';

beforeAll(() => {
  const dom = new JSDOM('');
  (globalThis as any).DOMParser = dom.window.DOMParser;
});
import type { Book } from '../src/core/types';

const book: Book = {
  meta: { id: 'b1', title: '测试书', author: '甲', format: 'txt', presentation: 'reflowed' },
  spine: [
    { index: 0, title: '第一章', html: '<p>他站在门口，风把纸片吹起来。</p>' },
    { index: 1, title: '第二章', html: '<p>雨下了起来。</p>' },
  ],
  toc: [],
};

describe('buildContext', () => {
  it('带当前章节片段与最近划线、对话摘要，且不超过预算', () => {
    const msgs = buildContext({
      book,
      chapterIndex: 0,
      annotations: [{ id: 'n1', bookId: 'b1', anchor: 'a', quote: '风把纸片', note: '比喻', createdAt: 1 }],
      chatHistory: [{ role: 'user', content: '上一轮问题' }],
      question: '这句话什么意思？',
      budgetChars: 500,
    });
    const all = msgs.map(m => m.content).join(' ');
    expect(all).toContain('测试书');
    expect(all).toContain('第一章');
    expect(all).toContain('风把纸片');
    expect(all).toContain('这句话什么意思？');
    expect(all.length).toBeLessThan(2000);
  });

  it('无划线无历史时也能构造', () => {
    const msgs = buildContext({ book, chapterIndex: 1, annotations: [], chatHistory: [], question: '总结', budgetChars: 200 });
    expect(msgs.some(m => m.content.includes('雨下了起来'))).toBe(true);
  });
});
