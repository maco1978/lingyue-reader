import type { Book, Annotation } from '../types';
import type { ChatMessage } from './types';
import { chunkChapter } from '../tts/chunker';

interface ContextInput {
  book: Book;
  chapterIndex: number;
  annotations: Annotation[];
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
  question: string;
  budgetChars?: number;
}

/** 书级记忆 → 模型消息：当前章片段 + 最近划线 + 最近对话摘要 + 问题，带字符预算 */
export function buildContext(input: ContextInput): ChatMessage[] {
  const budget = input.budgetChars ?? 4000;
  const chapter = input.book.spine[Math.max(0, Math.min(input.chapterIndex, input.book.spine.length - 1))];
  const excerpt = chapter ? chunkChapter(chapter.html, budget).slice(0, 2).join('') : '';
  const quotes = input.annotations.slice(-5).map(a => '划线「' + a.quote + '」' + (a.note ? '（笔记：' + a.note + '）' : '')).join('；');
  const history = input.chatHistory.slice(-6).map(h => (h.role === 'user' ? '用户问：' : '搭子答：') + h.content.slice(0, 120)).join('；');

  const system = [
    '你是「读书搭子」，一个懂读者正在读什么的 AI 伙伴。只回答与这本书相关的问题。',
    '书：《' + input.book.meta.title + '》作者：' + (input.book.meta.author || '未知') + '。',
    '当前章节：' + (chapter?.title ?? '未知') + '。',
    '回答中标明「AI 生成」，涉及情节结论尽量引用原文。',
  ].join('\n');
  const context = [
    '【当前章节片段】' + excerpt.slice(0, budget),
    quotes ? '【读者划线】' + quotes : '',
    history ? '【最近对话摘要】' + history : '',
  ].filter(Boolean).join('\n').slice(0, budget);

  return [
    { role: 'system', content: system },
    { role: 'user', content: context + '\n\n问题：' + input.question },
  ];
}
