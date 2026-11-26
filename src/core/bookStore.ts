import type { Annotation, BookProgress, BookState, Storage } from './types';

export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => { map.set(k, v); },
  };
}

const key = (bookId: string) => 'lingyue:state:' + bookId;

export function bookStore(storage: Storage) {
  function loadState(bookId: string): BookState {
    const raw = storage.get(key(bookId));
    if (!raw) return { annotations: [], chatHistory: [] };
    return JSON.parse(raw) as BookState;
  }

  function saveState(bookId: string, state: BookState): void {
    storage.set(key(bookId), JSON.stringify(state));
  }

  function saveProgress(bookId: string, progress: BookProgress): void {
    const state = loadState(bookId);
    state.progress = progress;
    saveState(bookId, state);
  }

  function addAnnotation(bookId: string, annotation: Annotation): void {
    const state = loadState(bookId);
    state.annotations.push(annotation);
    saveState(bookId, state);
  }

  return { loadState, saveState, saveProgress, addAnnotation };
}
