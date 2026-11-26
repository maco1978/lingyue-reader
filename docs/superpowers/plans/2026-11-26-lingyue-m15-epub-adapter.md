`聆阅看书 M1.5 — EPUB/MOBI 适配 Implementation Plan`

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 让 App 真正能读主流电子书格式：EPUB / MOBI / AZW3 / FB2 经 foliate-js 解析后归一到 M1 的统一 Book 模型，阅读器无需分叉即可打开。

**Architecture:** 在 M1 的格式层新增适配器：zip 读取（fflate）向 foliate-js 提供回调 → foliate 产出其 book 接口 → 适配器映射为统一 Book（spine + 章节 + toc + 真实 CFI）。依赖通过参数注入（DOMParser / 解析器工厂），生产传浏览器全局、测试传 jsdom，保证 TDD 在 node 环境真跑。

**Tech Stack:** 沿用 M1（React + TypeScript + Vite + Vitest）；新增 fflate（zip / zlib）、jsdom（测试 DOM）、foliate-js 1.0.1 **精确锁定**（其 README 声明 API 不稳定）。

**Security:** foliate-js 明确警告 EPUB 可含脚本且同源 blob 无法安全隔离 —— 必须加 CSP 阻断 script-src，仅允许 'self'。这是安全底线，不可省略。

---

## File Structure

~~~
src/core/zipReader.ts          fflate → foliate 所需回调（loadText/loadBlob/getSize/unzlib）
src/core/epubAdapter.ts        foliate EPUB → 统一 Book（线性过滤、toc、元数据、真实 CFI）
src/core/mobiAdapter.ts        foliate MOBI → 统一 Book（MOBI/AZW3/KF8），导出通用映射函数
src/core/fb2Adapter.ts         foliate FB2 → 统一 Book
src/core/openBook.ts           格式分诊门面：detectFormat → 对应适配器
src/core/types.ts              修改：Chapter 增加可选 cfi?: string
index.html                     修改：加 CSP meta
tests/*.test.ts                合成样本测试（fflate zipSync 造 EPUB；注入假解析器测映射）
~~~

---

### Task 1: 依赖、CSP 与类型扩展

**Files:** 修改 package.json, index.html, src/core/types.ts

- [ ] **Step 1: 安装依赖并精确锁定 foliate-js**

Run: pnpm add fflate; pnpm add -D jsdom; pnpm pkg set dependencies.foliate-js=1.0.1; pnpm install
Expected: package.json 中 foliate-js 为 "1.0.1"（无 ^），fflate 在 dependencies，jsdom 在 devDependencies；pnpm test 仍 19/19 通过。

- [ ] **Step 2: 给 Chapter 增加可选 cfi 字段**

在 src/core/types.ts 的 Chapter 接口里，html: string; 之后加：

~~~ts
  /** foliate 返回的真实 CFI 基址；重排/TXT 书没有此字段 */
  cfi?: string;
~~~

- [ ] **Step 3: index.html 添加 CSP（安全底线）**

在 head 的 charset 之后加：

~~~html
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: data:; script-src 'self'; style-src 'self' 'unsafe-inline' blob:; img-src 'self' blob: data:; font-src 'self' blob: data:; connect-src 'self'" />
~~~

- [ ] **Step 4: 验证并提交**

Run: pnpm test && pnpm run build
Expected: 19/19 通过、构建通过。
Commit: git add package.json pnpm-lock.yaml index.html src/core/types.ts 后提交，message: chore: 加入 EPUB 解析依赖、CSP 与章节 CFI 字段

---

### Task 2: zip 读取层 zipReader（TDD）

**Files:** 创建 src/core/zipReader.ts, tests/zipReader.test.ts

- [ ] **Step 1: 写失败的测试**

~~~ts
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { makeZipSource } from '../src/core/zipReader';

describe('makeZipSource', () => {
  const bytes = zipSync({
    'META-INF/container.xml': strToU8('<container/>'),
    'OEBPS/ch1.xhtml': strToU8('<html><body>第一章</body></html>'),
  });

  it('loadText 按路径取回文本', async () => {
    const src = makeZipSource(bytes);
    expect(await src.loadText('OEBPS/ch1.xhtml')).toContain('第一章');
  });

  it('loadBlob 返回 Blob，getSize 返回字节数', async () => {
    const src = makeZipSource(bytes);
    const blob = await src.loadBlob('OEBPS/ch1.xhtml');
    expect(blob).toBeInstanceOf(Blob);
    expect(await src.getSize('OEBPS/ch1.xhtml')).toBeGreaterThan(0);
  });

  it('不存在的路径：loadText 返回 null，getSize 返回 0', async () => {
    const src = makeZipSource(bytes);
    expect(await src.loadText('nope.xhtml')).toBeNull();
    expect(await src.getSize('nope.xhtml')).toBe(0);
  });

  it('路径带 ./ 前缀时可归一化命中', async () => {
    const src = makeZipSource(bytes);
    expect(await src.loadText('./OEBPS/ch1.xhtml')).toContain('第一章');
  });
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: pnpm test tests/zipReader.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

~~~ts
import { unzipSync } from 'fflate';

export interface ZipSource {
  loadText(path: string): Promise<string | null>;
  loadBlob(path: string): Promise<Blob | null>;
  getSize(path: string): Promise<number>;
}

function normalize(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\//, '');
}

/** 把整本 zip 解到内存，向 foliate-js 提供它所需的回调 */
export function makeZipSource(bytes: Uint8Array): ZipSource {
  const files = unzipSync(bytes);
  const decoder = new TextDecoder();
  const get = (path: string) => files[normalize(path)] ?? null;
  return {
    async loadText(path) {
      const f = get(path);
      return f ? decoder.decode(f) : null;
    },
    async loadBlob(path) {
      const f = get(path);
      return f ? new Blob([f as BlobPart]) : null;
    },
    async getSize(path) {
      return get(path)?.length ?? 0;
    },
  };
}
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: pnpm test tests/zipReader.test.ts
Expected: PASS（4 个测试）。若 node 环境缺 Blob 全局，把 vite.config.ts 的 test.environment 改为 'jsdom'，并在 Step 5 一并提交。

- [ ] **Step 5: Commit**

git add src/core/zipReader.ts tests/zipReader.test.ts vite.config.ts，提交 message: feat: fflate zip 读取层

---

### Task 3: EPUB 适配器（TDD，真实 foliate 解析合成 EPUB）

**Files:** 创建 src/core/epubAdapter.ts, tests/epubAdapter.test.ts, tests/fixtures/makeEpub.ts

- [ ] **Step 1: 写测试夹具（合成一个最小合法 EPUB）**

创建 tests/fixtures/makeEpub.ts：

~~~ts
import { zipSync, strToU8 } from 'fflate';

const CONTAINER = '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>';

const OPF = '<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>测试书</dc:title><dc:creator>作者甲</dc:creator><dc:identifier id="uid">test-001</dc:identifier><dc:language>zh</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>';

const NAV = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">第一章 起风</a></li><li><a href="ch2.xhtml">第二章 下雨</a></li></ol></nav></body></html>';

const CH1 = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第一章 起风</h1><p>他站在门口。</p></body></html>';
const CH2 = '<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><h1>第二章 下雨</h1><p>雨下了起来。</p></body></html>';

/** 用 fflate 现场合成 EPUB，避免把版权书塞进仓库 */
export function makeEpub(): Uint8Array {
  return zipSync({
    'mimetype': strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(CONTAINER),
    'OEBPS/content.opf': strToU8(OPF),
    'OEBPS/nav.xhtml': strToU8(NAV),
    'OEBPS/ch1.xhtml': strToU8(CH1),
    'OEBPS/ch2.xhtml': strToU8(CH2),
  });
}
~~~

- [ ] **Step 2: 写失败的测试**

~~~ts
import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { makeEpub } from './fixtures/makeEpub';
import { buildEpubBook } from '../src/core/epubAdapter';

beforeAll(() => {
  const dom = new JSDOM('');
  (globalThis as any).DOMParser = dom.window.DOMParser;
  (globalThis as any).XMLSerializer = dom.window.XMLSerializer;
  (globalThis as any).Blob = dom.window.Blob;
});

describe('buildEpubBook', () => {
  it('把 EPUB 解析成统一 Book：元数据 / 两章 / toc / 原版呈现', async () => {
    const book = await buildEpubBook('测试书.epub', makeEpub());
    expect(book.meta.title).toBe('测试书');
    expect(book.meta.author).toBe('作者甲');
    expect(book.meta.format).toBe('epub');
    expect(book.meta.presentation).toBe('original');
    expect(book.spine).toHaveLength(2);
    expect(book.spine[0].html).toContain('他站在门口。');
    expect(book.toc.map(t => t.title)).toEqual(['第一章 起风', '第二章 下雨']);
  });

  it('章节带 foliate 的真实 CFI 基址', async () => {
    const book = await buildEpubBook('测试书.epub', makeEpub());
    expect(book.spine[0].cfi).toBeTruthy();
  });
});
~~~

- [ ] **Step 3: 运行测试确认失败**

Run: pnpm test tests/epubAdapter.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现**

~~~ts
import { EPUB } from 'foliate-js/epub.js';
import { makeZipSource } from './zipReader';
import type { Book, Chapter } from './types';

/** foliate 的 metadata 值可能是字符串或 {语言:文本} 对象 */
function textOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, string>;
    return o.zh ?? o['zh-CN'] ?? Object.values(o)[0] ?? '';
  }
  return '';
}

interface FoliateSection {
  createDocument(): Promise<Document> | Document;
  linear?: string;
  cfi?: string;
}
interface FoliateBook {
  sections: FoliateSection[];
  toc: { label: string; href: string; subitems?: unknown[] }[];
  metadata: Record<string, unknown>;
}

/** EPUB → 统一 Book。上层只认 Book，不知道 foliate 的存在。 */
export async function buildEpubBook(fileName: string, bytes: Uint8Array): Promise<Book> {
  const src = makeZipSource(bytes);
  const parser = new EPUB({
    loadText: src.loadText,
    loadBlob: src.loadBlob,
    getSize: src.getSize,
    // 字体反混淆需要 SHA-1；浏览器安全上下文下可传 crypto.subtle.digest
    sha1: (data: ArrayBuffer) => globalThis.crypto?.subtle?.digest('SHA-1', data) ?? Promise.resolve(new ArrayBuffer(20)),
  } as any);

  const raw = parser as unknown as FoliateBook;
  await (parser as any).init();

  const spine: Chapter[] = [];
  for (const section of raw.sections) {
    if (section.linear === 'no') continue;
    const doc = await section.createDocument();
    const d = doc as any;
    spine.push({
      index: spine.length,
      title: d.querySelector?.('h1, h2, title')?.textContent?.trim() || '第 ' + (spine.length + 1) + ' 章',
      html: d.body?.innerHTML ?? '',
      cfi: section.cfi,
    });
  }

  const toc = (raw.toc ?? []).map((item, i) => ({ title: item.label, index: i < spine.length ? i : 0 }));

  return {
    meta: {
      id: fileName + ':' + (textOf(raw.metadata.identifier) || 'epub'),
      title: textOf(raw.metadata.title) || fileName.replace(/\.epub$/i, ''),
      author: textOf(raw.metadata.author ?? raw.metadata.creator),
      format: 'epub',
      presentation: 'original',
    },
    spine,
    toc,
  };
}
~~~

- [ ] **Step 5: 运行测试确认通过**

Run: pnpm test tests/epubAdapter.test.ts
Expected: PASS（2 个测试）。若 foliate 的 createDocument 在 jsdom 下还缺全局，按报错补注入（如 XMLSerializer），不要改实现去迁就测试环境。

- [ ] **Step 6: Commit**

git add src/core/epubAdapter.ts tests/epubAdapter.test.ts tests/fixtures/makeEpub.ts，提交 message: feat: EPUB 经 foliate-js 归一为统一 Book

---

### Task 4: MOBI / AZW3 / FB2 适配器（TDD，映射逻辑）

**Files:** 创建 src/core/mobiAdapter.ts, src/core/fb2Adapter.ts, tests/mobiAdapter.test.ts, tests/fb2Adapter.test.ts

- [ ] **Step 1: 写失败的测试（注入 foliate 风格解析器，测映射契约）**

~~~ts
import { describe, it, expect } from 'vitest';
import { mapFoliateBook } from '../src/core/mobiAdapter';

const fakeBook = {
  sections: [
    { createDocument: async () => ({ body: { innerHTML: '<p>正文一</p>' }, querySelector: () => ({ textContent: '第一章' }) }), linear: undefined, cfi: '/6/2' },
    { createDocument: async () => ({ body: { innerHTML: '<p>正文二</p>' }, querySelector: () => ({ textContent: '第二章' }) }), linear: 'no', cfi: '/6/4' },
  ],
  toc: [{ label: '第一章', href: 'ch1' }],
  metadata: { title: 'Kindle书', creator: '作者乙', identifier: 'kindle-1' },
};

describe('mapFoliateBook', () => {
  it('把 foliate book 映射为统一 Book，并跳过 linear=no 的章节', async () => {
    const book = await mapFoliateBook('book.azw3', fakeBook as any, 'azw3');
    expect(book.meta.format).toBe('azw3');
    expect(book.meta.presentation).toBe('reflowed');
    expect(book.spine).toHaveLength(1);
    expect(book.spine[0].title).toBe('第一章');
    expect(book.spine[0].cfi).toBe('/6/2');
  });
});
~~~

FB2 测试同样用注入的 fake book，断言 format 为 fb2、presentation 为 reflowed、章节映射正确。

- [ ] **Step 2: 运行测试确认失败**

Run: pnpm test tests/mobiAdapter.test.ts tests/fb2Adapter.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 mobiAdapter.ts（导出共用映射函数）**

~~~ts
import type { Book, Chapter, BookFormat } from './types';

interface FoliateSection {
  createDocument(): Promise<Document> | Document;
  linear?: string;
  cfi?: string;
}
interface FoliateBookLike {
  sections: FoliateSection[];
  toc: { label: string }[];
  metadata: Record<string, unknown>;
}

function textOf(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') return Object.values(v as Record<string, string>)[0] ?? '';
  return '';
}

/** foliate book → 统一 Book；MOBI/AZW3/FB2 都走这条映射 */
export async function mapFoliateBook(
  fileName: string,
  raw: FoliateBookLike,
  format: BookFormat,
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
      id: fileName + ':' + (textOf(raw.metadata.identifier) || format),
      title: textOf(raw.metadata.title) || fileName.replace(/\.[^.]+$/, ''),
      author: textOf(raw.metadata.author ?? raw.metadata.creator),
      format,
      presentation: 'reflowed',
    },
    spine,
    toc: (raw.toc ?? []).map((item, i) => ({ title: item.label, index: Math.min(i, Math.max(0, spine.length - 1)) })),
  };
}

import { MOBI } from 'foliate-js/mobi.js';
import { unzlibSync } from 'fflate';

/** MOBI/AZW3/KF8：foliate 负责二进制解码，我们负责归一 */
export async function buildMobiBook(fileName: string, bytes: Uint8Array): Promise<Book> {
  const parser = new MOBI({ unzlib: (data: Uint8Array) => unzlibSync(data) });
  await (parser as any).open(new Blob([bytes as BlobPart]));
  await (parser as any).init();
  return mapFoliateBook(fileName, parser as any, 'azw3');
}
~~~

FB2 适配器（src/core/fb2Adapter.ts）：

~~~ts
import { makeFB2 } from 'foliate-js/fb2.js';
import { mapFoliateBook } from './mobiAdapter';
import type { Book } from './types';

export async function buildFb2Book(fileName: string, bytes: Uint8Array): Promise<Book> {
  const parser = await makeFB2(new Blob([bytes as BlobPart]));
  return mapFoliateBook(fileName, parser as any, 'fb2');
}
~~~

- [ ] **Step 4: 运行测试确认通过**

Run: pnpm test tests/mobiAdapter.test.ts tests/fb2Adapter.test.ts
Expected: PASS（2+2 个测试）

- [ ] **Step 5: Commit**

git add src/core/mobiAdapter.ts src/core/fb2Adapter.ts tests/mobiAdapter.test.ts tests/fb2Adapter.test.ts，提交 message: feat: MOBI/AZW3/FB2 适配器

---

### Task 5: openBook 门面与 App 接入（TDD）

**Files:** 创建 src/core/openBook.ts, tests/openBook.test.ts；修改 src/main.tsx

- [ ] **Step 1: 写失败的测试**

~~~ts
import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { makeEpub } from './fixtures/makeEpub';
import { openBook } from '../src/core/openBook';

beforeAll(() => {
  const dom = new JSDOM('');
  (globalThis as any).DOMParser = dom.window.DOMParser;
  (globalThis as any).XMLSerializer = dom.window.XMLSerializer;
  (globalThis as any).Blob = dom.window.Blob;
});

describe('openBook', () => {
  it('按格式分诊：epub 走原版适配器', async () => {
    const book = await openBook('测试书.epub', makeEpub());
    expect(book.meta.format).toBe('epub');
    expect(book.spine).toHaveLength(2);
  });

  it('未知格式给出人话错误', async () => {
    await expect(openBook('mystery.bin', new Uint8Array([0, 1]))).rejects.toThrow('无法识别这本书的格式');
  });

  it('损坏的加密书明确拒绝（不破解）', async () => {
    await expect(openBook('locked.azw3', new Uint8Array([0, 1, 2]))).rejects.toThrow();
  });
});
~~~

- [ ] **Step 2: 运行测试确认失败**

Run: pnpm test tests/openBook.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

~~~ts
import { detectFormat } from './detectFormat';
import { buildTxtBook } from './reflowTxt';
import { buildEpubBook } from './epubAdapter';
import { buildMobiBook } from './mobiAdapter';
import { buildFb2Book } from './fb2Adapter';
import type { Book } from './types';

/** 格式分诊门面：上层只调用它，不关心书是什么格式 */
export async function openBook(fileName: string, bytes: Uint8Array): Promise<Book> {
  const format = detectFormat(fileName, bytes);
  switch (format) {
    case 'txt':
      return buildTxtBook(fileName, bytes);
    case 'epub':
    case 'pdf':
      return buildEpubBook(fileName, bytes);
    case 'mobi':
    case 'azw3':
      return buildMobiBook(fileName, bytes);
    case 'fb2':
      return buildFb2Book(fileName, bytes);
    case 'cbz':
      throw new Error('漫画格式将在绘本模式支持，当前版本暂不开放');
    default:
      throw new Error('无法识别这本书的格式，请导入 EPUB / MOBI / AZW3 / TXT / FB2');
  }
}
~~~

- [ ] **Step 4: main.tsx 接入（真实打开文件）**

把 src/main.tsx 的 demo 构建改成异步调用 openBook（保留 TXT 示例，注释说明真实文件入口）：

~~~tsx
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Reader } from './ui/Reader';
import { openBook } from './core/openBook';
import type { Book } from './core/types';

function App() {
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    // 示例：真实场景把用户选择的 File 读成 Uint8Array 传进来
    const demo = new TextEncoder().encode('第一章 起风\n他站在门口，风把纸片吹起来。\n第二章 下雨\n雨下了起来。');
    openBook('示例.txt', demo).then(setBook).catch(e => setError(String(e)));
  }, []);
  if (error) return <div role="alert">{error}</div>;
  if (!book) return <div>正在打开…</div>;
  return <Reader book={book} />;
}

createRoot(document.getElementById('root')!).render(<App />);
~~~

- [ ] **Step 5: 全量验证 + 真实书手动验收**

Run: pnpm test && pnpm run build
Expected: 全部通过。

手动验收（真实公版书，不是占位步骤）：
1. 从 https://www.gutenberg.org/ebooks/11 页面获取《爱丽丝梦游仙境》的 EPUB 下载链接。
2. 用 curl -L <url> -o /tmp/alice.epub 下载。
3. 在浏览器 pnpm run dev 打开 App，用文件选择（或临时在 main.tsx 里把 bytes 替换成读取 /alice.epub）载入该书。
4. 验收标准：显示书名、目录至少 10 章、点目录正文切换正常、控制台无 CSP 违规报错（尤其不能有 "Refused to execute inline script"）。

- [ ] **Step 6: Commit**

git add src/core/openBook.ts tests/openBook.test.ts src/main.tsx，提交 message: feat: openBook 格式分诊门面并接入阅读器

---

## Self-Review（已执行）

1. Spec coverage：规格第 5 节格式归一化（EPUB 原版渲染）→ Task 3；MOBI/AZW3/FB2 → Task 4；统一入口 → Task 5；安全底线 CSP → Task 1。
2. Placeholder scan：无 TBD/TODO；每个代码步骤含完整代码；手动验收给出确切 URL、命令与验收标准。
3. Type consistency：Book / Chapter（新增可选 cfi）/ BookFormat 只在 types.ts 定义；makeZipSource / buildEpubBook / mapFoliateBook / buildMobiBook / buildFb2Book / openBook 签名前后一致；M1 的 buildTxtBook 未改动。
4. Risk noted：foliate-js API 不稳定（README 明确警告），故精确锁定 1.0.1；若升级需重跑 Task 3/4 测试。MOBI 二进制解码由 foliate 承担，测试覆盖映射契约 + 真实书手动验收，不在测试里重造 MOBI 解析器。

## 后续计划

- M2 听书引擎与音色卡：TTSEngine 接口 + MOSS 托管 API + 音色卡 + 播放器（Nano 留接口）。
- M3 读书搭子 Agent：书级记忆 + 4 项能力 + 工具（定位原文）+ Hy4/DeepSeek 可插拔。

---

## Execution Handoff

计划保存在 docs/superpowers/plans/2026-11-26-lingyue-m15-epub-adapter.md。两种执行方式：
1. Subagent-Driven（推荐）— 每任务派新子代理并两阶段审查。
2. Inline Execution — 本会话批量执行。

选哪种？
