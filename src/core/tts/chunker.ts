/** 句末标点：中文句号/叹号/问号/分号/省略号；英文 .!? 只在后面是空白或结尾时算 */
const SENTENCE_END = /[。！？；…]+|[.!?]+(?=\s|$)/g;

/** 按句末标点切句，标点跟着前一句走；不会产生只有标点的段 */
export function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let last = 0;
  for (const match of text.matchAll(SENTENCE_END)) {
    const end = (match.index ?? 0) + match[0].length;
    if (end > last) sentences.push(text.slice(last, end));
    last = end;
  }
  if (last < text.length) sentences.push(text.slice(last));
  return sentences;
}

export interface TextChunk {
  /** 送给 TTS 的文本：空白已压缩、首尾已裁剪 */
  text: string;
  /** 在章节正文 textContent 中的原始区间，用于「边听边看」高亮 */
  start: number;
  end: number;
}

function sentenceRanges(text: string): { start: number; end: number }[] {
  const ranges: { start: number; end: number }[] = [];
  let last = 0;
  for (const match of text.matchAll(SENTENCE_END)) {
    const end = (match.index ?? 0) + match[0].length;
    if (end > last) ranges.push({ start: last, end });
    last = end;
  }
  if (last < text.length) ranges.push({ start: last, end: text.length });
  return ranges;
}

function trimRange(text: string, start: number, end: number): { start: number; end: number } | null {
  let s = start;
  let e = end;
  while (s < e && /\s/.test(text[s])) s += 1;
  while (e > s && /\s/.test(text[e - 1])) e -= 1;
  return e > s ? { start: s, end: e } : null;
}

function normalizeSpace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 章节 XHTML → 文本分段（带原文区间），供 TTS 与「边听边看」共用。
 * 偏移是在原始 textContent 上算的，和阅读页 DOM、划线锚点完全同一套坐标。
 * 优先按句末标点切；只有单句本身就超过 maxLen 时才退化为硬切。
 */
export function chunkChapterRanges(html: string, maxLen = 800): TextChunk[] {
  // 非浏览器环境（SSR / 单元测试未注入 DOMParser）没有分段能力，返回空即可
  if (typeof DOMParser === 'undefined') return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const raw = doc.body?.textContent ?? '';
  if (!raw.trim()) return [];

  const limit = Math.max(1, Math.floor(maxLen));
  const chunks: TextChunk[] = [];
  let bufferStart = -1;
  let bufferEnd = -1;

  const flush = () => {
    if (bufferStart < 0) return;
    const range = trimRange(raw, bufferStart, bufferEnd);
    if (range) {
      chunks.push({ text: normalizeSpace(raw.slice(range.start, range.end)), start: range.start, end: range.end });
    }
    bufferStart = -1;
    bufferEnd = -1;
  };

  for (const sentence of sentenceRanges(raw)) {
    const length = sentence.end - sentence.start;
    if (length > limit) {
      // 无标点超长句：先收尾当前缓冲，再按长度硬切
      flush();
      for (let i = sentence.start; i < sentence.end; i += limit) {
        const sub = trimRange(raw, i, Math.min(sentence.end, i + limit));
        if (sub) {
          chunks.push({ text: normalizeSpace(raw.slice(sub.start, sub.end)), start: sub.start, end: sub.end });
        }
      }
      continue;
    }
    if (bufferStart >= 0 && sentence.end - bufferStart > limit) flush();
    if (bufferStart < 0) bufferStart = sentence.start;
    bufferEnd = sentence.end;
  }
  flush();

  return chunks;
}

/** 只要文本的分段（Agent 上下文、搜索等不需要区间的地方用） */
export function chunkChapter(html: string, maxLen = 800): string[] {
  return chunkChapterRanges(html, maxLen).map(chunk => chunk.text);
}
