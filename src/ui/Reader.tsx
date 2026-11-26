import React, { useState, useMemo } from 'react';
import type { Book, Storage } from '../core/types';
import { bookStore, memoryStorage } from '../core/bookStore';
import { makeAnchor } from '../core/anchors';

export function Reader({ book, initialChapter = 0, storage }: { book: Book; initialChapter?: number; storage?: Storage }) {
  // 书级状态（进度/划线）走注入的 storage；默认 memoryStorage 保持既有测试与行为不变。
  // main 传入 localStorageAdapter()，让阅读进度与搭子/听书共享同一份书级状态。
  const store = useMemo(() => bookStore(storage ?? memoryStorage()), [storage]);
  const [index, setIndex] = useState(initialChapter);
  const chapter = book.spine[index];

  function goTo(next: number) {
    setIndex(next);
    store.saveProgress(book.meta.id, {
      bookId: book.meta.id,
      chapterIndex: next,
      anchor: makeAnchor(next, 0),
      updatedAt: Date.now(),
    });
  }

  return (
    <div style={{ display: 'flex', gap: 16, fontFamily: 'system-ui' }}>
      <aside style={{ width: 200, borderRight: '1px solid #ddd' }}>
        <h3>目录 {book.meta.presentation === 'reflowed' && <small>（重排）</small>}</h3>
        {book.toc.map((item) => (
          <button key={item.index} onClick={() => goTo(item.index)}>{item.title}</button>
        ))}
      </aside>
      <main style={{ flex: 1, maxWidth: 720, lineHeight: 1.8 }}>
        <h2>{chapter?.title}</h2>
        <div dangerouslySetInnerHTML={{ __html: chapter?.html ?? '' }} />
      </main>
    </div>
  );
}
