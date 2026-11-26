import type { Book, Chapter, BookFormat } from './types';
import { MOBI } from 'foliate-js/mobi.js';
import { unzlibSync } from 'fflate';

interface FoliateSection {
  createDocument(): Promise<Document> | Document;
  linear?: string;
  cfi?: string;
}
interface FoliateBookLike {
  sections: FoliateSection[];
  toc: { label: string }[];
  metadata: Record<string, unknown>;
}

/** foliate 的 metadata 值可能是字符串或 {语言:文本} 对象 */
function textOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return Object.values(v as Record<string, string>)[0] ?? '';
  return '';
}

/** foliate book → 统一 Book；MOBI/AZW3/FB2 都走这条映射 */
export async function mapFoliateBook(
  fileName: string,
  raw: FoliateBookLike,
  format: BookFormat,
): Promise<Book> {
  const spine: Chapter[] = [];
  for (const section of raw.sections) {
    if (section.linear === 'no') continue;
    const doc = await section.createDocument() as any;
    spine.push({
      index: spine.length,
      title: doc.querySelector?.('h1, h2, title')?.textContent?.trim() || '第 ' + (spine.length + 1) + ' 章',
      html: doc.body?.innerHTML ?? '',
      cfi: section.cfi,
    });
  }
  return {
    meta: {
      id: fileName + ':' + (textOf(raw.metadata.identifier) || format),
      title: textOf(raw.metadata.title) || fileName.replace(/\.[^.]+$/, ''),
      author: textOf(raw.metadata.author ?? raw.metadata.creator),
      format,
      presentation: 'reflowed',
    },
    spine,
    toc: (raw.toc ?? []).map((item, i) => ({ title: item.label, index: Math.min(i, Math.max(0, spine.length - 1)) })),
  };
}

/** MOBI/AZW3/KF8：foliate 负责二进制解码，我们负责归一 */
export async function buildMobiBook(fileName: string, bytes: Uint8Array): Promise<Book> {
  const parser = new MOBI({ unzlib: (data: Uint8Array) => unzlibSync(data) });
  await (parser as any).open(new Blob([bytes as BlobPart]));
  await (parser as any).init();
  return mapFoliateBook(fileName, parser as any, 'azw3');
}
