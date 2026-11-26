import React, { useState } from 'react';
import type { Book } from '../core/types';
import type { TTSEngine, VoiceCard } from '../core/tts/types';
import { clothOf } from './cover';
import { RATE_RANGE } from '../core/playerSettings';
import { usePlayback } from './usePlayback';

export { playBlob } from './playBlob';

interface Props {
  book: Book;
  engine: TTSEngine;
  cards: VoiceCard[];
  onPosition: (pos: { chapterIndex: number; anchor: string }) => void;
  /** 断点续听：初次挂载时从中断的章节开始（后续变化不响应） */
  initialChapter?: number;
}

type Sheet = 'toc' | 'voice' | 'speed' | 'timer' | null;

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const TIMERS = [15, 30, 45, 60, 90];

/**
 * 听书播放器：逐段合成 → 连播。
 * 布局参考番茄小说：中间上一章 / 播放 / 下一章，底部一排目录、音色、倍速、定时。
 */
export function AudioPlayer({ book, engine, cards, onPosition, initialChapter }: Props) {
  const playback = usePlayback(book, engine, cards, { initialChapter, onPosition });
  const [sheet, setSheet] = useState<Sheet>(null);

  const { chapter, playing, status, progress, settings, timer, effectiveVoice } = playback;
  const totalChapters = book.spine.length;
  const voiceName = cards.find(c => c.voiceId === effectiveVoice)?.name ?? '未选择';
  const chapterRatio = progress.count > 0 ? Math.min(1, (progress.segment + 1) / progress.count) : 0;
  const timerLabel = timer === 'none' ? '不开启' : timer === 'chapter' ? '听完本章' : timer + ' 分钟';
  const toggleSheet = (next: Exclude<Sheet, null>) => setSheet(current => (current === next ? null : next));

  return (
    <section className="player" aria-label="听书">
      <div className="player-body">
        <div
          className="player-cover"
          style={{ '--cloth': clothOf(book.meta.id) } as React.CSSProperties}
          aria-hidden="true"
        >
          <span className="book-cover-slip">
            <span className="book-cover-title">{book.meta.title}</span>
          </span>
          <span className="book-cover-author">{book.meta.author || '未知作者'}</span>
        </div>

        <h1 className="player-title">{book.meta.title}</h1>
        <p className="player-chapter">第 {chapter + 1} 章 · 共 {totalChapters} 章</p>

        <div className="player-bar" role="progressbar" aria-label="本章进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(chapterRatio * 100)}>
          <i style={{ width: (chapterRatio * 100).toFixed(1) + '%' }} />
        </div>
        <div className="player-meta">
          <span>{book.spine[chapter]?.title ?? ''}</span>
          <span>{progress.count > 0 ? '第 ' + (progress.segment + 1) + ' / ' + progress.count + ' 段' : ''}</span>
        </div>

        <div className="player-controls">
          <button className="ctrl-btn" onClick={() => playback.jumpTo(chapter - 1)} disabled={chapter <= 0}>上一章</button>
          <button className="play-btn" onClick={playing ? playback.pause : playback.play}>
            {playing ? '暂停' : '播放'}
          </button>
          <button className="ctrl-btn" onClick={() => playback.jumpTo(chapter + 1)} disabled={chapter >= totalChapters - 1}>下一章</button>
        </div>
        <span className="player-status" role="status">{status}</span>

        <div className="player-tools">
          <button aria-expanded={sheet === 'toc'} onClick={() => toggleSheet('toc')}>
            目录<span className="value">{totalChapters} 章</span>
          </button>
          <button aria-expanded={sheet === 'voice'} onClick={() => toggleSheet('voice')}>
            音色<span className="value">{voiceName}</span>
          </button>
          <button aria-expanded={sheet === 'speed'} onClick={() => toggleSheet('speed')}>
            倍速<span className="value">{settings.rate}×</span>
          </button>
          <button aria-expanded={sheet === 'timer'} onClick={() => toggleSheet('timer')}>
            定时<span className="value">{timerLabel}</span>
          </button>
        </div>

        <section className="player-sheet" hidden={sheet !== 'toc'}>
          <ol className="chapter-list">
            {book.spine.map(ch => (
              <li key={ch.index}>
                <button
                  aria-current={ch.index === chapter || undefined}
                  onClick={() => { playback.jumpTo(ch.index); setSheet(null); }}
                >
                  <span className="num">{String(ch.index + 1).padStart(2, '0')}</span>
                  <span>{ch.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section className="player-sheet" hidden={sheet !== 'voice'}>
          <p className="sheet-title">音色</p>
          {cards.length === 0 ? (
            <p className="voice-empty">还没有音色。先到「音色管理」上传一段参考音频。</p>
          ) : (
            <label className="sheet-row" htmlFor="lingyue-voice-select">
              当前音色
              <select
                id="lingyue-voice-select"
                value={effectiveVoice}
                onChange={e => playback.updateSettings({ voiceId: e.target.value })}
              >
                {cards.map(c => <option key={c.id} value={c.voiceId}>{c.name}</option>)}
              </select>
            </label>
          )}
        </section>

        <section className="player-sheet" hidden={sheet !== 'speed'}>
          <p className="sheet-title">语速</p>
          <div className="sheet-grid">
            {SPEEDS.map(rate => (
              <button key={rate} aria-pressed={settings.rate === rate} onClick={() => playback.updateSettings({ rate })}>
                {rate}×
              </button>
            ))}
          </div>
          <input
            className="sheet-range"
            type="range"
            aria-label="语速"
            min={RATE_RANGE.min}
            max={RATE_RANGE.max}
            step={RATE_RANGE.step}
            value={settings.rate}
            onChange={e => playback.updateSettings({ rate: Number(e.target.value) })}
          />
        </section>

        <section className="player-sheet" hidden={sheet !== 'timer'}>
          <p className="sheet-title">定时关闭</p>
          <div className="sheet-grid">
            {TIMERS.map(minutes => (
              <button key={minutes} aria-pressed={timer === minutes} onClick={() => playback.applyTimer(minutes)}>
                {minutes} 分钟
              </button>
            ))}
            <button aria-pressed={timer === 'chapter'} onClick={() => playback.applyTimer('chapter')}>听完本章</button>
            <button aria-pressed={timer === 'none'} onClick={() => playback.applyTimer('none')}>不开启</button>
          </div>
        </section>
      </div>
    </section>
  );
}
