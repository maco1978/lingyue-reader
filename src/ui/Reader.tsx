import React, { useState } from 'react';
import type { Book } from '../core/types';
import { bookStore, memoryStorage } from '../core/bookStore';
import { makeAnchor } from '../core/anchors';

const store = bookStore(memoryStorage());

export function Reader({ book, initialChapter = 0 }: { book: Book; initialChapter?: number }) {
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
