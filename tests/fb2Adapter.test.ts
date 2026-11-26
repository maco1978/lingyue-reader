import { describe, it, expect } from 'vitest';
import { mapFoliateBook } from '../src/core/foliateBook';

const fakeFb2 = {
  sections: [
    { createDocument: async () => ({ body: { innerHTML: '<p>正文一</p>' }, querySelector: () => ({ textContent: '卷一' }) }), cfi: undefined },
    { createDocument: async () => ({ body: { innerHTML: '<p>正文二</p>' }, querySelector: () => ({ textContent: '卷二' }) }), cfi: undefined },
  ],
  toc: [{ label: '卷一' }, { label: '卷二' }],
  metadata: { title: 'FB2书', author: '作者丙', identifier: 'fb2-1' },
};

describe('mapFoliateBook (fb2)', () => {
  it('把 foliate fb2 book 映射为统一 Book，章节顺序保持', async () => {
    const book = await mapFoliateBook('book.fb2', fakeFb2 as any, 'fb2');
    expect(book.meta.format).toBe('fb2');
    expect(book.meta.presentation).toBe('reflowed');
    expect(book.spine).toHaveLength(2);
    expect(book.spine[0].title).toBe('卷一');
    expect(book.spine[1].title).toBe('卷二');
    expect(book.spine[0].html).toBe('<p>正文一</p>');
    expect(book.toc).toEqual([{ title: '卷一', index: 0 }, { title: '卷二', index: 1 }]);
  });
});
