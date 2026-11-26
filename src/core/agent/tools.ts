import type { Book } from '../types';
import type { ToolSpec } from './types';
import { chunkChapter } from '../tts/chunker';

export interface LocateResult {
  chapterIndex: number;
  snippet: string;
}

/** 在书中定位一句话，返回章节序号与上下文原文片段；找不到或 query 为空白时返回 null */
export function locate(book: Book, query: string): LocateResult | null {
  if (!query.trim()) return null;
  for (const ch of book.spine) {
    const text = chunkChapter(ch.html, 100000).join('');
    const idx = text.indexOf(query);
    if (idx >= 0) {
      const from = Math.max(0, idx - 30);
      return {
        chapterIndex: ch.index,
        snippet: text.slice(from, idx + query.length + 30),
      };
    }
  }
  return null;
}

/** 在书中定位一句话，返回章节与原文片段（面向模型的友好文本） */
export function findInBook(book: Book, query: string): string {
  const hit = locate(book, query);
  if (hit) {
    const ch = book.spine.find(c => c.index === hit.chapterIndex);
    return '《' + book.meta.title + '》' + (ch?.title ?? '') + '：…' + hit.snippet + '…（章节序号 ' + hit.chapterIndex + '）';
  }
  return '未在书中找到「' + query + '」';
}

export const AGENT_TOOLS: ToolSpec[] = [{
  name: 'findInBook',
  description: '在用户正在读的书里定位一句话或关键词，返回所在章节与原文片段。想知道某句话出处时使用。',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '要定位的原文片段或关键词' } }, required: ['query'] },
}];
