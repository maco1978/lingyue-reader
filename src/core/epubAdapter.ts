import { EPUB } from 'foliate-js/epub.js';
import { makeZipSource } from './zipReader';
import { mapFoliateBook } from './foliateBook';
import type { Book } from './types';

/**
 * EPUB → 统一 Book。这里只做 foliate 的 EPUB 装配（zip 源、EPUB init），
 * spine/toc/metadata 的归一映射全部委托 mobiAdapter 的共用 mapFoliateBook。
 * 上层只认 Book，不知道 foliate 的存在。
 */
export async function buildEpubBook(fileName: string, bytes: Uint8Array): Promise<Book> {
  const src = makeZipSource(bytes);
  const parser = new EPUB({
    loadText: src.loadText,
    loadBlob: src.loadBlob,
    getSize: src.getSize,
    // 字体反混淆需要 SHA-1；浏览器安全上下文下可传 crypto.subtle.digest
    sha1: (data: ArrayBuffer) => globalThis.crypto?.subtle?.digest('SHA-1', data) ?? Promise.resolve(new ArrayBuffer(20)),
  } as any);

  await (parser as any).init();
  return mapFoliateBook(fileName, parser as any, 'epub', 'original');
}
