/** 章节 XHTML → 纯文本分段：去标签、压缩空白、按标点/长度切，供 TTS 逐段合成 */
export function chunkChapter(html: string, maxLen = 800): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];

  const chunks: string[] = [];
  let buf = '';
  for (const ch of text) {
    buf += ch;
    if (buf.length >= maxLen && /[。！？!?.;；]/.test(ch)) {
      chunks.push(buf.trim());
      buf = '';
    } else if (buf.length >= maxLen) {
      // 无标点可用时按长度硬切，保证分段推进
      chunks.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}
