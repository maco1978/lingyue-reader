import { describe, it, expect } from 'vitest';
import { mapFoliateBook, zhPreferringTextOf } from '../src/core/mobiAdapter';

const fakeBook = {
  sections: [
    { createDocument: async () => ({ body: { innerHTML: '<p>正文一</p>' }, querySelector: () => ({ textContent: '第一章' }) }), linear: undefined, cfi: '/6/2' },
    { createDocument: async () => ({ body: { innerHTML: '<p>正文二</p>' }, querySelector: () => ({ textContent: '第二章' }) }), linear: 'no', cfi: '/6/4' },
  ],
  toc: [{ label: '第一章', href: 'ch1' }],
  metadata: { title: 'Kindle书', creator: '作者乙', identifier: 'kindle-1' },
};

describe('mapFoliateBook', () => {
  it('把 foliate book 映射为统一 Book，并跳过 linear=no 的章节', async () => {
    const book = await mapFoliateBook('book.azw3', fakeBook as any, 'azw3');
    expect(book.meta.format).toBe('azw3');
    expect(book.meta.presentation).toBe('reflowed');
    expect(book.spine).toHaveLength(1);
    expect(book.spine[0].title).toBe('第一章');
    expect(book.spine[0].cfi).toBe('/6/2');
  });

  it('元数据映射：title/author/id，缺省时回退文件名', async () => {
    const book = await mapFoliateBook('book.azw3', fakeBook as any, 'azw3');
    expect(book.meta.title).toBe('Kindle书');
    expect(book.meta.author).toBe('作者乙');
    expect(book.meta.id).toBe('book.azw3:kindle-1');

    const fallback = await mapFoliateBook('无名书.azw3', { sections: [], toc: [], metadata: {} } as any, 'azw3');
    expect(fallback.meta.title).toBe('无名书');
    expect(fallback.meta.id).toBe('无名书.azw3:azw3');
    expect(fallback.toc).toHaveLength(0);
  });

  it('元数据多语言映射：优先 zh / zh-CN，否则取第一个值', () => {
    expect(zhPreferringTextOf({ zh: '中文标题', en: 'Title' })).toBe('中文标题');
    expect(zhPreferringTextOf({ 'zh-CN': '简体中文', zh: '中文', en: 'Title' })).toBe('中文');
    expect(zhPreferringTextOf({ en: 'Title', fr: 'Titre' })).toBe('Title');
    expect(zhPreferringTextOf('纯字符串')).toBe('纯字符串');
    expect(zhPreferringTextOf(undefined)).toBe('');
  });

  it('TOC 按 href 解析到 spine 序号：TOC 顺序与 spine 不同也能对上', async () => {
    const docOf = (t: string) => async () => ({ body: { innerHTML: '<p>x</p>' }, querySelector: () => ({ textContent: t }) });
    // foliate 的 resolveHref 返回「原始 spine」的序号（含 linear=no 的封面）
    const hrefIndex: Record<string, { index: number }> = {
      'ch1.xhtml': { index: 0 },
      'cover.xhtml': { index: 1 },
      'ch2.xhtml': { index: 2 },
      'ch3.xhtml': { index: 3 },
    };
    const shuffled = {
      sections: [
        { createDocument: docOf('第一章'), linear: undefined, cfi: '/6/2' },   // raw 0
        { createDocument: docOf('封面'), linear: 'no', cfi: '/6/4' },          // raw 1，被跳过
        { createDocument: docOf('第二章'), linear: undefined, cfi: '/6/6' },   // raw 2
        { createDocument: docOf('第三章'), linear: undefined, cfi: '/6/8' },   // raw 3
      ],
      // TOC 顺序故意与 spine 不同：第三章在前
      toc: [
        { label: '第三章', href: 'ch3.xhtml' },
        { label: '第一章', href: 'ch1.xhtml' },
        { label: '第二章', href: 'ch2.xhtml' },
      ],
      metadata: { title: '乱序书' },
      resolveHref: (href: string) => hrefIndex[href] ?? null,
    };
    const book = await mapFoliateBook('乱序.azw3', shuffled as any, 'azw3');
    // spine = [第一章, 第二章, 第三章]（raw 1 的封面 linear=no 被跳过）
    expect(book.spine.map(c => c.title)).toEqual(['第一章', '第二章', '第三章']);
    // 原始序号 3/0/2 折算成过滤后的 Book spine 序号 2/0/1
    expect(book.toc.map(t => t.index)).toEqual([2, 0, 1]);
  });

  it('TOC 无 resolveHref 时按 section href/id 兜底匹配，再不行回退位置映射', async () => {
    const docOf = (t: string) => async () => ({ body: { innerHTML: '' }, querySelector: () => ({ textContent: t }) });
    const byHref = {
      sections: [
        { createDocument: docOf('B章'), href: 'b.xhtml', linear: undefined },
        { createDocument: docOf('A章'), href: 'a.xhtml', linear: undefined },
      ],
      toc: [
        { label: 'A章', href: 'a.xhtml' },
        { label: 'B章', href: 'b.xhtml' },
      ],
      metadata: {},
    };
    const book = await mapFoliateBook('h.fb2', byHref as any, 'fb2');
    expect(book.toc.map(t => t.index)).toEqual([1, 0]);

    // 完全没有可解析信息：回退位置映射（越界归 0）
    const positional = await mapFoliateBook('p.fb2', {
      sections: [{ createDocument: docOf('唯一章'), linear: undefined }],
      toc: [{ label: '唯一', href: 'x.xhtml' }, { label: '越界', href: 'y.xhtml' }],
      metadata: {},
    } as any, 'fb2');
    expect(positional.toc.map(t => t.index)).toEqual([0, 0]);
  });

  it('mapFoliateBook 接受 presentation 覆盖', async () => {
    const book = await mapFoliateBook('b.epub', { sections: [], toc: [], metadata: {} } as any, 'epub', 'original');
    expect(book.meta.presentation).toBe('original');
    expect(book.meta.format).toBe('epub');
  });
});
