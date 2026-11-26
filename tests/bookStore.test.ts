import { describe, it, expect } from 'vitest';
import { bookStore, memoryStorage } from '../src/core/bookStore';

describe('bookStore', () => {
  it('新书没有状态时返回空结构', () => {
    expect(bookStore(memoryStorage()).loadState('book-1')).toEqual({
      annotations: [],
      chatHistory: [],
    });
  });

  it('保存进度后可读回，且锚点原样保留', () => {
    const store = bookStore(memoryStorage());
    store.saveProgress('book-1', {
      bookId: 'book-1', chapterIndex: 3, anchor: 'epubcfi(/6/4!/4/2/1:5)', updatedAt: 123,
    });
    expect(store.loadState('book-1').progress?.anchor).toBe('epubcfi(/6/4!/4/2/1:5)');
  });

  it('划线记录可追加且不覆盖进度', () => {
    const store = bookStore(memoryStorage());
    store.saveProgress('book-1', { bookId: 'book-1', chapterIndex: 0, anchor: 'a1', updatedAt: 1 });
    store.addAnnotation('book-1', {
      id: 'n1', bookId: 'book-1', anchor: 'a1', quote: '句子', note: '想法', createdAt: 2,
    });
    const state = store.loadState('book-1');
    expect(state.annotations).toHaveLength(1);
    expect(state.progress?.anchor).toBe('a1');
  });
});
