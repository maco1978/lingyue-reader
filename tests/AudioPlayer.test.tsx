import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AudioPlayer } from '../src/ui/AudioPlayer';

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
});
