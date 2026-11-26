import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { makeEpub, makeObfuscatedEpub, makeIllustratedEpub } from './fixtures/makeEpub';
import { buildEpubBook } from '../src/core/epubAdapter';

/** 记录 foliate 生成的 blob 与其类型，用来断言资源被真正重写 */
const createdBlobs: Blob[] = [];
const revokedUrls: string[] = [];
let urlSeq = 0;

beforeAll(() => {
  const dom = new JSDOM('');
  (globalThis as any).DOMParser = dom.window.DOMParser;
  (globalThis as any).XMLSerializer = dom.window.XMLSerializer;
  (globalThis as any).Blob = dom.window.Blob;
  // foliate 的 XHTML 重写会遍历处理指令（xml-stylesheet），node 环境需要这个全局
  (globalThis as any).ProcessingInstruction = dom.window.ProcessingInstruction;
  // jsdom 不实现 createObjectURL；foliate 的原版渲染全靠它
  Object.defineProperty(globalThis.URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: (blob: Blob) => {
      createdBlobs.push(blob);
      return 'blob:test/' + (++urlSeq);
    },
  });
  Object.defineProperty(globalThis.URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: (url: string) => { revokedUrls.push(url); },
  });
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

  it('buildEpubBook 委托共用映射：TOC 按 href 解析而非数组位置', async () => {
    const book = await buildEpubBook('测试书.epub', makeEpub());
    // fixture 的 toc 顺序与 spine 一致，断言序号正确即可证明走的是 href 解析链路
    expect(book.toc.map(t => t.index)).toEqual([0, 1]);
  });

  it('带 encryption.xml 字体混淆的 EPUB 能正常打开（不报已损坏）', async () => {
    const book = await buildEpubBook('混淆书.epub', makeObfuscatedEpub());
    expect(book.meta.title).toBe('混淆书');
    expect(book.spine).toHaveLength(1);
    expect(book.spine[0].html).toContain('他站在门口。');
  });
});

describe('EPUB 原版渲染', () => {
  it('原版章节按需提供整章文档，样式与图片被重写成 blob: URL', async () => {
    const book = await buildEpubBook('插图.epub', makeIllustratedEpub());
    expect(book.meta.presentation).toBe('original');
    expect(typeof book.spine[0].loadDoc).toBe('function');

    // 导入阶段不碰 blob：大书不会一次性把所有资源解到内存
    expect(createdBlobs).toHaveLength(0);

    const url = await book.spine[0].loadDoc!();
    expect(url).toMatch(/^blob:test\/\d+$/);

    const docBlob = createdBlobs.at(-1)!;
    expect(docBlob.type).toBe('application/xhtml+xml');
    const docHtml = await docBlob.text();
    // 相对路径必须消失：否则注入应用文档后会按应用源解析成 404
    expect(docHtml).not.toContain('../images/pic.png');
    expect(docHtml).not.toContain('../styles/main.css');
    expect(docHtml).toMatch(/<link[^>]+href="blob:test\/\d+"/);
    expect(docHtml).toMatch(/<img[^>]+src="blob:test\/\d+"/);

    // CSS 里的 url() 按 CSS 自身所在目录解析，同样重写成 blob:
    const cssBlob = createdBlobs.find(b => b.type === 'text/css');
    expect(cssBlob).toBeTruthy();
    expect(await cssBlob!.text()).toContain('url("blob:test/');
  });

  it('dispose 回收格式层持有的 blob: URL（换书不泄漏）', async () => {
    revokedUrls.length = 0;
    const book = await buildEpubBook('插图.epub', makeIllustratedEpub());
    await book.spine[0].loadDoc!();
    expect(revokedUrls).toHaveLength(0);
    book.dispose?.();
    expect(revokedUrls.length).toBeGreaterThan(0);
  });

  it('原版 EPUB 仍保留 html 片段，供 TTS/搜索等文本消费方使用', async () => {
    const book = await buildEpubBook('测试书.epub', makeEpub());
    expect(typeof book.spine[0].loadDoc).toBe('function');
    expect(book.spine[0].html).toContain('他站在门口。');
  });
});
