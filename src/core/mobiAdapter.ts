import type { Book, Chapter, BookFormat, Presentation } from './types';
import { MOBI } from 'foliate-js/mobi.js';
import { unzlibSync } from 'fflate';

interface FoliateSection {
  createDocument(): Promise<Document> | Document;
  linear?: string;
  cfi?: string;
  /** FB2 等适配器：section 自带 href/ id 可作 href 兜底匹配 */
  href?: string;
  id?: string;
}
interface FoliateBookLike {
  sections: FoliateSection[];
  toc: { label: string; href?: string; subitems?: unknown[] }[];
  metadata: Record<string, unknown>;
  /** foliate EPUB 提供；MOBI/FB2 没有，返回 { index } 或 null */
  resolveHref?: (href: string) => { index: number } | null | undefined;
}

/** foliate 的 metadata 值可能是字符串或 {语言:文本} 对象；中文优先 */
export function zhPreferringTextOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, string>;
    return o.zh ?? o['zh-CN'] ?? Object.values(o)[0] ?? '';
  }
  return '';
}

/** 去掉 href 的锚点部分，便于和 section 路径比对 */
function stripHash(href: string): string {
  return href.split('#')[0];
}

/**
 * TOC 条目 → Book spine 序号。
 * 优先 foliate 的 resolveHref（返回原始 spine 序号，需折算过滤后的序号），
 * 其次按 href 与 section 路径比对，最后回退位置映射。
 */
function buildToc(raw: FoliateBookLike, sections: FoliateSection[], spine: Chapter[]) {
  // 原始序号 → 过滤后（linear=no 被跳过）的 Book spine 序号
  const rawToSpine = new Map<number, number>();
  let next = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].linear === 'no') continue;
    rawToSpine.set(i, next++);
  }

  // href（去锚点、去前导 ./）→ Book spine 序号
  const byHref = new Map<string, number>();
  sections.forEach((section, i) => {
    const href = section.href ?? section.id;
    if (href) byHref.set(stripHash(href).replace(/^\.\//, ''), i);
  });

  const spineLen = spine.length;
  return (raw.toc ?? []).map((item, i) => {
    let index: number | undefined;

    const resolved = item.href && raw.resolveHref ? raw.resolveHref(item.href) : null;
    if (resolved && resolved.index >= 0) index = rawToSpine.get(resolved.index);

    if (index === undefined && item.href) {
      const key = stripHash(item.href).replace(/^\.\//, '');
      const mapped = byHref.get(key);
      if (mapped !== undefined && rawToSpine.has(mapped)) index = rawToSpine.get(mapped);
    }

    if (index === undefined) index = i < spineLen ? i : 0;
    return { title: item.label, index };
  });
}

/** foliate book → 统一 Book；MOBI/AZW3/FB2/EPUB 都走这条映射 */
export async function mapFoliateBook(
  fileName: string,
  raw: FoliateBookLike,
  format: BookFormat,
  presentation: Presentation = 'reflowed',
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
      id: fileName + ':' + (zhPreferringTextOf(raw.metadata.identifier) || format),
      title: zhPreferringTextOf(raw.metadata.title) || fileName.replace(/\.[^.]+$/, ''),
      author: zhPreferringTextOf(raw.metadata.author ?? raw.metadata.creator),
      format,
      presentation,
    },
    spine,
    toc: buildToc(raw, raw.sections, spine),
  };
}

/** MOBI/AZW3/KF8：foliate 负责二进制解码，我们负责归一 */
export async function buildMobiBook(fileName: string, bytes: Uint8Array): Promise<Book> {
  const parser = new MOBI({ unzlib: (data: Uint8Array) => unzlibSync(data) });
  await (parser as any).open(new Blob([bytes as BlobPart]));
  await (parser as any).init();
  return mapFoliateBook(fileName, parser as any, 'azw3');
}
