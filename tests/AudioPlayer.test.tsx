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
});
