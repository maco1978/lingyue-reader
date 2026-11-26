import { describe, it, expect } from 'vitest';
import { splitChapters, buildTxtBook } from '../src/core/reflowTxt';

describe('splitChapters', () => {
  it('按 第 X 章 识别真正的章节标题', () => {
    const text = '第一章 起风\n他站在门口。\n第二章 下雨\n雨下了起来。';
    const chapters = splitChapters(text);
    expect(chapters.map((c) => c.title)).toEqual(['第一章 起风', '第二章 下雨']);
    expect(chapters[0].body).toContain('他站在门口。');
  });

  it('把 第一章的正文。 这类正文误判挡掉', () => {
    expect(splitChapters('第一章的正文。\n继续。')).toHaveLength(0);
  });

  it('一章都认不出时按长度硬切', () => {
    const chapters = splitChapters('a'.repeat(3000), 1000);
    expect(chapters.length).toBeGreaterThan(1);
    expect(chapters[0].title).toMatch(/^第 1 章/);
  });
});

describe('buildTxtBook', () => {
  it('产出 presentation=reflowed 的统一 Book，带 toc', () => {
    const book = buildTxtBook('book.txt', new TextEncoder().encode('第一章 起风\n正文。'));
    expect(book.meta.presentation).toBe('reflowed');
    expect(book.meta.format).toBe('txt');
    expect(book.spine).toHaveLength(1);
    expect(book.toc[0].index).toBe(0);
  });
});
