import React, { useState, useRef, useCallback } from 'react';
import type { Book } from '../core/types';
import type { TTSEngine, VoiceCard } from '../core/tts/types';
import { chunkChapter } from '../core/tts/chunker';
import { makeAnchor } from '../core/anchors';

interface Props {
  book: Book;
  engine: TTSEngine;
  cards: VoiceCard[];
  onPosition: (pos: { chapterIndex: number; anchor: string }) => void;
}

function playBlob(blob: Blob, controller: AbortController, setAudio: (a: HTMLAudioElement) => void): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(URL.createObjectURL(blob));
    setAudio(audio);
    const done = () => { audio.pause(); resolve(); };
    audio.onended = done;
    audio.onerror = done;
    void audio.play();
  });
}

/** 听书播放器：逐段合成 → 连播；渲染阶段不触碰 Audio / URL.createObjectURL 等浏览器 API */
export function AudioPlayer({ book, engine, cards, onPosition }: Props) {
  const [currentChapter, setCurrentChapter] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [voiceId, setVoiceId] = useState('');
  const [status, setStatus] = useState('');
  const stopRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    stopRef.current?.abort();
    stopRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
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
      if (ci !== chapterIndex) onPosition({ chapterIndex: ci, anchor: makeAnchor(ci, 0) });
      const segs = chunkChapter(book.spine[ci]?.html ?? '');
      for (let i = 0; i < segs.length; i++) {
        if (controller.signal.aborted) break;
        try {
          const blob = await engine.synthesize({ text: segs[i], voiceId: voice, signal: controller.signal });
          if (controller.signal.aborted) break;
          await playBlob(blob, controller, a => { audioRef.current = a; });
        } catch (e) {
          if (!controller.signal.aborted) setStatus('合成失败：' + String(e));
          break;
        }
      }
    }
    if (!controller.signal.aborted) setPlaying(false);
  }, [book, engine, stop, onPosition]);

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
        {playing
          ? <button onClick={stop}>停止</button>
          : <button onClick={play}>播放</button>}
        <span style={{ marginLeft: 8 }}>{status}</span>
      </div>
      <ol>
        {book.spine.map(ch => (
          <li key={ch.index}>
            <button
              onClick={() => {
                stop();
                setCurrentChapter(ch.index);
                onPosition({ chapterIndex: ch.index, anchor: makeAnchor(ch.index, 0) });
              }}
            >
              {ch.title}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
