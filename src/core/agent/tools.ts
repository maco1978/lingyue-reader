import type { Book } from '../types';
import type { ToolSpec } from './types';
import { chunkChapter } from '../tts/chunker';

/** 在书中定位一句话，返回章节与原文片段 */
export function findInBook(book: Book, query: string): string {
  for (const ch of book.spine) {
    const text = chunkChapter(ch.html, 100000).join('');
    const idx = text.indexOf(query);
    if (idx >= 0) {
      const from = Math.max(0, idx - 30);
      return '《' + book.meta.title + '》' + ch.title + '：…' + text.slice(from, idx + query.length + 30) + '…（章节序号 ' + ch.index + '）';
    }
  }
  return '未在书中找到「' + query + '」';
}

export const AGENT_TOOLS: ToolSpec[] = [{
  name: 'findInBook',
  description: '在用户正在读的书里定位一句话或关键词，返回所在章节与原文片段。想知道某句话出处时使用。',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '要定位的原文片段或关键词' } }, required: ['query'] },
}];
