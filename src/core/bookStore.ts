import type { Annotation, BookProgress, BookState, Storage } from './types';

export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => { map.set(k, v); },
    remove: (k) => { map.delete(k); },
  };
}

const key = (bookId: string) => 'lingyue:state:' + bookId;

/** 缺省/损坏时的统一回退：一部书至少能带着空状态正常打开 */
function emptyState(): BookState {
  return { annotations: [], chatHistory: [] };
}

/** 存储里的历史数据只做最小校验：结构不对的字段退回安全默认值，不让脏数据进入渲染 */
function normalizeState(value: unknown): BookState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyState();
  const raw = value as Partial<BookState>;
  return {
    ...raw,
    annotations: Array.isArray(raw.annotations) ? raw.annotations : [],
    chatHistory: Array.isArray(raw.chatHistory) ? raw.chatHistory : [],
  };
}

export function bookStore(storage: Storage) {
  function loadState(bookId: string): BookState {
    const raw = storage.get(key(bookId));
    if (!raw) return emptyState();
    try {
      return normalizeState(JSON.parse(raw));
    } catch {
      // 一条坏数据不该让整页白屏：按空状态继续，下次写入自然覆盖
      return emptyState();
    }
  }

  function saveState(bookId: string, state: BookState): void {
    const serialized = JSON.stringify(state);
    try {
      storage.set(key(bookId), serialized);
    } catch (e) {
      throw new Error('本地存储已满，阅读记录未能保存（可先导出备份并清理浏览器数据）', { cause: e });
    }
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

  /** 从书库删除图书时调用；适配器不支持删除则静默跳过 */
  function removeState(bookId: string): void {
    storage.remove?.(key(bookId));
  }

  function removeAnnotation(bookId: string, annotationId: string): void {
    const state = loadState(bookId);
    state.annotations = state.annotations.filter(a => a.id !== annotationId);
    saveState(bookId, state);
  }

  return { loadState, saveState, saveProgress, addAnnotation, removeAnnotation, removeState };
}
