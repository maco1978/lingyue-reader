import { parseAnchor } from './anchors';
import type { Annotation } from './types';

/**
 * 划线定位契约：偏移量是「章节正文拼接后的纯文本」里从 0 开始的下标，
 * 与 chapter.html 的 textContent 一致（两种渲染模式都按同一份文本算）。
 * anchor 只存起点，终点由 quote.length 推出，所以不必扩展数据模型。
 */

export interface SelectionDraft {
  start: number;
  end: number;
  quote: string;
  /** 选区在页面坐标系里的位置，用来摆放浮动工具条 */
  top: number;
  left: number;
}

/** 收集 root 下所有文本节点（文档序） */
export function textNodesIn(root: Node): Text[] {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  return nodes;
}

/** 选区 → 相对 root 文本的起止偏移；跨出 root、逆序或空选区返回 null */
export function selectionToOffsets(root: Node, range: Range): { start: number; end: number } | null {
  if (range.collapsed) return null;
  // 边界必须落在 root 内，否则 setEnd 会把范围延伸到 root 之外，算出的偏移毫无意义
  if (range.startContainer !== root && !root.contains(range.startContainer)) return null;
  if (range.endContainer !== root && !root.contains(range.endContainer)) return null;
  const doc = root.ownerDocument ?? (root as Document);
  try {
    const before = doc.createRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;

    const through = doc.createRange();
    through.selectNodeContents(root);
    through.setEnd(range.endContainer, range.endOffset);
    const end = through.toString().length;

    return end > start ? { start, end } : null;
  } catch {
    // 选区边界不在 root 内时 setEnd 会抛错，按「没有选区」处理
    return null;
  }
}

/** 读取当前选区；offsetX/offsetY 用于 iframe（草稿坐标要加上 iframe 的位置） */
export function readSelection(root: Node, offsetX = 0, offsetY = 0): SelectionDraft | null {
  const doc = root.ownerDocument;
  const win = doc?.defaultView;
  const selection = win?.getSelection();
  if (!doc || !win || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  const range = selection.getRangeAt(0);
  if (range.commonAncestorContainer !== root && !root.contains(range.commonAncestorContainer)) return null;

  const offsets = selectionToOffsets(root, range);
  if (!offsets) return null;

  const quote = range.toString();
  if (!quote.trim()) return null;

  const rect = range.getBoundingClientRect();
  return { ...offsets, quote, top: rect.top + offsetY, left: rect.left + offsetX };
}

/** 只拆一个文本节点：before | mark(middle) | after */
function wrapTextNode(node: Text, start: number, end: number, annotationId: string, className: string): void {
  const doc = node.ownerDocument;
  const parent = node.parentNode;
  if (!doc || !parent) return;
  const middle = node.splitText(start);
  middle.splitText(end - start);
  const mark = doc.createElement('mark');
  mark.className = className;
  if (annotationId) mark.setAttribute('data-annotation', annotationId);
  parent.insertBefore(mark, middle);
  mark.appendChild(middle);
}

/** 按偏移把 [start,end) 包进 mark；每调用一次都重新收集文本节点，所以多条划线可叠加 */
export function wrapOffsets(
  root: Node,
  start: number,
  end: number,
  annotationId: string,
  className = 'lingyue-highlight',
): void {
  if (end <= start) return;
  const nodes = textNodesIn(root);
  let total = 0;
  for (const node of nodes) {
    const nodeStart = total;
    const nodeEnd = total + node.data.length;
    const localStart = Math.max(start, nodeStart);
    const localEnd = Math.min(end, nodeEnd);
    if (localEnd > localStart) {
      wrapTextNode(node, localStart - nodeStart, localEnd - nodeStart, annotationId, className);
    }
    total = nodeEnd;
  }
}

/** 清掉旧的 mark，把文本还原（重新划线前必须先清，否则偏移会叠加） */
export function clearHighlights(root: ParentNode): void {
  const marks = root.querySelectorAll('mark.lingyue-highlight');
  marks.forEach(mark => mark.replaceWith(...Array.from(mark.childNodes)));
  (root as Node).normalize?.();
}

export interface ChapterHighlight {
  annotation: Annotation;
  start: number;
  end: number;
}

/** 过滤出本章的划线，并把 anchor 还原成 [start, end) */
export function highlightsOfChapter(chapterIndex: number, annotations: Annotation[]): ChapterHighlight[] {
  const out: ChapterHighlight[] = [];
  for (const annotation of annotations) {
    const parsed = parseAnchor(annotation.anchor);
    if (!parsed || parsed.chapter !== chapterIndex) continue;
    out.push({ annotation, start: parsed.offset, end: parsed.offset + annotation.quote.length });
  }
  return out;
}

export function applyHighlights(root: ParentNode, highlights: ChapterHighlight[]): void {
  clearHighlights(root);
  for (const { annotation, start, end } of highlights) {
    wrapOffsets(root as Node, start, end, annotation.id);
  }
}

/** 边听边看：当前朗读段的底色高亮，与划线是两套 mark，互不覆盖 */
export function clearSpeaking(root: ParentNode): void {
  root.querySelectorAll('mark.lingyue-speaking').forEach(mark => {
    mark.replaceWith(...Array.from(mark.childNodes));
  });
  (root as Node).normalize?.();
}

export function applySpeaking(root: ParentNode, start: number, end: number): void {
  clearSpeaking(root);
  wrapOffsets(root as Node, start, end, '', 'lingyue-speaking');
}
