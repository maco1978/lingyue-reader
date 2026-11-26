import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { chunkChapter, chunkChapterRanges } from '../src/core/tts/chunker';

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

describe('chunkChapter 按标点断句', () => {
  it('中文按句末标点切分，不把句子拦腰截断', () => {
    const chunks = chunkChapter('<p>他站在门口。</p><p>风把纸片吹起来。</p><p>雨下了起来。</p>', 15);
    expect(chunks).toEqual(['他站在门口。风把纸片吹起来。', '雨下了起来。']);
  });

  it('英文按句号+空格断句，不切在单词中间', () => {
    const chunks = chunkChapter('<p>Hello world. This is a test.</p>', 20);
    expect(chunks).toEqual(['Hello world.', 'This is a test.']);
  });

  it('省略号与分号也算句末', () => {
    const chunks = chunkChapter('他说……然后走了；没有人回答。', 12);
    expect(chunks).toEqual(['他说……然后走了；', '没有人回答。']);
  });

  it('每一段都不超过上限', () => {
    const text = '第一句话很重要。第二句话也很重要！第三句话同样重要？'.repeat(20);
    const chunks = chunkChapter('<p>' + text + '</p>', 50);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(50);
  });

  it('短句之后遇到超长无标点段落时，缓冲区不丢', () => {
    const chunks = chunkChapter('<p>开头一句。</p><p>' + '这'.repeat(30) + '</p>', 12);
    expect(chunks[0]).toBe('开头一句。');
    expect(chunks.join('').replace('开头一句。', '')).toBe('这'.repeat(30));
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(12);
  });
});

describe('chunkChapterRanges 原文区间', () => {
  it('区间与正文 textContent 对齐，可直接用于边听边看高亮', () => {
    const html = '<p>第一句。第二句。</p><p>第三句。</p>';
    const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
    const chunks = chunkChapterRanges(html, 6);

    expect(chunks.map(c => c.text)).toEqual(['第一句。', '第二句。', '第三句。']);
    expect(chunks[0].start).toBe(0);
    for (const chunk of chunks) {
      expect(chunk.text).toBe(text.slice(chunk.start, chunk.end).replace(/\s+/g, ' ').trim());
      expect(text.slice(chunk.start, chunk.end)).not.toContain('<');
    }
    // 区间按顺序排列，不重叠
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i].start).toBeGreaterThanOrEqual(chunks[i - 1].end);
    }
  });

  it('HTML 缩进与换行不会让区间错位', () => {
    const html = '<div>\n  <p> 他站在门口。 </p>\n  <p> 风把纸片吹起来。 </p>\n</div>';
    const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';
    const chunks = chunkChapterRanges(html, 100);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe('他站在门口。 风把纸片吹起来。');
    expect(text.slice(chunks[0].start, chunks[0].end)).toContain('风把纸片吹起来。');
  });
});
