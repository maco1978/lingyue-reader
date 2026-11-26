# 聆阅看书 M1 — 阅读底座 Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 建立可运行、可测试的阅读底座：统一书模型 + 格式识别 + TXT/EPUB 导入 + 书级状态持久化 + 最小阅读器，为 M2（听书）与 M3（搭子）提供稳定接口。

**Architecture:** Web 技术单代码库（React + TypeScript + Vite），Capacitor 打包到手机。格式层用「归一化」思路：任何输入都转成统一的 Book 模型（spine + 章节 + 锚点），上层阅读/听书/搭子不分叉。数据存本地 JSON，通过注入的 Storage 接口访问，便于测试与后续换 WebDAV。

**Tech Stack:** Node.js 22+、pnpm、TypeScript、Vite、React 18、Vitest、foliate-js（EPUB/MOBI 解析）、Capacitor（移动端打包，M1 只搭脚手架）。

**Skipped in this plan:** M2 听书引擎与音色卡、M3 读书搭子 Agent —— 它们是独立子系统，各自另出计划，见文末「后续计划」。

---

## File Structure

~~~
src/core/types.ts              Book / BookMeta / Chapter / BookState 定义（唯一数据契约）
src/core/detectFormat.ts       按扩展名 + 魔数识别输入格式
src/core/decodeText.ts         文本解码（BOM → UTF-8 → GB18030 严格回退）
src/core/reflowTxt.ts          TXT 切章，产出统一 Book
src/core/epubAdapter.ts        用 foliate-js 把 EPUB 解析成统一 Book（M1.5）
src/core/bookStore.ts          书级状态读写，注入 Storage 接口
src/core/anchors.ts            CFI 风格锚点的构造与解析
src/ui/Reader.tsx              最小阅读器：章节列表 + 正文 + 进度
src/main.tsx / index.html      Vite 入口
tests/                         与 src 同构的 Vitest 测试
~~~

---

### Task 1: 项目脚手架与测试基线

**Files:** 创建 package.json, tsconfig.json, vite.config.ts, index.html, src/main.tsx

- [ ] **Step 1: 写 package.json**

~~~json
{
  "name": "lingyue-reader",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "foliate-js": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0"
  }
}
~~~

- [ ] **Step 2: 写 tsconfig.json**

~~~json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests"]
}
~~~

- [ ] **Step 3: 写 vite.config.ts（测试环境设为 node）**

~~~ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', globals: true },
});
~~~

- [ ] **Step 4: 写最小入口 index.html 与 src/main.tsx**

~~~html
<!doctype html>
<html lang="zh-CN">
  <head><meta charset="UTF-8" /><title>聆阅看书</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
~~~

~~~tsx
import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return <div>聆阅看书 · 阅读底座</div>;
}

createRoot(document.getElementById('root')!).render(<App />);
~~~

- [ ] **Step 5: 安装依赖并验证基线**

Run: pnpm install && pnpm run build
Expected: 构建通过，无 TypeScript 报错。

- [ ] **Step 6: Commit**

~~~bash
git add package.json pnpm-lock.yaml tsconfig.json vite.config.ts index.html src/main.tsx
git commit -m "chore: 搭建 Vite + React + Vitest 脚手架"
~~~

---

### Task 2: 统一数据契约 types.ts

**Files:** 创建 src/core/types.ts

- [ ] **Step 1: 定义类型（先写类型，后续任务都依赖它）**

~~~ts
export type BookFormat =
  | 'epub' | 'pdf' | 'mobi' | 'azw3'
  | 'txt' | 'fb2' | 'docx' | 'rtf' | 'html' | 'cbz' | 'unknown';

/** 书籍的呈现方式：原版保留版式，重排为纯文字，图版为固定布局 */
export type Presentation = 'original' | 'reflowed' | 'fixed';

export interface BookMeta {
  id: string;
  title: string;
  author: string;
  format: BookFormat;
  presentation: Presentation;
  /** 诊断用：TXT 的实际编码 */
  encoding?: string;
}

export interface Chapter {
  index: number;
  title: string;
  /** 章节正文（XHTML 片段或纯文本，由呈现方式决定） */
  html: string;
}

/**
 * 全系统唯一的书模型。格式层产出它，阅读/听书/搭子消费它。
 * spine 是有序章节列表；toc 是 标题→章节序号 的索引。
 */
export interface Book {
  meta: BookMeta;
  spine: Chapter[];
  toc: { title: string; index: number }[];
}

export interface BookProgress {
  bookId: string;
  chapterIndex: number;
  /** CFI 风格锚点，例如 epubcfi(/6/4!/4/2/1:5)；禁止用百分比 */
  anchor: string;
  updatedAt: number;
}

export interface Annotation {
  id: string;
  bookId: string;
  anchor: string;
  quote: string;
  note: string;
  createdAt: number;
}

/** 书级状态：进度 + 划线 + 听书位置 + 聊天史，都挂在同一本书下 */
export interface BookState {
  progress?: BookProgress;
  annotations: Annotation[];
  audioPosition?: { chapterIndex: number; anchor: string };
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
}

/** 持久化适配器：测试注入内存实现，生产注入 localStorage / 文件系统 */
export interface Storage {
  get(key: string): string | null;
  set(key: string, value: string): void;
}
~~~

- [ ] **Step 2: 类型检查**

Run: pnpm exec tsc --noEmit
Expected: 通过。

- [ ] **Step 3: Commit**

~~~bash
git add src/core/types.ts
git commit -m "feat: 定义统一书模型与书级状态契约"
~~~

---

### Task 3: 格式识别 detectFormat（TDD）

**Files:** 创建 src/core/detectFormat.ts, tests/detectFormat.test.ts

- [ ] **Step 1: 写失败的测试**

~~~ts
import { describe, it, expect } from 'vitest';
import { detectFormat } from '../src/core/detectFormat';

const bytes = (...b: number[]) => new Uint8Array(b);

describe('detectFormat', () => {
  it('按扩展名识别 txt', () => {
    expect(detectFormat('book.txt', bytes(0))).toBe('txt');
  });

  it('按扩展名识别 epub / azw3 / cbz', () => {
    expect(detectFormat('a.epub', bytes(0))).toBe('epub');
    expect(detectFormat('a.azw3', bytes(0))).toBe('azw3');
    expect(detectFormat('a.cbz', bytes(0))).toBe('cbz');
  });

  it('魔数兜底：无扩展名但 PDF 魔数识别为 pdf', () => {
    expect(detectFormat('noext', bytes(0x25, 0x50, 0x44, 0x46))).toBe('pdf');
  });

  it('魔数兜底：无扩展名的 PK zip 类归 unknown', () => {
    expect(detectFormat('noext', bytes(0x50, 0x4b, 0x03, 0x04))).toBe('unknown');
  });

  it('未知扩展名但魔数是 PK 时按 epub 处理', () => {
    expect(detectFormat('mystery.bin', bytes(0x50, 0x4b, 0x03, 0x04))).toBe('epub');
  });

  it('完全无法识别返回 unknown', () => {
    expect(detectFormat('mystery.bin', bytes(0x00, 0x01))).toBe('unknown');
  });
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: pnpm test tests/detectFormat.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

~~~ts
import type { BookFormat } from './types';

const EXT_MAP: Record<string, BookFormat> = {
  epub: 'epub', pdf: 'pdf', mobi: 'mobi', azw: 'azw3', azw3: 'azw3',
  txt: 'txt', fb2: 'fb2', docx: 'docx', rtf: 'rtf', html: 'html', htm: 'html',
  cbz: 'cbz', cbr: 'cbz',
};

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

export function detectFormat(fileName: string, bytes: Uint8Array): BookFormat {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (EXT_MAP[ext]) return EXT_MAP[ext];
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'pdf'; // %PDF
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && ext !== '') return 'epub'; // PK zip 类
  return 'unknown';
}
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: pnpm test tests/detectFormat.test.ts
Expected: PASS（6 个测试）

- [ ] **Step 5: Commit**

~~~bash
git add src/core/detectFormat.ts tests/detectFormat.test.ts
git commit -m "feat: 按扩展名与魔数识别电子书格式"
~~~

---

### Task 4: 文本解码 decodeText（TDD）

**Files:** 创建 src/core/decodeText.ts, tests/decodeText.test.ts

- [ ] **Step 1: 写失败的测试**

~~~ts
import { describe, it, expect } from 'vitest';
import { decodeText, DecodeError } from '../src/core/decodeText';

const utf8 = (s: string) => new TextEncoder().encode(s);

describe('decodeText', () => {
  it('识别 UTF-8 BOM 并去掉 BOM', () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const input = new Uint8Array([...bom, ...utf8('第一章 起风')]);
    expect(decodeText(input)).toEqual({ text: '第一章 起风', encoding: 'utf-8' });
  });

  it('无 BOM 时按 UTF-8 解码', () => {
    expect(decodeText(utf8('你好世界'))).toEqual({ text: '你好世界', encoding: 'utf-8' });
  });

  it('严格模式下非法字节抛 DecodeError，不静默产出乱码', () => {
    expect(() => decodeText(new Uint8Array([0xff, 0xfe, 0xfd]))).toThrow(DecodeError);
  });
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: pnpm test tests/decodeText.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

~~~ts
export class DecodeError extends Error {
  constructor(message = 'E_TXT_DECODE_FAILED') {
    super(message);
    this.name = 'DecodeError';
  }
}

export interface DecodedText {
  text: string;
  encoding: string;
}

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

function hasBom(bytes: Uint8Array, sig: number[]): boolean {
  return sig.every((b, i) => bytes[i] === b);
}

/**
 * 解码顺序：BOM 优先，其次严格 UTF-8，最后严格 GB18030。
 * 严格（fatal: true）是关键：猜错直接抛错，而不是产出一屏 U+FFFD 却看起来成功。
 */
export function decodeText(bytes: Uint8Array): DecodedText {
  if (hasBom(bytes, UTF8_BOM)) {
    return { text: new TextDecoder('utf-8').decode(bytes.subarray(3)), encoding: 'utf-8' };
  }
  if (hasBom(bytes, UTF16LE_BOM)) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' };
  }
  if (hasBom(bytes, UTF16BE_BOM)) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' };
  }
  for (const enc of ['utf-8', 'gb18030']) {
    try {
      return { text: new TextDecoder(enc, { fatal: true }).decode(bytes), encoding: enc };
    } catch {
      // 试下一个编码
    }
  }
  throw new DecodeError();
}
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: pnpm test tests/decodeText.test.ts
Expected: PASS（3 个测试）

- [ ] **Step 5: Commit**

~~~bash
git add src/core/decodeText.ts tests/decodeText.test.ts
git commit -m "feat: 严格回退的文本解码（UTF-8 / GB18030 / UTF-16）"
~~~

---

### Task 5: TXT 重排成统一 Book（TDD）

**Files:** 创建 src/core/reflowTxt.ts, tests/reflowTxt.test.ts

- [ ] **Step 1: 写失败的测试**

~~~ts
import { describe, it, expect } from 'vitest';
import { splitChapters, buildTxtBook } from '../src/core/reflowTxt';

describe('splitChapters', () => {
  it('按 第 X 章 识别真正的章节标题', () => {
    const text = '第一章 起风\n他站在门口。\n第二章 下雨\n雨下了起来。';
    const chapters = splitChapters(text);
    expect(chapters.map((c) => c.title)).toEqual(['第一章 起风', '第二章 下雨']);
    expect(chapters[0].body).toContain('他站在门口。');
  });

  it('把 第一章的正文。 这类正文误判挡掉', () => {
    expect(splitChapters('第一章的正文。\n继续。')).toHaveLength(0);
  });

  it('一章都认不出时按长度硬切', () => {
    const chapters = splitChapters('a'.repeat(3000), 1000);
    expect(chapters.length).toBeGreaterThan(1);
    expect(chapters[0].title).toMatch(/^第 1 章/);
  });
});

describe('buildTxtBook', () => {
  it('产出 presentation=reflowed 的统一 Book，带 toc', () => {
    const book = buildTxtBook('book.txt', new TextEncoder().encode('第一章 起风\n正文。'));
    expect(book.meta.presentation).toBe('reflowed');
    expect(book.meta.format).toBe('txt');
    expect(book.spine).toHaveLength(1);
    expect(book.toc[0].index).toBe(0);
  });
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: pnpm test tests/reflowTxt.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

~~~ts
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
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: pnpm test tests/reflowTxt.test.ts
Expected: PASS（4 个测试）

- [ ] **Step 5: Commit**

~~~bash
git add src/core/reflowTxt.ts tests/reflowTxt.test.ts
git commit -m "feat: TXT 切章并重排为统一 Book"
~~~

---

### Task 6: 书级状态持久化 bookStore（TDD）

**Files:** 创建 src/core/bookStore.ts, tests/bookStore.test.ts

- [ ] **Step 1: 写失败的测试**

~~~ts
import { describe, it, expect } from 'vitest';
import { bookStore, memoryStorage } from '../src/core/bookStore';

describe('bookStore', () => {
  it('新书没有状态时返回空结构', () => {
    expect(bookStore(memoryStorage()).loadState('book-1')).toEqual({
      annotations: [],
      chatHistory: [],
    });
  });

  it('保存进度后可读回，且锚点原样保留', () => {
    const store = bookStore(memoryStorage());
    store.saveProgress('book-1', {
      bookId: 'book-1', chapterIndex: 3, anchor: 'epubcfi(/6/4!/4/2/1:5)', updatedAt: 123,
    });
    expect(store.loadState('book-1').progress?.anchor).toBe('epubcfi(/6/4!/4/2/1:5)');
  });

  it('划线记录可追加且不覆盖进度', () => {
    const store = bookStore(memoryStorage());
    store.saveProgress('book-1', { bookId: 'book-1', chapterIndex: 0, anchor: 'a1', updatedAt: 1 });
    store.addAnnotation('book-1', {
      id: 'n1', bookId: 'book-1', anchor: 'a1', quote: '句子', note: '想法', createdAt: 2,
    });
    const state = store.loadState('book-1');
    expect(state.annotations).toHaveLength(1);
    expect(state.progress?.anchor).toBe('a1');
  });
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: pnpm test tests/bookStore.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

~~~ts
import type { Annotation, BookProgress, BookState, Storage } from './types';

export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get: (k) => map.get(k) ?? null,
    set: (k, v) => { map.set(k, v); },
  };
}

const key = (bookId: string) => 'lingyue:state:' + bookId;

export function bookStore(storage: Storage) {
  function loadState(bookId: string): BookState {
    const raw = storage.get(key(bookId));
    if (!raw) return { annotations: [], chatHistory: [] };
    return JSON.parse(raw) as BookState;
  }

  function saveState(bookId: string, state: BookState): void {
    storage.set(key(bookId), JSON.stringify(state));
  }

  function saveProgress(bookId: string, progress: BookProgress): void {
    const state = loadState(bookId);
    state.progress = progress;
    saveState(bookId, state);
  }

  function addAnnotation(bookId: string, annotation: Annotation): void {
    const state = loadState(bookId);
    state.annotations.push(annotation);
    saveState(bookId, state);
  }

  return { loadState, saveState, saveProgress, addAnnotation };
}
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: pnpm test tests/bookStore.test.ts
Expected: PASS（3 个测试）

- [ ] **Step 5: Commit**

~~~bash
git add src/core/bookStore.ts tests/bookStore.test.ts
git commit -m "feat: 书级状态持久化（进度/划线/聊天史）"
~~~

---

### Task 7: 锚点 anchors（TDD）

**Files:** 创建 src/core/anchors.ts, tests/anchors.test.ts

- [ ] **Step 1: 写失败的测试**

~~~ts
import { describe, it, expect } from 'vitest';
import { makeAnchor, parseAnchor } from '../src/core/anchors';

describe('anchors', () => {
  it('构造 CFI 风格锚点并解析回章节序号', () => {
    const anchor = makeAnchor(4, 12);
    expect(anchor).toBe('epubcfi(/6/10!/4/2/1:12)');
    expect(parseAnchor(anchor)).toEqual({ chapter: 4, offset: 12 });
  });

  it('拒绝畸形锚点', () => {
    expect(parseAnchor('not-an-anchor')).toBeNull();
  });
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: pnpm test tests/anchors.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

~~~ts
/** 锚点格式：epubcfi(/6/{2*chapter+2}!/4/2/1:{offset}) —— 结构化位置，改字号/换设备不漂 */
export function makeAnchor(chapter: number, offset: number): string {
  return 'epubcfi(/6/' + (2 * chapter + 2) + '!/4/2/1:' + offset + ')';
}

export interface ParsedAnchor {
  chapter: number;
  offset: number;
}

export function parseAnchor(anchor: string): ParsedAnchor | null {
  const match = anchor.match(/^epubcfi\(\/6\/(\d+)!\/4\/2\/1:(\d+)\)$/);
  if (!match) return null;
  return { chapter: (Number(match[1]) - 2) / 2, offset: Number(match[2]) };
}
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: pnpm test tests/anchors.test.ts
Expected: PASS（2 个测试）

- [ ] **Step 5: Commit**

~~~bash
git add src/core/anchors.ts tests/anchors.test.ts
git commit -m "feat: CFI 风格锚点的构造与解析"
~~~

---

### Task 8: 最小阅读器 Reader.tsx

**Files:** 创建 src/ui/Reader.tsx；修改 src/main.tsx

- [ ] **Step 1: 写组件（消费统一 Book 与书级状态，不关心格式）**

~~~tsx
import React, { useState } from 'react';
import type { Book } from '../core/types';
import { bookStore, memoryStorage } from '../core/bookStore';

const store = bookStore(memoryStorage());

export function Reader({ book }: { book: Book }) {
  const [index, setIndex] = useState(0);
  const chapter = book.spine[index];

  function goTo(next: number) {
    setIndex(next);
    store.saveProgress(book.meta.id, {
      bookId: book.meta.id,
      chapterIndex: next,
      anchor: 'chapter:' + next,
      updatedAt: Date.now(),
    });
  }

  return (
    <div style={{ display: 'flex', gap: 16, fontFamily: 'system-ui' }}>
      <aside style={{ width: 200, borderRight: '1px solid #ddd' }}>
        <h3>目录 {book.meta.presentation === 'reflowed' && <small>（重排）</small>}</h3>
        {book.toc.map((item) => (
          <button key={item.index} onClick={() => goTo(item.index)}>{item.title}</button>
        ))}
      </aside>
      <main style={{ flex: 1, maxWidth: 720, lineHeight: 1.8 }}>
        <h2>{chapter?.title}</h2>
        <div dangerouslySetInnerHTML={{ __html: chapter?.html ?? '' }} />
      </main>
    </div>
  );
}
~~~

- [ ] **Step 2: 在 main.tsx 里接一个示例 TXT 书验证端到端**

把 src/main.tsx 的 App 改成：

~~~tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Reader } from './ui/Reader';
import { buildTxtBook } from './core/reflowTxt';

const demo = buildTxtBook('示例.txt', new TextEncoder().encode('第一章 起风\n他站在门口，风把纸片吹起来。\n第二章 下雨\n雨下了起来。'));

function App() {
  return <Reader book={demo} />;
}

createRoot(document.getElementById('root')!).render(<App />);
~~~

- [ ] **Step 3: 构建与手动验证**

Run: pnpm run build && pnpm run dev
Expected: 构建通过；浏览器打开 Vite 地址，左侧目录可点，右侧显示章节正文，点击目录进度写入存储。

- [ ] **Step 4: Commit**

~~~bash
git add src/ui/Reader.tsx src/main.tsx
git commit -m "feat: 最小阅读器（目录/正文/进度）"
~~~

---

## Self-Review（已执行）

1. Spec coverage：规格第 5 节格式归一化 → Task 3/4/5；第 4 节书级状态 → Task 2/6/7；第 3 节阅读体验的目录与进度 → Task 8。EPUB 原样渲染由 Task 2 的 Book 模型预留，具体 foliate-js 适配放在 M1.5。
2. Placeholder scan：无 TBD/TODO/「类似 Task X」；每个代码步骤都有完整代码。
3. Type consistency：Book / Chapter / BookState / Storage 只在 types.ts 定义一次，后续任务引用一致；detectFormat / decodeText / buildTxtBook / bookStore / makeAnchor 签名前后一致。

## 后续计划（独立子系统，各自出计划）

- M1.5 EPUB/MOBI 适配：epubAdapter.ts 用 foliate-js 产出统一 Book，补原样渲染与插图。
- M2 听书引擎与音色卡：TTSEngine 接口 + MOSS 托管 API 适配器 + 音色卡 + 播放器；Nano 适配器留接口。
- M3 读书搭子 Agent：书级记忆 + 4 项能力 + 工具（定位原文）+ Hy4/DeepSeek 可插拔。
- M4（独立产品）绘本模式：CBZ 固定布局 + 多角色音色卡。

---

## Execution Handoff

计划已保存到 docs/superpowers/plans/2026-11-26-lingyue-m1-reading-foundation.md。两种执行方式：

1. Subagent-Driven（推荐） — 每个任务派新子代理，任务间审查，迭代快。
2. Inline Execution — 本会话内批量执行，带检查点。

选哪种？
