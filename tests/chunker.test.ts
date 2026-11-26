import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { chunkChapter } from '../src/core/tts/chunker';

beforeAll(() => {
  const dom = new JSDOM('');
  (globalThis as any).DOMParser = dom.window.DOMParser;
});

describe('chunkChapter', () => {
  it('把章节 XHTML 转成纯文本并按长度分段', () => {
    const html = '<h1>第一章</h1><p>他站在门口。</p><p>风把纸片吹起来。</p>';
    const chunks = chunkChapter(html, 12);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toContain('他站在门口。');
    expect(chunks.join('')).not.toContain('<');
  });

  it('空章节返回空数组', () => {
    expect(chunkChapter('', 100)).toEqual([]);
  });
});

describe('chunkChapter 硬切回退', () => {
  it('无标点超长文本按长度硬切且不丢失内容', () => {
    const chunks = chunkChapter('这'.repeat(30), 12);
    expect(chunks.length).toBe(3);
    expect(chunks.map((c) => c.length)).toEqual([12, 12, 6]);
    expect(chunks.join('')).toBe('这'.repeat(30));
  });
});
