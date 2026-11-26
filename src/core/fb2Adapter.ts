import { makeFB2 } from 'foliate-js/fb2.js';
import { mapFoliateBook } from './foliateBook';
import type { Book } from './types';

/** FB2：foliate 解析 XML，映射走共用的 foliateBook 归一逻辑 */
export async function buildFb2Book(fileName: string, bytes: Uint8Array): Promise<Book> {
  const parser = await makeFB2(new Blob([bytes as BlobPart]));
  return mapFoliateBook(fileName, parser as any, 'fb2');
}
