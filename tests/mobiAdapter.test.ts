import { describe, it, expect } from 'vitest';
import { mapFoliateBook } from '../src/core/mobiAdapter';

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
});
