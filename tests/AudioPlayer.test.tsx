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

  it('有音色时下拉框与标签关联，状态区域可被播报', () => {
    const html = renderToStaticMarkup(
      <AudioPlayer
        book={{ meta: { id: 'b1', title: '测试书', author: '', format: 'txt', presentation: 'reflowed' }, spine: [{ index: 0, title: '第一章', html: '正文' }], toc: [] }}
        engine={{ createVoice: vi.fn(), synthesize: vi.fn() }}
        cards={[{ id: 'v1', name: '旁白', voiceId: 'voice-1', rate: 1, reference: 'upload' }]}
        onPosition={vi.fn()}
      />
    );
    expect(html).toContain('for="lingyue-voice-select"');
    expect(html).toContain('id="lingyue-voice-select"');
    expect(html).toContain('role="status"');
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
    // aria-current 应落在第二章按钮上（播放器标题区也会出现章节名，所以按按钮边界定位）
    expect(html).toContain('aria-current="true"');
    const currentPos = html.indexOf('aria-current="true"');
    const buttonStart = html.lastIndexOf('<button', currentPos);
    const buttonEnd = html.indexOf('</button>', currentPos);
    const currentButton = html.slice(buttonStart, buttonEnd);
    expect(currentButton).toContain('第二章');
    expect(currentButton).not.toContain('第一章');
  });
});
