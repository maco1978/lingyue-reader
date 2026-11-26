import React, { useState } from 'react';
import type { Book } from '../core/types';
import { bookStore, memoryStorage } from '../core/bookStore';

const store = bookStore(memoryStorage());

export function Reader({ book }: { book: Book }) {
  const [index, setIndex] = useState(0);
  const chapter = book.spine[index];

  function goTo(next: number) {
    setIndex(next);
    store.saveProgress(book.meta.id, {
      bookId: book.meta.id,
      chapterIndex: next,
      anchor: 'chapter:' + next,
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
