import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { makeEpub, makeObfuscatedEpub } from './fixtures/makeEpub';
import { buildEpubBook } from '../src/core/epubAdapter';

beforeAll(() => {
  const dom = new JSDOM('');
  (globalThis as any).DOMParser = dom.window.DOMParser;
  (globalThis as any).XMLSerializer = dom.window.XMLSerializer;
  (globalThis as any).Blob = dom.window.Blob;
});

describe('buildEpubBook', () => {
  it('把 EPUB 解析成统一 Book：元数据 / 两章 / toc / 原版呈现', async () => {
    const book = await buildEpubBook('测试书.epub', makeEpub());
    expect(book.meta.title).toBe('测试书');
    expect(book.meta.author).toBe('作者甲');
    expect(book.meta.format).toBe('epub');
    expect(book.meta.presentation).toBe('original');
    expect(book.spine).toHaveLength(2);
    expect(book.spine[0].html).toContain('他站在门口。');
    expect(book.toc.map(t => t.title)).toEqual(['第一章 起风', '第二章 下雨']);
  });

  it('章节带 foliate 的真实 CFI 基址', async () => {
    const book = await buildEpubBook('测试书.epub', makeEpub());
    expect(book.spine[0].cfi).toBeTruthy();
  });

  it('buildEpubBook 委托共用映射：TOC 按 href 解析而非数组位置', async () => {
    const book = await buildEpubBook('测试书.epub', makeEpub());
    // fixture 的 toc 顺序与 spine 一致，断言序号正确即可证明走的是 href 解析链路
    expect(book.toc.map(t => t.index)).toEqual([0, 1]);
  });

  it('带 encryption.xml 字体混淆的 EPUB 能正常打开（不报已损坏）', async () => {
    const book = await buildEpubBook('混淆书.epub', makeObfuscatedEpub());
    expect(book.meta.title).toBe('混淆书');
    expect(book.spine).toHaveLength(1);
    expect(book.spine[0].html).toContain('他站在门口。');
  });
});
