import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  applyHighlights, applySpeaking, clearHighlights, clearSpeaking, highlightsOfChapter,
  readSelection, selectionToOffsets, wrapOffsets,
} from '../src/core/annotations';
import { makeAnchor } from '../src/core/anchors';
import type { Annotation } from '../src/core/types';

let doc: Document;

beforeAll(() => {
  const dom = new JSDOM('<!doctype html><body><div id="root"><p>abc</p><p>def</p></div></body>');
  doc = dom.window.document;
});

/** 每个用例都重置成两段文本：abc / def，拼起来是 abcdef */
function root(): HTMLElement {
  const el = doc.getElementById('root')!;
  el.innerHTML = '<p>abc</p><p>def</p>';
  return el;
}

function rangeAcross(el: HTMLElement, startNode: Node, start: number, endNode: Node, end: number): Range {
  const range = doc.createRange();
  range.setStart(startNode, start);
  range.setEnd(endNode, end);
  return range;
}

describe('selectionToOffsets', () => {
  it('跨段落的选区换算成拼接文本的偏移', () => {
    const el = root();
    const [p1, p2] = Array.from(el.querySelectorAll('p'));
    const range = rangeAcross(el, p1.firstChild!, 2, p2.firstChild!, 2);
    expect(selectionToOffsets(el, range)).toEqual({ start: 2, end: 5 });
  });

  it('同一文本节点内的选区', () => {
    const el = root();
    const p1 = el.querySelector('p')!;
    const range = rangeAcross(el, p1.firstChild!, 0, p1.firstChild!, 2);
    expect(selectionToOffsets(el, range)).toEqual({ start: 0, end: 2 });
  });

  it('空选区返回 null', () => {
    const el = root();
    const p1 = el.querySelector('p')!;
    const range = doc.createRange();
    range.setStart(p1.firstChild!, 1);
    range.setEnd(p1.firstChild!, 1);
    expect(selectionToOffsets(el, range)).toBeNull();
  });

  it('选区边界不在 root 内时不抛错', () => {
    const el = root();
    const outside = doc.createElement('p');
    outside.textContent = 'xyz';
    doc.body.appendChild(outside);
    const range = rangeAcross(el, outside.firstChild!, 0, outside.firstChild!, 2);
    expect(() => selectionToOffsets(el, range)).not.toThrow();
    expect(selectionToOffsets(el, range)).toBeNull();
  });
});

describe('readSelection', () => {
  it('读取选区并给出页面坐标', () => {
    const el = root();
    const [p1, p2] = Array.from(el.querySelectorAll('p'));
    const fakeRange = {
      collapsed: false,
      commonAncestorContainer: p1,
      startContainer: p1.firstChild,
      startOffset: 2,
      endContainer: p2.firstChild,
      endOffset: 2,
      toString: () => 'cde',
      getBoundingClientRect: () => ({ top: 10, left: 20 }),
    } as unknown as Range;
    (doc.defaultView as any).getSelection = () => ({
      rangeCount: 1, isCollapsed: false, getRangeAt: () => fakeRange,
    });

    expect(readSelection(el)).toEqual({ start: 2, end: 5, quote: 'cde', top: 10, left: 20 });
    expect(readSelection(el, 100, 200)).toMatchObject({ top: 210, left: 120 });
  });

  it('没有选区时返回 null', () => {
    const el = root();
    (doc.defaultView as any).getSelection = () => ({ rangeCount: 0, isCollapsed: true, getRangeAt: () => null });
    expect(readSelection(el)).toBeNull();
  });
});

describe('wrapOffsets / clearHighlights', () => {
  it('跨段落包 mark，文本不增不减', () => {
    const el = root();
    wrapOffsets(el, 1, 5, 'a1');
    const marks = el.querySelectorAll('mark.lingyue-highlight');
    expect(Array.from(marks).map(m => m.textContent)).toEqual(['bc', 'de']);
    expect(marks[0].getAttribute('data-annotation')).toBe('a1');
    expect(el.textContent).toBe('abcdef');

    clearHighlights(el);
    expect(el.querySelectorAll('mark')).toHaveLength(0);
    expect(el.textContent).toBe('abcdef');
  });

  it('多条划线叠加后文本仍然完整', () => {
    const el = root();
    wrapOffsets(el, 0, 3, 'a');
    wrapOffsets(el, 2, 5, 'b');
    expect(el.textContent).toBe('abcdef');
    expect(el.querySelectorAll('mark.lingyue-highlight').length).toBeGreaterThanOrEqual(3);
  });

  it('再次整体重画不会叠加旧 mark', () => {
    const el = root();
    const annotations: Annotation[] = [{
      id: 'a', bookId: 'b', anchor: makeAnchor(0, 1), quote: 'bc', note: '', createdAt: 1,
    }];
    applyHighlights(el, highlightsOfChapter(0, annotations));
    applyHighlights(el, highlightsOfChapter(0, annotations));
    expect(el.querySelectorAll('mark.lingyue-highlight')).toHaveLength(1);
    expect(el.textContent).toBe('abcdef');
  });

  it('边听边看的朗读高亮与划线是两套 mark，互不覆盖', () => {
    const el = root();
    const annotations: Annotation[] = [{
      id: 'a', bookId: 'b', anchor: makeAnchor(0, 1), quote: 'bc', note: '', createdAt: 1,
    }];
    applyHighlights(el, highlightsOfChapter(0, annotations));
    applySpeaking(el, 2, 5);

    expect(el.querySelectorAll('mark.lingyue-highlight')).toHaveLength(1);
    const speaking = Array.from(el.querySelectorAll('mark.lingyue-speaking'));
    expect(speaking.map(m => m.textContent).join('')).toBe('cde');
    expect(el.textContent).toBe('abcdef');

    clearSpeaking(el);
    expect(el.querySelectorAll('mark.lingyue-speaking')).toHaveLength(0);
    expect(el.querySelectorAll('mark.lingyue-highlight')).toHaveLength(1);
    expect(el.textContent).toBe('abcdef');
  });
});

describe('highlightsOfChapter', () => {
  const annotations: Annotation[] = [
    { id: 'a', bookId: 'b', anchor: makeAnchor(1, 4), quote: '句子', note: '', createdAt: 1 },
    { id: 'b', bookId: 'b', anchor: makeAnchor(0, 0), quote: 'ab', note: '', createdAt: 2 },
  ];

  it('按章节过滤，终点由 quote 长度推出', () => {
    expect(highlightsOfChapter(1, annotations)).toEqual([{ annotation: annotations[0], start: 4, end: 6 }]);
    expect(highlightsOfChapter(0, annotations)).toEqual([{ annotation: annotations[1], start: 0, end: 2 }]);
    expect(highlightsOfChapter(9, annotations)).toEqual([]);
  });

  it('anchor 不合法时跳过而不是崩溃', () => {
    const broken: Annotation[] = [{ id: 'x', bookId: 'b', anchor: 'not-a-cfi', quote: 'x', note: '', createdAt: 1 }];
    expect(highlightsOfChapter(0, broken)).toEqual([]);
  });
});
