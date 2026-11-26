import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Library } from '../src/ui/Library';
import type { LibraryEntry } from '../src/core/library';

const entry: LibraryEntry = {
  id: 'a',
  fileName: 'a.epub',
  meta: { id: 'a', title: '测试书', author: '作者甲', format: 'epub', presentation: 'original' },
  size: 2048,
  chapterCount: 10,
  addedAt: 1,
  lastOpenedAt: 2,
};

const noop = () => {};

describe('Library 书架', () => {
  it('空书架展示导入引导', () => {
    const html = renderToStaticMarkup(
      <Library entries={[]} progressOf={() => undefined} onOpen={noop} onRemove={noop} onImport={noop} />
    );
    expect(html).toContain('导入一本电子书开始阅读');
    expect(html).toContain('type="file"');
    expect(html).toContain('刷新或离线也能继续读');
    // 文件框不能 display:none，否则键盘用户无法导入
    expect(html).toContain('lingyue-sr-only');
    expect(html).not.toContain('display:none');
  });

  it('列出书名、作者、格式、章数与阅读进度', () => {
    const html = renderToStaticMarkup(
      <Library
        entries={[entry]}
        progressOf={() => 2}
        currentId="a"
        onOpen={noop}
        onRemove={noop}
        onImport={noop}
      />
    );
    expect(html).toContain('测试书');
    expect(html).toContain('作者甲');
    expect(html).toContain('EPUB');
    expect(html).toContain('共 10 章');
    expect(html).toContain('读到第 3 章');
    expect(html).toContain('正在读');
  });

  it('操作按钮带书名，便于屏幕阅读器区分', () => {
    const html = renderToStaticMarkup(
      <Library entries={[entry]} progressOf={() => undefined} onOpen={noop} onRemove={noop} onImport={noop} />
    );
    expect(html).toContain('aria-label="打开《测试书》"');
    expect(html).toContain('aria-label="从书架删除《测试书》"');
  });

  it('正在打开的书显示占位而不是重复可点击', () => {
    const html = renderToStaticMarkup(
      <Library
        entries={[entry]}
        progressOf={() => undefined}
        busyId="a"
        onOpen={noop}
        onRemove={noop}
        onImport={noop}
      />
    );
    expect(html).toContain('打开中…');
    expect(html).toContain('disabled');
  });
});
