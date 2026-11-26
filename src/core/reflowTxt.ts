import { decodeText } from './decodeText';
import type { Book, Chapter } from './types';

const CHAPTER_RE = /^\s*(第[一二三四五六七八九十百千零〇\d]+[章节回卷篇部集]|Chapter\s+\d+|PART\s+\d+|序言|楔子|前言|后记|番外|附录)/i;
const BODY_START_RE = /^[的里中上下前后也就还就将是把被对从在说了过着]/;
const SENTENCE_PUNCT_RE = /[。！？；，、]/;

export interface RawChapter {
  title: string;
  body: string;
}

/** 判断一行是否看起来像正文，避免把 第一章的正文。 误当标题 */
function looksLikeBody(rest: string): boolean {
  return BODY_START_RE.test(rest) || SENTENCE_PUNCT_RE.test(rest) || rest.length > 60;
}

export function splitChapters(text: string, hardSlice = 8000): RawChapter[] {
  const lines = text.split(/\r?\n/);
  const result: RawChapter[] = [];
  let current: RawChapter | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(CHAPTER_RE);
    const isTitle = match && !looksLikeBody(trimmed.slice(match[0].length));
    if (isTitle) {
      if (current) result.push(current);
      current = { title: trimmed, body: '' };
    } else if (current) {
      current.body += (current.body ? '\n' : '') + trimmed;
    }
  }
  if (current) result.push(current);
  if (result.length > 0) return result;
  // 短文本认不出章节时保持原样（不硬切）；只对大部头兜底
  if (text.length <= hardSlice) return [];

  // 硬切兜底：宁可多切，也不让大部头变成单章（分页会卡死）
  const hard: RawChapter[] = [];
  let n = 1;
  for (let i = 0; i < text.length; i += hardSlice) {
    hard.push({ title: '第 ' + n + ' 章', body: text.slice(i, i + hardSlice).trim() });
    n += 1;
  }
  return hard;
}

export function buildTxtBook(fileName: string, bytes: Uint8Array): Book {
  const decoded = decodeText(bytes);
  const raw = splitChapters(decoded.text);
  const spine: Chapter[] = raw.map((c, i) => ({
    index: i,
    title: c.title,
    html: '<h1>' + escapeHtml(c.title) + '</h1><p>' + escapeHtml(c.body).replace(/\n/g, '</p><p>') + '</p>',
  }));
  return {
    meta: {
      id: hashName(fileName),
      title: fileName.replace(/\.txt$/i, ''),
      author: '',
      format: 'txt',
      presentation: 'reflowed',
      encoding: decoded.encoding,
    },
    spine,
    toc: raw.map((c, i) => ({ title: c.title, index: i })),
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as Record<string, string>)[ch]);
}

function hashName(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
