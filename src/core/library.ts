import type { BookMeta } from './types';

/**
 * 本地书库：把原始文件存进 IndexedDB，刷新、重开 PWA、断网后都能接着读。
 * 阅读进度/划线/聊天史仍在 localStorage（lingyue:state:<bookId>），两边用同一个 bookId 关联。
 */

export interface LibraryBook {
  /** 与 BookMeta.id 相同（文件名 + 标识符），同一本书重复导入会覆盖而不是新增 */
  id: string;
  /** 原始文件名：openBook 靠它判断格式 */
  fileName: string;
  meta: BookMeta;
  /** 原始字节数，用于书架展示 */
  size: number;
  chapterCount: number;
  addedAt: number;
  lastOpenedAt: number;
  file: Blob;
}

/** 书架条目：不含文件内容，可安全地传给 UI */
export interface LibraryEntry {
  id: string;
  fileName: string;
  meta: BookMeta;
  size: number;
  chapterCount: number;
  addedAt: number;
  lastOpenedAt: number;
}

/**
 * 驱动层只为把「排序 / 去重 / 更新」的逻辑与 IndexedDB 解耦：
 * 生产用 indexedDbDriver，测试用 memoryDriver，和 Storage 的注入风格一致。
 */
export interface LibraryDriver {
  all(): Promise<LibraryBook[]>;
  get(id: string): Promise<LibraryBook | undefined>;
  put(book: LibraryBook): Promise<void>;
  delete(id: string): Promise<void>;
}

const DB_NAME = 'lingyue-library';
const STORE = 'books';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('无法打开本地书库'));
    req.onblocked = () => reject(new Error('本地书库被其它标签页占用，请关闭其它页面后重试'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('书库操作失败'));
  });
}

/** IndexedDB 驱动：连接懒打开并复用；事务完成才 resolve，避免「还没落盘就报成功」 */
export function indexedDbDriver(): LibraryDriver {
  let dbPromise: Promise<IDBDatabase> | null = null;
  // 打开失败（隐私模式 / 被其它标签页阻塞）不要缓存失败结果，下次操作重新尝试
  const db = () => (dbPromise ??= openDb().catch(e => { dbPromise = null; throw e; }));

  async function write(run: (store: IDBObjectStore) => void): Promise<void> {
    const tx = (await db()).transaction(STORE, 'readwrite');
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('书库写入失败'));
      tx.onabort = () => reject(tx.error ?? new Error('书库写入被中断'));
    });
    run(tx.objectStore(STORE));
    await done;
  }

  return {
    async all() {
      return request<LibraryBook[]>((await db()).transaction(STORE).objectStore(STORE).getAll());
    },
    async get(id) {
      return request<LibraryBook | undefined>((await db()).transaction(STORE).objectStore(STORE).get(id));
    },
    put: book => write(store => store.put(book)),
    delete: id => write(store => store.delete(id)),
  };
}

/** 内存驱动：测试 / 浏览器禁用 IndexedDB 时的降级（本次会话可用，刷新即丢） */
export function memoryDriver(seed: LibraryBook[] = []): LibraryDriver {
  const map = new Map(seed.map(book => [book.id, book]));
  return {
    all: async () => [...map.values()],
    get: async id => map.get(id),
    put: async book => { map.set(book.id, book); },
    delete: async id => { map.delete(id); },
  };
}

function toEntry({ id, fileName, meta, size, chapterCount, addedAt, lastOpenedAt }: LibraryBook): LibraryEntry {
  return { id, fileName, meta, size, chapterCount, addedAt, lastOpenedAt };
}

export function library(driver: LibraryDriver) {
  const sortRecent = (entries: LibraryEntry[]) =>
    entries.sort((a, b) => (b.lastOpenedAt || b.addedAt) - (a.lastOpenedAt || a.addedAt));

  async function list(): Promise<LibraryEntry[]> {
    return sortRecent((await driver.all()).map(toEntry));
  }

  /** 导入即入库；同一本书重复导入保留首次加入时间 */
  async function save(input: {
    fileName: string;
    bytes: Uint8Array;
    meta: BookMeta;
    chapterCount: number;
  }): Promise<LibraryEntry> {
    const existing = await driver.get(input.meta.id);
    const now = Date.now();
    const book: LibraryBook = {
      id: input.meta.id,
      fileName: input.fileName,
      meta: input.meta,
      size: input.bytes.byteLength,
      chapterCount: input.chapterCount,
      addedAt: existing?.addedAt ?? now,
      lastOpenedAt: now,
      file: new Blob([input.bytes as BlobPart]),
    };
    try {
      await driver.put(book);
    } catch (e) {
      throw new Error('本地书库空间不足，图书未能保存（可在书架删除旧书后重试）', { cause: e });
    }
    return toEntry(book);
  }

  /** 取出原始文件；书已不在书库时返回 null */
  async function open(id: string): Promise<{ fileName: string; bytes: Uint8Array } | null> {
    const book = await driver.get(id);
    if (!book) return null;
    return { fileName: book.fileName, bytes: new Uint8Array(await book.file.arrayBuffer()) };
  }

  /** 打开成功后更新最近使用时间，书架据此排序 */
  async function touch(id: string): Promise<void> {
    const book = await driver.get(id);
    if (!book) return;
    await driver.put({ ...book, lastOpenedAt: Date.now() });
  }

  async function remove(id: string): Promise<void> {
    await driver.delete(id);
  }

  return { list, save, open, touch, remove };
}
