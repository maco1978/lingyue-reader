import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Reader } from '../src/ui/Reader';
import { bookStore, memoryStorage } from '../src/core/bookStore';
import type { Storage } from '../src/core/types';

/** 记录写入的假 Storage（内存实现），用于断言 Reader 的书级状态注入路径 */
function recordingStorage(): Storage & { writes: string[] } {
  const writes: string[] = [];
  const map = new Map<string, string>();
  return {
    writes,
    get: k => map.get(k) ?? null,
    set: (k, v) => { writes.push(k + '=' + v); map.set(k, v); },
  };
}

describe('Reader storage 注入', () => {
  it('默认（不传 storage）不抛错，正常渲染目录', () => {
    const html = renderToStaticMarkup(
      <Reader book={{
        meta: { id: 'b1', title: '测试书', author: '', format: 'txt', presentation: 'reflowed' },
        spine: [{ index: 0, title: '第一章', html: '正文' }],
        toc: [{ title: '第一章', index: 0 }],
      }} />
    );
    expect(html).toContain('第一章');
  });

  it('注入的 storage 与 Reader 内部 bookStore 是同一个适配器契约（写入走注入实例）', () => {
    // 验证注入路径的类型与行为契约：bookStore(注入实例) 的写操作落在注入实例上。
    // SSR 无法触发按钮点击事件，这里直接验证「注入同一 storage 的两个 store 共享状态」，
    // 这正是 main.tsx 传 localStorageAdapter() 后 Reader 与搭子/听书共享书级状态的机制。
    const fake = recordingStorage();
    const writer = bookStore(fake);
    writer.saveProgress('b1', { bookId: 'b1', chapterIndex: 2, anchor: 'epubcfi(x)', updatedAt: 1 });
    const reader = bookStore(fake);
    expect(reader.loadState('b1').progress?.chapterIndex).toBe(2);
    expect(fake.writes.length).toBe(1);
    // Reader 接受 storage prop（类型层面由 tsconfig strict + build 验证）
    renderToStaticMarkup(
      <Reader
        storage={fake}
        book={{
          meta: { id: 'b1', title: '测试书', author: '', format: 'txt', presentation: 'reflowed' },
          spine: [{ index: 0, title: '第一章', html: '正文' }],
          toc: [],
        }}
      />
    );
    expect(fake.writes.length).toBe(1); // 渲染本身不写状态
  });

  it('memoryStorage 仍是默认注入实现', () => {
    const s = memoryStorage();
    s.set('k', 'v');
    expect(s.get('k')).toBe('v');
  });
});

describe('Reader 原版渲染', () => {
  it('原版章节交给 iframe（按需加载），不把书内 HTML 直接注入应用页', () => {
    const html = renderToStaticMarkup(
      <Reader book={{
        meta: { id: 'b1', title: '测试书', author: '', format: 'epub', presentation: 'original' },
        spine: [{ index: 0, title: '第一章', html: '<img src="../images/pic.png">', loadDoc: async () => 'blob:doc' }],
        toc: [{ title: '第一章', index: 0 }],
      }} />
    );
    expect(html).toContain('正在加载原版排版');
    expect(html).not.toContain('../images/pic.png');
  });

  it('没有 loadDoc 的章节仍走 html 片段', () => {
    const html = renderToStaticMarkup(
      <Reader book={{
        meta: { id: 'b2', title: '重排书', author: '', format: 'txt', presentation: 'reflowed' },
        spine: [{ index: 0, title: '第一章', html: '<p>正文</p>' }],
        toc: [],
      }} />
    );
    expect(html).toContain('<p>正文</p>');
  });
});

describe('Reader 键盘与无障碍', () => {
  const book = {
    meta: { id: 'b1', title: '测试书', author: '', format: 'txt' as const, presentation: 'reflowed' as const },
    spine: [
      { index: 0, title: '第一章', html: '<p>正文一</p>' },
      { index: 1, title: '第二章', html: '<p>正文二</p>' },
    ],
    toc: [{ title: '第一章', index: 0 }, { title: '第二章', index: 1 }],
  };

  it('提供跳到正文链接、目录地标与键盘翻章按钮', () => {
    const html = renderToStaticMarkup(<Reader book={book} initialChapter={1} />);
    expect(html).toContain('跳到正文');
    expect(html).toContain('href="#lingyue-read-content"');
    expect(html).toContain('id="lingyue-read-content"');
    expect(html).toContain('aria-label="目录"');
    expect(html).toContain('aria-keyshortcuts="Alt+ArrowLeft"');
    expect(html).toContain('aria-keyshortcuts="Alt+ArrowRight"');
    expect(html).toContain('上一章');
    expect(html).toContain('下一章');
  });

  it('当前章节在目录里用 aria-current 标出', () => {
    const html = renderToStaticMarkup(<Reader book={book} initialChapter={1} />);
    expect(html).toContain('aria-current="true"');
    const pos = html.indexOf('aria-current="true"');
    expect(html.slice(pos, pos + 200)).toContain('第二章');
  });

  it('章节标题变化通过 live region 播报', () => {
    const html = renderToStaticMarkup(<Reader book={book} initialChapter={1} />);
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('lingyue-sr-only');
  });
});

describe('Reader 边听边看', () => {
  const book = {
    meta: { id: 'b1', title: '测试书', author: '', format: 'txt' as const, presentation: 'reflowed' as const },
    spine: [{ index: 0, title: '第一章', html: '<p>正文</p>' }],
    toc: [{ title: '第一章', index: 0 }],
  };
  const engine = { createVoice: async () => 'v', synthesize: async () => new Blob(['x']) };
  const cards = [{ id: 'v1', name: '旁白', voiceId: 'voice-1', rate: 1, reference: 'upload' as const }];

  it('有听书引擎时显示底部听书栏', () => {
    const html = renderToStaticMarkup(
      <Reader book={book} engine={engine} cards={cards} onOpenPlayer={() => {}} />
    );
    expect(html).toContain('边听边看');
    expect(html).toContain('aria-label="打开播放器"');
    expect(html).toContain('data-listen="true"');
  });

  it('没有引擎时不显示听书栏', () => {
    const html = renderToStaticMarkup(<Reader book={book} />);
    expect(html).not.toContain('边听边看');
    expect(html).not.toContain('data-listen');
  });
});

describe('Reader 阅读设置与划线', () => {
  it('渲染字号设置与已有划线（含笔记）', () => {
    const storage = memoryStorage();
    const store = bookStore(storage);
    store.addAnnotation('b1', {
      id: 'n1', bookId: 'b1', anchor: 'epubcfi(/6/2!/4/2/1:0)', quote: '正文', note: '想法', createdAt: 1,
    });

    const html = renderToStaticMarkup(
      <Reader
        storage={storage}
        book={{
          meta: { id: 'b1', title: '测试书', author: '', format: 'txt', presentation: 'reflowed' },
          spine: [{ index: 0, title: '第一章', html: '<p>正文</p>' }],
          toc: [{ title: '第一章', index: 0 }],
        }}
      />
    );
    expect(html).toContain('字号');
    expect(html).toContain('A+');
    expect(html).toContain('划线（1）');
    expect(html).toContain('想法');
    expect(html).toContain('定位');
  });

  it('没有划线时给出操作提示', () => {
    const html = renderToStaticMarkup(
      <Reader book={{
        meta: { id: 'b2', title: '测试书', author: '', format: 'txt', presentation: 'reflowed' },
        spine: [{ index: 0, title: '第一章', html: '<p>正文</p>' }],
        toc: [],
      }} />
    );
    expect(html).toContain('划线（0）');
    expect(html).toContain('选中正文即可划线');
  });
});
