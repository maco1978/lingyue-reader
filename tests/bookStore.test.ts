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

  it('存储内容损坏时自愈：不抛错，按空状态继续', () => {
    const storage = memoryStorage();
    storage.set('lingyue:state:book-1', '{bad json');
    expect(bookStore(storage).loadState('book-1')).toEqual({ annotations: [], chatHistory: [] });

    storage.set('lingyue:state:book-1', 'null');
    expect(bookStore(storage).loadState('book-1')).toEqual({ annotations: [], chatHistory: [] });
  });

  it('字段类型不对时退回安全默认值，合法字段保留', () => {
    const storage = memoryStorage();
    storage.set('lingyue:state:book-1', JSON.stringify({
      annotations: '不是数组', chatHistory: { a: 1 }, progress: { chapterIndex: 2 },
    }));
    const state = bookStore(storage).loadState('book-1');
    expect(state.annotations).toEqual([]);
    expect(state.chatHistory).toEqual([]);
    expect(state.progress?.chapterIndex).toBe(2);
  });

  it('写入超配额时抛人话错误并保留 cause', () => {
    const storage = {
      get: () => null,
      set: () => { throw new Error('QuotaExceededError'); },
    };
    let err: (Error & { cause?: unknown }) | undefined;
    try {
      bookStore(storage).saveState('book-1', { annotations: [], chatHistory: [] });
    } catch (e) {
      err = e as Error & { cause?: unknown };
    }
    expect(err?.message).toContain('本地存储已满');
    expect(err?.cause).toBeInstanceOf(Error);
  });
});
