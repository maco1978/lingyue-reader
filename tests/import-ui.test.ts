import { describe, it, expect } from 'vitest';

// 直接读源码断言导入入口存在（App 依赖 window / IndexedDB，SSR 环境无法直接渲染）
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('图书导入入口', () => {
  const src = read('../src/main.tsx');
  const shelf = read('../src/ui/Library.tsx');

  it('存在真实文件导入处理（File → arrayBuffer → openBook）', () => {
    expect(src).toContain('handleImportBook');
    expect(src).toContain('await file.arrayBuffer()');
    expect(src).toContain('openBook(file.name, buf)');
  });

  it('无书时显示书架导入引导而非永久“正在打开”', () => {
    expect(shelf).toContain('导入一本电子书开始阅读');
    expect(shelf).toContain('type="file"');
  });

  it('文件选择器只列出真正支持的格式（PDF 尚未开放，不放进 accept）', () => {
    expect(src).toContain('accept=".epub,.mobi,.azw3,.txt,.fb2"');
    expect(shelf).toContain('accept=".epub,.mobi,.azw3,.txt,.fb2"');
    expect(src).not.toContain('.fb2,.pdf"');
    expect(shelf).not.toContain('.fb2,.pdf"');
  });

  it('导航栏和书架都提供导入按钮', () => {
    expect((src.match(/导入图书/g) || []).length).toBeGreaterThanOrEqual(1);
    expect((shelf.match(/导入图书/g) || []).length).toBeGreaterThanOrEqual(1);
  });

  it('导入后写入本地书库，启动时接着上次读的那本', () => {
    expect(src).toContain('lib.save(');
    expect(src).toContain('LAST_BOOK_KEY');
    expect(src).toContain('openById');
  });
});
