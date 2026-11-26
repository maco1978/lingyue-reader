import { describe, it, expect, vi, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { playFromChapter } from '../src/ui/playback';
import type { Book } from '../src/core/types';

beforeAll(() => {
  (globalThis as any).DOMParser = new JSDOM('').window.DOMParser;
});

// 1000 字，默认 800 上限 → 章一 2 段
const longChapter = '<p>' + '第一句。'.repeat(250) + '</p>';

const book: Book = {
  meta: { id: 'b', title: '书', author: '', format: 'txt', presentation: 'reflowed' },
  spine: [
    { index: 0, title: '一', html: longChapter },
    { index: 1, title: '二', html: '<p>第二章。</p>' },
  ],
  toc: [],
};

const engineOf = (synthesize: unknown) => ({ createVoice: vi.fn(), synthesize } as any);

function options(signal = new AbortController().signal) {
  return { start: 0, voiceId: 'v', rate: 1, signal };
}

describe('playFromChapter', () => {
  it('逐章逐段合成并播放，章节序号同步', async () => {
    const synth = vi.fn(async () => new Blob(['x']));
    const chapters: number[] = [];
    const played: number[] = [];
    await playFromChapter(book, engineOf(synth), options(), {
      onChapter: i => chapters.push(i),
      onStatus: () => {},
      play: async () => { played.push(1); },
    });
    expect(chapters).toEqual([0, 1]);
    expect(synth).toHaveBeenCalledTimes(3); // 章一 2 段 + 章二 1 段
    expect(played).toHaveLength(3);
  });

  it('某段合成失败即整本停止，不跳章继续', async () => {
    const synth = vi.fn()
      .mockResolvedValueOnce(new Blob(['x']))
      .mockRejectedValueOnce(new Error('语音合成超时（60 秒）'));
    const chapters: number[] = [];
    const statuses: string[] = [];
    await playFromChapter(book, engineOf(synth), options(), {
      onChapter: i => chapters.push(i),
      onStatus: s => statuses.push(s),
      play: async () => {},
    });
    expect(chapters).toEqual([0]);
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toContain('语音合成超时');
    expect(synth).toHaveBeenCalledTimes(2);
  });

  it('开始前已取消则不合成任何内容', async () => {
    const synth = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await playFromChapter(book, engineOf(synth), options(controller.signal), {
      onChapter: () => {}, onStatus: () => {}, play: async () => {},
    });
    expect(synth).not.toHaveBeenCalled();
  });

  it('播放中取消会停在当前段', async () => {
    const controller = new AbortController();
    const synth = vi.fn(async () => new Blob(['x']));
    await playFromChapter(book, engineOf(synth), options(controller.signal), {
      onChapter: () => {}, onStatus: () => {},
      play: async () => { controller.abort(); },
    });
    expect(synth).toHaveBeenCalledTimes(1);
  });

  it('暂停后续听：从指定段开始，不重复前面的段', async () => {
    const synth = vi.fn(async () => new Blob(['x']));
    const seen: number[] = [];
    await playFromChapter(book, engineOf(synth), { ...options(), startSegment: 1 }, {
      onChapter: () => {},
      onSegment: (_chapter, segment) => seen.push(segment),
      onStatus: () => {},
      play: async () => {},
    });
    // 章一从第 2 段开始（共 2 段），章二从头开始
    expect(seen).toEqual([1, 0]);
    expect(synth).toHaveBeenCalledTimes(2);
  });

  it('「听完本章」在章末停止，不进入下一章', async () => {
    const synth = vi.fn(async () => new Blob(['x']));
    const chapters: number[] = [];
    await playFromChapter(book, engineOf(synth), { ...options(), stopAfterChapter: () => true }, {
      onChapter: i => chapters.push(i),
      onStatus: () => {},
      play: async () => {},
    });
    expect(chapters).toEqual([0]);
    expect(synth).toHaveBeenCalledTimes(2);
  });
});
