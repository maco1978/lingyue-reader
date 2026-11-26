import type { Book, Chapter, BookFormat, Presentation } from './types';

/**
 * foliate 的 Book → 统一 Book 的共用映射。
 * EPUB / MOBI / AZW3 / FB2 四个适配器都走这里，保证元数据、spine、toc 语义一致。
 * （与 foliate 无关的 TXT/DOCX 走各自适配器，不经此模块。）
 */

interface FoliateSection {
  createDocument(): Promise<Document> | Document;
  linear?: string;
  cfi?: string;
  /**
   * foliate 各格式的 section 标识差异很大：
   * - EPUB (epub.js:977)：id 是 manifest href 字符串
   * - MOBI/AZW3 (mobi.js:702) 与 FB2 (fb2.js:329)：id 是数字序号
   * - FB2 额外不带 href；MOBI 也不带 href
   * 绝不能把数字 id 当字符串处理。
   */
  href?: string;
  id?: string | number;
}
interface FoliateBookLike {
  sections: FoliateSection[];
  toc: { label: string; href?: string }[];
  metadata: Record<string, unknown>;
  /**
   * foliate 的 resolveHref：EPUB/FB2 是同步，MOBI 的 KF8 (mobi.js:1183) 是 async。
   * 返回原始 spine 序号（含 linear=no），可能为 null/undefined。
   */
  resolveHref?: (href: string) => { index: number } | null | undefined | Promise<{ index: number } | null | undefined>;
}

/** foliate 的 metadata 值可能是字符串、{语言:文本} 对象或数组/对象；中文优先，非字符串一律降级空串 */
export function zhPreferringTextOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const key of ['zh', 'zh-CN']) {
      const candidate = o[key];
      if (typeof candidate === 'string') return candidate;
    }
    for (const candidate of Object.values(o)) {
      if (typeof candidate === 'string') return candidate;
    }
  }
  return '';
}

/** 去掉 href 的锚点部分，便于和 section 路径比对；仅接受字符串 */
function stripHash(href: string): string {
  return href.split('#')[0];
}

/** href 归一化：去锚点、去前导 ./ */
function normalizeHref(href: string): string {
  return stripHash(href).replace(/^\.\//, '');
}

/** 原始 spine 序号 → 过滤后（linear=no 被跳过）的 Book spine 序号 */
function buildRawToSpineMap(sections: FoliateSection[]): Map<number, number> {
  const rawToSpine = new Map<number, number>();
  let next = 0;
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].linear === 'no') continue;
    rawToSpine.set(i, next++);
  }
  return rawToSpine;
}

/**
 * TOC 条目 → Book spine 序号。
 * 1) foliate 的 resolveHref（await，兼容 async 的 KF8；原始序号折算为过滤后的序号）
 * 2) href 与 section 字符串路径比对（EPUB 的字符串 href/id；FB2 的数字串 href 由 resolveHref 处理）
 * 3) 位置映射回退
 */
async function buildToc(raw: FoliateBookLike, sections: FoliateSection[], spine: Chapter[]) {
  const rawToSpine = buildRawToSpineMap(sections);

  // 仅当 href 是字符串时建立路径索引（EPUB）；MOBI/FB2 的数字 id 不进这个索引
  const byHref = new Map<string, number>();
  sections.forEach((section, i) => {
    if (typeof section.href === 'string') byHref.set(normalizeHref(section.href), i);
    else if (section.href === undefined && typeof section.id === 'string') byHref.set(normalizeHref(section.id), i);
  });

  const spineLen = spine.length;
  const toc: { title: string; index: number }[] = [];
  for (const [i, item] of (raw.toc ?? []).entries()) {
    let index: number | undefined;

    if (typeof item.href === 'string' && raw.resolveHref) {
      try {
        const resolved = await raw.resolveHref(item.href);
        if (resolved && resolved.index >= 0) index = rawToSpine.get(resolved.index);
      } catch {
        // resolveHref 失败（如损坏锚点）走兜底，不中断整本书
      }
    }

    if (index === undefined && typeof item.href === 'string') {
      const mapped = byHref.get(normalizeHref(item.href));
      if (mapped !== undefined && rawToSpine.has(mapped)) index = rawToSpine.get(mapped);
    }

    if (index === undefined) index = i < spineLen ? i : 0;
    toc.push({ title: item.label, index });
  }
  return toc;
}

/** foliate book → 统一 Book */
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
    toc: await buildToc(raw, raw.sections, spine),
  };
}
