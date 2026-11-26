import { MOBI } from 'foliate-js/mobi.js';
import { unzlibSync } from 'fflate';
import { mapFoliateBook } from './foliateBook';
import type { Book } from './types';

export { mapFoliateBook } from './foliateBook';

/** MOBI/AZW3/KF8：foliate 负责二进制解码，归一映射走共用 foliateBook 模块 */
export async function buildMobiBook(fileName: string, bytes: Uint8Array): Promise<Book> {
  const parser = new MOBI({ unzlib: (data: Uint8Array) => unzlibSync(data) });
  await (parser as any).open(new Blob([bytes as BlobPart]));
  await (parser as any).init();
  return mapFoliateBook(fileName, parser as any, 'azw3');
}
