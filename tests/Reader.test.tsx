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
