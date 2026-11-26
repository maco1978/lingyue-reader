import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AudioPlayer, playBlob } from '../src/ui/AudioPlayer';

describe('AudioPlayer', () => {
  it('渲染播放按钮与章节标题', () => {
    const html = renderToStaticMarkup(
      <AudioPlayer
        book={{ meta: { id: 'b1', title: '测试书', author: '', format: 'txt', presentation: 'reflowed' }, spine: [{ index: 0, title: '第一章', html: '正文' }], toc: [] }}
        engine={{ createVoice: vi.fn(), synthesize: vi.fn() }}
        cards={[]}
        onPosition={vi.fn()}
      />
    );
    expect(html).toContain('播放');
    expect(html).toContain('第一章');
  });

  it('stop（abort）时播放 promise 能 resolve，不悬挂', async () => {
    // 最小 Audio stub：pause 即可，不真正发声；重点验证 abort 路径
    class FakeAudio {
      src = '';
      onended: (() => void) | null = null;
      onerror: (() => void) | null = null;
      play() { return Promise.resolve(); }
      pause() { /* noop */ }
    }
    const origAudio = globalThis.Audio;
    const origURL = globalThis.URL;
    (globalThis as Record<string, unknown>).Audio = FakeAudio;
    (globalThis as Record<string, unknown>).URL = { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} };
    try {
      const controller = new AbortController();
      const promise = playBlob(new Blob(['x']), controller, () => {});
      controller.abort(); // 立即停止：promise 必须 resolve 而非永久挂起
      await expect(promise).resolves.toBeUndefined();
    } finally {
      (globalThis as Record<string, unknown>).Audio = origAudio;
      (globalThis as Record<string, unknown>).URL = origURL;
    }
  });

  it('initialChapter 用于初始化当前章节（断点续听）', () => {
    const book = {
      meta: { id: 'b1', title: '测试书', author: '', format: 'txt' as const, presentation: 'reflowed' as const },
      spine: [
        { index: 0, title: '第一章', html: '正文一' },
        { index: 1, title: '第二章', html: '正文二' },
      ],
      toc: [],
    };
    const html = renderToStaticMarkup(
      <AudioPlayer
        book={book}
        engine={{ createVoice: vi.fn(), synthesize: vi.fn() }}
        cards={[]}
        onPosition={vi.fn()}
        initialChapter={1}
      />
    );
    // aria-current 应落在第二章按钮的开标签上（其文本「第二章」紧随其后），而非默认的第 0 章
    expect(html).toContain('aria-current="true"');
    const currentPos = html.indexOf('aria-current="true"');
    const markPos = html.indexOf('第二章', currentPos);
    // aria-current 之后最近的一个「第二章」必须是该按钮自身的文本（同标签内），且第一章按钮不含 aria-current
    expect(markPos).toBeGreaterThan(-1);
    expect(html.slice(0, currentPos)).not.toContain('第二章');
    expect(html.slice(0, currentPos)).toContain('第一章');
    // aria-current 与「第二章」在同一个开标签内（中间不得出现闭合标签）
    expect(html.slice(currentPos, markPos)).not.toContain('</button>');
  });
});
