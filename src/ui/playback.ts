import type { Book } from '../core/types';
import type { TTSEngine } from '../core/tts/types';
import { chunkChapter } from '../core/tts/chunker';

export interface PlaybackHooks {
  /** 进入某一章：用来同步界面上的当前章节与断点续听位置 */
  onChapter(index: number): void;
  /** 开始合成某一段：用来记录暂停位置与章节进度 */
  onSegment?(chapterIndex: number, segmentIndex: number, segmentCount: number): void;
  /** 需要告知用户的状态（合成失败等） */
  onStatus(message: string): void;
  /** 播放一段音频；返回即表示播完或被停止 */
  play(blob: Blob): Promise<void>;
}

export interface PlaybackOptions {
  start: number;
  /** 从本章第几段开始（暂停续听）；默认 0 */
  startSegment?: number;
  voiceId: string;
  rate: number;
  signal: AbortSignal;
  /** 每章结束后询问是否继续；返回 false 就停在这里（「听完本章」定时） */
  stopAfterChapter?: () => boolean;
}

/**
 * 逐章逐段合成并连播。
 * 任一段合成失败即整本停止——之前失败后只 break 了内层循环，会跳到下一章继续播，
 * 用户听到的是「莫名其妙跳了一段」，很难理解。
 */
export async function playFromChapter(
  book: Book,
  engine: TTSEngine,
  options: PlaybackOptions,
  hooks: PlaybackHooks,
): Promise<void> {
  const { start, startSegment = 0, voiceId, rate, signal, stopAfterChapter } = options;

  for (let index = start; index < book.spine.length; index++) {
    if (signal.aborted) return;
    hooks.onChapter(index);

    const segments = chunkChapter(book.spine[index]?.html ?? '');
    const from = index === start ? Math.max(0, startSegment) : 0;

    for (let i = from; i < segments.length; i++) {
      if (signal.aborted) return;
      hooks.onSegment?.(index, i, segments.length);

      let blob: Blob;
      try {
        blob = await engine.synthesize({ text: segments[i], voiceId, rate, signal });
      } catch (e) {
        if (signal.aborted) return;
        hooks.onStatus('合成失败：' + (e instanceof Error ? e.message : String(e)));
        return;
      }

      if (signal.aborted) return;
      await hooks.play(blob);
    }

    if (stopAfterChapter?.()) return;
  }
}
