import { EPUB } from 'foliate-js/epub.js';
import { makeZipSource } from './zipReader';
import { mapFoliateBook } from './foliateBook';
import type { Book } from './types';

/**
 * EPUB → 统一 Book。这里只做 foliate 的 EPUB 装配（zip 源、EPUB init），
 * spine/toc/metadata 的归一映射全部委托 foliateBook 的共用 mapFoliateBook。
 * 上层只认 Book，不知道 foliate 的存在。
 */
export async function buildEpubBook(fileName: string, bytes: Uint8Array): Promise<Book> {
  const src = makeZipSource(bytes);
  const parser = new EPUB({
    loadText: src.loadText,
    loadBlob: src.loadBlob,
    getSize: src.getSize,
    // foliate 的 sha1 契约（epub.js WebCryptoSHA1）：入参是 identifier 字符串，
    // 返回 Uint8Array（20 字节密钥）。字体混淆（encryption.xml）的 EPUB 靠它解密。
    sha1: async (str: string) => {
      const data = new TextEncoder().encode(str);
      const buffer = await globalThis.crypto.subtle.digest('SHA-1', data);
      return new Uint8Array(buffer);
    },
  } as any);

  await (parser as any).init();
  return mapFoliateBook(fileName, parser as any, 'epub', 'original');
}
