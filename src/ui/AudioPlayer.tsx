import React, { useState, useRef, useCallback, useEffect } from 'react';
import type { Book } from '../core/types';
import type { TTSEngine, VoiceCard } from '../core/tts/types';
import { chunkChapter } from '../core/tts/chunker';
import { makeAnchor } from '../core/anchors';

/** 播放一段合成音频；播放结束/出错或 abort 都会 resolve，并回收 blob URL */
export function playBlob(blob: Blob, controller: AbortController, setAudio: (a: HTMLAudioElement) => void): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(URL.createObjectURL(blob));
    setAudio(audio);
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      controller.signal.removeEventListener('abort', done);
      audio.pause();
      URL.revokeObjectURL(audio.src);
      resolve();
    };
    controller.signal.addEventListener('abort', done, { once: true });
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(() => {});
  });
}

interface Props {
  book: Book;
  engine: TTSEngine;
  cards: VoiceCard[];
  onPosition: (pos: { chapterIndex: number; anchor: string }) => void;
  /** 断点续听：初次挂载时从中断的章节开始（后续变化不响应） */
  initialChapter?: number;
}

/** 听书播放器：逐段合成 → 连播；渲染阶段不触碰 Audio / URL.createObjectURL 等浏览器 API */
export function AudioPlayer({ book, engine, cards, onPosition, initialChapter }: Props) {
  const [currentChapter, setCurrentChapter] = useState(initialChapter ?? 0);
  const [playing, setPlaying] = useState(false);
  const [voiceId, setVoiceId] = useState('');
  const [status, setStatus] = useState('');
  const stopRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 卸载时中止在途合成与播放，避免组件销毁后音频继续出声
  useEffect(() => () => { stopRef.current?.abort(); }, []);

  const stop = useCallback(() => {
    stopRef.current?.abort();
    stopRef.current = null;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setPlaying(false);
  }, []);

  const playFrom = useCallback(async (chapterIndex: number, voice: string) => {
    if (!voice) { setStatus('请先选择音色'); return; }
    stop();
    const controller = new AbortController();
    stopRef.current = controller;
    setPlaying(true);
    for (let ci = chapterIndex; ci < book.spine.length; ci++) {
      if (controller.signal.aborted) break;
      if (ci !== chapterIndex) {
        setCurrentChapter(ci); // 状态与实际播放位置保持同步，停止后可从当前位置续播
        onPosition({ chapterIndex: ci, anchor: makeAnchor(ci, 0) });
      }
      const segs = chunkChapter(book.spine[ci]?.html ?? '');
      const rate = cards.find(c => c.voiceId === voice)?.rate ?? 1;
      for (let i = 0; i < segs.length; i++) {
        if (controller.signal.aborted) break;
        try {
          const blob = await engine.synthesize({ text: segs[i], voiceId: voice, rate, signal: controller.signal });
          if (controller.signal.aborted) break;
          await playBlob(blob, controller, a => { audioRef.current = a; });
        } catch (e) {
          if (!controller.signal.aborted) setStatus('合成失败：' + String(e));
          break;
        }
      }
    }
    if (!controller.signal.aborted) setPlaying(false);
  }, [book, engine, cards, stop, onPosition]);

  const play = useCallback(() => {
    const voice = voiceId || cards[0]?.voiceId || '';
    if (!voice) { setStatus('请先选择音色'); return; }
    onPosition({ chapterIndex: currentChapter, anchor: makeAnchor(currentChapter, 0) });
    void playFrom(currentChapter, voice);
  }, [currentChapter, voiceId, cards, onPosition, playFrom]);

  return (
    <div style={{ fontFamily: 'system-ui', maxWidth: 720 }}>
      <h2>{book.meta.title}</h2>
      <div>
        <label>音色：</label>
        {cards.length === 0
          ? <span>暂无音色，请先在「音色管理」创建</span>
          : <select value={voiceId || cards[0].voiceId} onChange={e => setVoiceId(e.target.value)}>
              {cards.map(c => <option key={c.id} value={c.voiceId}>{c.name}</option>)}
            </select>}
      </div>
      <div>
        {playing ? <button onClick={stop}>停止</button> : <button onClick={play}>播放</button>}
        <span style={{ marginLeft: 8 }}>{status}</span>
      </div>
      <ol>
        {book.spine.map(ch => (
          <li key={ch.index}>
            <button
              aria-current={ch.index === currentChapter || undefined}
              onClick={() => {
                stop();
                setCurrentChapter(ch.index);
                onPosition({ chapterIndex: ch.index, anchor: makeAnchor(ch.index, 0) });
              }}
            >{ch.title}</button>
          </li>
        ))}
      </ol>
    </div>
  );
}
