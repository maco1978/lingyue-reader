import { useCallback, useEffect, useRef, useState } from 'react';
import type { Book } from '../core/types';
import type { TTSEngine, VoiceCard } from '../core/tts/types';
import { makeAnchor } from '../core/anchors';
import {
  loadPlayerSettings, normalizePlayerSettings, savePlayerSettings, type PlayerSettings,
} from '../core/playerSettings';
import { playFromChapter } from './playback';
import { playBlob } from './playBlob';

export type TimerChoice = 'none' | 'chapter' | number;

export interface PlaybackOptions {
  initialChapter?: number;
  /** 播放进入新章节（阅读页据此翻章、听书页据此更新位置） */
  onChapterChange?: (chapter: number) => void;
  /** 断点续听位置写回 */
  onPosition?: (pos: { chapterIndex: number; anchor: string }) => void;
}

export interface PlaybackProgress {
  chapter: number;
  segment: number;
  count: number;
}

/**
 * 听书播放状态机：完整播放器与阅读页的「边听边看」栏共用同一套逻辑。
 * 合成与播放分段进行，暂停会记住当前段，继续时从这一段开始。
 */
export function usePlayback(
  book: Book,
  engine: TTSEngine | null,
  cards: VoiceCard[],
  options: PlaybackOptions = {},
) {
  const { initialChapter = 0, onChapterChange, onPosition } = options;

  const [chapter, setChapter] = useState(initialChapter);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState<PlaybackProgress>({ chapter: initialChapter, segment: 0, count: 0 });
  const [settings, setSettings] = useState<PlayerSettings>(loadPlayerSettings);
  const [timer, setTimerState] = useState<TimerChoice>('none');

  const stopRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const positionRef = useRef<{ chapter: number; segment: number } | null>(null);
  const timerRef = useRef<TimerChoice>('none');
  const timerHandle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveVoice = cards.some(c => c.voiceId === settings.voiceId)
    ? settings.voiceId
    : cards[0]?.voiceId ?? '';

  // 语速与音色全局记忆（听书页与阅读页读同一份）
  useEffect(() => { savePlayerSettings(settings); }, [settings]);

  const pause = useCallback(() => {
    stopRef.current?.abort();
    stopRef.current = null;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlaying(false);
  }, []);

  const startPlayback = useCallback(async (chapterIndex: number, voice: string, startSegment: number) => {
    if (!engine) { setStatus('听书需要先在设置里填 MOSS API Key'); return; }
    if (!voice) { setStatus('请先在「音色管理」创建一个音色'); return; }

    pause();
    const controller = new AbortController();
    stopRef.current = controller;
    setPlaying(true);
    setStatus('');
    const cardRate = cards.find(c => c.voiceId === voice)?.rate ?? 1;

    await playFromChapter(
      book,
      engine,
      {
        start: chapterIndex,
        startSegment,
        voiceId: voice,
        rate: cardRate * settings.rate,
        signal: controller.signal,
        stopAfterChapter: () => timerRef.current === 'chapter',
      },
      {
        onChapter: ci => {
          setChapter(ci);
          onChapterChange?.(ci);
          onPosition?.({ chapterIndex: ci, anchor: makeAnchor(ci, 0) });
        },
        onSegment: (ci, si, count) => {
          positionRef.current = { chapter: ci, segment: si };
          setProgress({ chapter: ci, segment: si, count });
        },
        onStatus: setStatus,
        play: blob => playBlob(blob, controller, a => { audioRef.current = a; }),
      },
    );

    if (!controller.signal.aborted) {
      setPlaying(false);
      positionRef.current = null; // 自然播完：下次从当前章开头开始
      if (timerRef.current === 'chapter') {
        timerRef.current = 'none';
        setTimerState('none');
      }
    }
  }, [book, engine, cards, settings.rate, onChapterChange, onPosition, pause]);

  /** 从指定章节开头开始（阅读页「听书」按钮） */
  const playFrom = useCallback((chapterIndex: number) => {
    const target = Math.max(0, Math.min(chapterIndex, book.spine.length - 1));
    positionRef.current = { chapter: target, segment: 0 };
    setProgress({ chapter: target, segment: 0, count: 0 });
    setChapter(target);
    void startPlayback(target, effectiveVoice, 0);
  }, [book.spine.length, effectiveVoice, startPlayback]);

  /** 接着上次暂停的位置继续 */
  const play = useCallback(() => {
    const from = positionRef.current ?? { chapter, segment: 0 };
    void startPlayback(from.chapter, effectiveVoice, from.segment);
  }, [chapter, effectiveVoice, startPlayback]);

  const toggle = useCallback(() => {
    if (playing) pause();
    else play();
  }, [playing, pause, play]);

  const jumpTo = useCallback((target: number) => {
    const clamped = Math.max(0, Math.min(target, book.spine.length - 1));
    setChapter(clamped);
    positionRef.current = { chapter: clamped, segment: 0 };
    setProgress({ chapter: clamped, segment: 0, count: 0 });
    onChapterChange?.(clamped);
    onPosition?.({ chapterIndex: clamped, anchor: makeAnchor(clamped, 0) });
    if (playing) void startPlayback(clamped, effectiveVoice, 0);
    else pause();
  }, [book.spine.length, playing, effectiveVoice, startPlayback, onChapterChange, onPosition, pause]);

  const updateSettings = useCallback((patch: Partial<PlayerSettings>) => {
    setSettings(prev => normalizePlayerSettings({ ...prev, ...patch }));
  }, []);

  const applyTimer = useCallback((value: TimerChoice) => {
    if (timerHandle.current) { clearTimeout(timerHandle.current); timerHandle.current = null; }
    timerRef.current = value;
    setTimerState(value);
    if (typeof value === 'number') {
      timerHandle.current = setTimeout(() => {
        pause();
        timerRef.current = 'none';
        setTimerState('none');
        timerHandle.current = null;
      }, value * 60_000);
    }
  }, [pause]);

  // 卸载时中止在途合成与播放，避免组件销毁后音频继续出声
  useEffect(() => () => {
    stopRef.current?.abort();
    if (timerHandle.current) clearTimeout(timerHandle.current);
  }, []);

  return {
    chapter,
    playing,
    status,
    progress,
    settings,
    timer,
    effectiveVoice,
    play,
    playFrom,
    pause,
    toggle,
    jumpTo,
    updateSettings,
    applyTimer,
  };
}
