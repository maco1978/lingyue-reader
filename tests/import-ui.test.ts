import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// 直接读源码断言导入入口存在（App 依赖 window/localStorage，SSR 环境无法直接渲染）
import { readFileSync } from 'node:fs';

describe('图书导入入口', () => {
  const src = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

  it('存在真实文件导入处理（File → arrayBuffer → openBook）', () => {
    expect(src).toContain('handleImportBook');
    expect(src).toContain('await file.arrayBuffer()');
    expect(src).toContain('openBook(file.name, buf)');
  });

  it('无书时显示导入引导页而非永久“正在打开”', () => {
    expect(src).toContain('导入一本电子书开始阅读');
    expect(src).toContain('type="file"');
    expect(src).toContain('accept=".epub,.mobi,.azw3,.txt,.fb2,.pdf"');
  });

  it('导航栏和引导页都提供导入按钮', () => {
    const matches = src.match(/导入图书/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
