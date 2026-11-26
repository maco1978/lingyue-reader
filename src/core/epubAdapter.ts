import { EPUB } from 'foliate-js/epub.js';
import { makeZipSource } from './zipReader';
import type { Book, Chapter } from './types';

/** foliate 的 metadata 值可能是字符串或 {语言:文本} 对象 */
function textOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, string>;
    return o.zh ?? o['zh-CN'] ?? Object.values(o)[0] ?? '';
  }
  return '';
}

interface FoliateSection {
  createDocument(): Promise<Document> | Document;
  linear?: string;
  cfi?: string;
}
interface FoliateBook {
  sections: FoliateSection[];
  toc: { label: string; href: string; subitems?: unknown[] }[];
  metadata: Record<string, unknown>;
}

/** EPUB → 统一 Book。上层只认 Book，不知道 foliate 的存在。 */
export async function buildEpubBook(fileName: string, bytes: Uint8Array): Promise<Book> {
  const src = makeZipSource(bytes);
  const parser = new EPUB({
    loadText: src.loadText,
    loadBlob: src.loadBlob,
    getSize: src.getSize,
    // 字体反混淆需要 SHA-1；浏览器安全上下文下可传 crypto.subtle.digest
    sha1: (data: ArrayBuffer) => globalThis.crypto?.subtle?.digest('SHA-1', data) ?? Promise.resolve(new ArrayBuffer(20)),
  } as any);

  const raw = parser as unknown as FoliateBook;
  await (parser as any).init();

  const spine: Chapter[] = [];
  for (const section of raw.sections) {
    if (section.linear === 'no') continue;
    const doc = await section.createDocument();
    const d = doc as any;
    spine.push({
      index: spine.length,
      title: d.querySelector?.('h1, h2, title')?.textContent?.trim() || '第 ' + (spine.length + 1) + ' 章',
      html: d.body?.innerHTML ?? '',
      cfi: section.cfi,
    });
  }

  const toc = (raw.toc ?? []).map((item, i) => ({ title: item.label, index: i < spine.length ? i : 0 }));

  return {
    meta: {
      id: fileName + ':' + (textOf(raw.metadata.identifier) || 'epub'),
      title: textOf(raw.metadata.title) || fileName.replace(/\.epub$/i, ''),
      author: textOf(raw.metadata.author ?? raw.metadata.creator),
      format: 'epub',
      presentation: 'original',
    },
    spine,
    toc,
  };
}
