import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Annotation, Book, Chapter, Storage } from '../core/types';
import type { TTSEngine, VoiceCard } from '../core/tts/types';
import { bookStore, memoryStorage } from '../core/bookStore';
import { makeAnchor, parseAnchor } from '../core/anchors';
import {
  applyHighlights, applySpeaking, clearSpeaking, highlightsOfChapter, readSelection,
  type ChapterHighlight, type SelectionDraft,
} from '../core/annotations';
import { chunkChapterRanges } from '../core/tts/chunker';
import { usePlayback } from './usePlayback';
import {
  FONT_SIZE_RANGE, FONT_STACK, LINE_HEIGHT_RANGE, THEMES,
  loadSettings, normalizeSettings, readerCss, saveSettings,
  type ReaderFont, type ReaderSettings, type ReaderTheme,
} from '../core/readerSettings';

type Store = ReturnType<typeof bookStore>;

function newAnnotationId(): string {
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/** 里层控件自己处理按键：输入/选择时不触发全局快捷键 */
function isFormField(target: EventTarget | null): boolean {
  const tag = (target as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** 同一本书里循环切换的语速档位 */
const RATE_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3, 0.5];
function nextRate(rate: number): number {
  return RATE_STEPS.find(r => r > rate) ?? RATE_STEPS[0];
}

function SettingsPanel({ settings, onChange, open }: {
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  open: boolean;
}) {
  const set = (patch: Partial<ReaderSettings>) => onChange(patch);
  return (
    <div id="aa-panel" className="aa-panel" hidden={!open}>
      <div className="aa-row">
        <span>字号</span>
        <div className="aa-controls">
          <button
            aria-label="减小字号"
            onClick={() => set({ fontSize: Math.max(FONT_SIZE_RANGE.min, settings.fontSize - FONT_SIZE_RANGE.step) })}
          >A−</button>
          <span className="aa-value">{settings.fontSize}</span>
          <button
            aria-label="增大字号"
            onClick={() => set({ fontSize: Math.min(FONT_SIZE_RANGE.max, settings.fontSize + FONT_SIZE_RANGE.step) })}
          >A+</button>
        </div>
      </div>
      <label className="aa-row">
        行高
        <input
          type="range"
          min={LINE_HEIGHT_RANGE.min}
          max={LINE_HEIGHT_RANGE.max}
          step={LINE_HEIGHT_RANGE.step}
          value={settings.lineHeight}
          onChange={e => set({ lineHeight: Number(e.target.value) })}
          style={{ width: 120 }}
        />
      </label>
      <label className="aa-row">
        字体
        <select value={settings.fontFamily} onChange={e => set({ fontFamily: e.target.value as ReaderFont })}>
          <option value="sans">黑体</option>
          <option value="serif">衬线</option>
        </select>
      </label>
      <label className="aa-row">
        主题
        <select value={settings.theme} onChange={e => set({ theme: e.target.value as ReaderTheme })}>
          {Object.entries(THEMES).map(([value, theme]) => (
            <option key={value} value={value}>{theme.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

/**
 * 原版章节：iframe 隔离书内样式，资源由格式层重写成 blob: URL。
 * 不给 allow-scripts，书内脚本一律不执行；允许同源是为了加载 blob: 资源并注入阅读设置。
 */
function OriginalChapter({ chapter, settings, highlights, speaking, onSelect, onStep }: {
  chapter: Chapter;
  settings: ReaderSettings;
  highlights: ChapterHighlight[];
  /** 边听边看：当前朗读段的原文区间 */
  speaking?: { start: number; end: number };
  onSelect: (draft: SelectionDraft | null) => void;
  onStep: (delta: number) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // 整章文档按需加载：不在导入时就把全书资源解成 blob:，大书才不会一次吃满内存
  useEffect(() => {
    let cancelled = false;
    setDocUrl(null);
    setFailed(false);
    const load = chapter.loadDoc;
    if (!load) {
      setFailed(true);
      return;
    }
    load()
      .then(url => {
        if (cancelled) return;
        if (url) setDocUrl(url);
        else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [chapter]);

  /** 注入阅读设置并重画划线；iframe 每次加载都是新文档，所以按需重来即可 */
  const decorate = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.head || !doc.body) return;
    let style = doc.getElementById('lingyue-reader-style') as HTMLStyleElement | null;
    if (!style) {
      style = doc.createElement('style');
      style.id = 'lingyue-reader-style';
      doc.head.appendChild(style);
    }
    style.textContent = readerCss(settings);
    applyHighlights(doc.body, highlights);
    if (speaking) applySpeaking(doc.body, speaking.start, speaking.end);
    else clearSpeaking(doc.body);
  }, [settings, highlights, speaking]);

  // 朗读到下一段时把高亮滚到视野中间（iframe 内自己滚动）
  useEffect(() => {
    if (!speaking) return;
    const mark = iframeRef.current?.contentDocument?.querySelector('mark.lingyue-speaking');
    mark?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [speaking]);

  const attachListeners = useCallback(() => {
    const frame = iframeRef.current;
    const doc = frame?.contentDocument;
    if (!frame || !doc?.body) return;

    const selectHandler = () => {
      const rect = frame.getBoundingClientRect();
      onSelect(readSelection(doc.body, rect.left, rect.top));
    };
    // iframe 里的按键不会冒泡到应用页面，翻章快捷键要单独挂一份
    const keyHandler = (ev: KeyboardEvent) => {
      if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;
      if (isFormField(ev.target)) return;
      if (ev.key === 'ArrowLeft') { ev.preventDefault(); onStep(-1); }
      else if (ev.key === 'ArrowRight') { ev.preventDefault(); onStep(1); }
    };

    doc.addEventListener('mouseup', selectHandler);
    doc.addEventListener('keyup', selectHandler);
    doc.addEventListener('keydown', keyHandler);
    // 监听器挂在旧文档上，章节切换、文档销毁时自动释放，无需手动移除
  }, [onSelect, onStep]);

  useEffect(() => { decorate(); }, [decorate, docUrl]);

  if (failed) {
    return (
      <>
        <h1 className="reader-title">{chapter.title}</h1>
        <div className="reader-body-text" dangerouslySetInnerHTML={{ __html: chapter.html }} />
      </>
    );
  }
  if (!docUrl) return <p className="loading">正在加载原版排版…</p>;

  return (
    <iframe
      ref={iframeRef}
      className="reader-frame"
      title={chapter.title}
      src={docUrl}
      sandbox="allow-same-origin"
      onLoad={() => { decorate(); attachListeners(); }}
    />
  );
}

interface Props {
  book: Book;
  initialChapter?: number;
  storage?: Storage;
  onBack?: () => void;
  /** 有引擎时显示「边听边看」栏；没有就只做纯阅读 */
  engine?: TTSEngine | null;
  cards?: VoiceCard[];
  onOpenPlayer?: () => void;
}

export function Reader({ book, initialChapter = 0, storage, onBack, engine, cards, onOpenPlayer }: Props) {
  // 书级状态（进度/划线）走注入的 storage；默认 memoryStorage 保持既有测试与行为不变。
  // main 传入 localStorageAdapter()，让阅读进度与搭子/听书共享同一份书级状态。
  const store = useMemo<Store>(() => bookStore(storage ?? memoryStorage()), [storage]);
  const [index, setIndex] = useState(initialChapter);
  const chapter = book.spine[index];
  const lastIndex = book.spine.length - 1;

  const [settings, setSettings] = useState<ReaderSettings>(loadSettings);
  const [annotations, setAnnotations] = useState<Annotation[]>(() => store.loadState(book.meta.id).annotations);
  const [draft, setDraft] = useState<SelectionDraft | null>(null);
  const [note, setNote] = useState('');
  const [hint, setHint] = useState('');
  const [aaOpen, setAaOpen] = useState(false);
  const [sideOpen, setSideOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // 快捷键回调保持稳定，同时总能拿到最新章节号
  const indexRef = useRef(index);

  const theme = THEMES[settings.theme];
  const highlights = useMemo(() => highlightsOfChapter(index, annotations), [index, annotations]);
  const reflowed = !chapter?.loadDoc;

  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    // 函数式更新：连续点「A+」不会因为闭包里的旧值互相覆盖
    setSettings(prev => normalizeSettings({ ...prev, ...patch }));
  }, []);

  // 设置变化后落盘（引号里的默认值写一次也无害）
  useEffect(() => { saveSettings(settings); }, [settings]);

  const goTo = useCallback((next: number) => {
    if (next < 0 || next > lastIndex) return;
    indexRef.current = next;
    setIndex(next);
    setSideOpen(false);
    // 进度是尽力而为的数据：存储写满时不能让翻页本身失败
    try {
      store.saveProgress(book.meta.id, {
        bookId: book.meta.id,
        chapterIndex: next,
        anchor: makeAnchor(next, 0),
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.warn('阅读进度保存失败：', e);
    }
  }, [book.meta.id, lastIndex, store]);

  const step = useCallback((delta: number) => goTo(indexRef.current + delta), [goTo]);

  // 边听边看：播放状态与阅读页共用，播放翻章时阅读页跟着翻
  const playback = usePlayback(book, engine ?? null, cards ?? [], {
    initialChapter,
    onChapterChange: goTo,
  });

  // 分段与正文用同一套原文偏移，当前朗读段可以精确高亮
  const chunks = useMemo(() => (chapter ? chunkChapterRanges(chapter.html) : []), [chapter]);
  const speaking = playback.progress.count > 0 && playback.progress.chapter === index
    ? chunks[playback.progress.segment]
    : undefined;

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    if (isFormField(e.target)) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
  }, [step]);

  const handleSelection = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    setDraft(readSelection(el));
  }, []);

  const handleIframeSelection = useCallback((next: SelectionDraft | null) => {
    setDraft(next);
  }, []);

  // 换章时收起选区工具条，避免把上一章的位置用到这一章
  useEffect(() => { setDraft(null); setNote(''); }, [index]);

  // 重排章节由应用自己渲染：提交后按偏移重画划线
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !reflowed) return;
    applyHighlights(el, highlights);
  }, [chapter, reflowed, highlights]);

  // 边听边看：当前朗读段在正文里高亮
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !reflowed) return;
    if (speaking) applySpeaking(el, speaking.start, speaking.end);
    else clearSpeaking(el);
  }, [speaking, reflowed]);

  // 换段时把高亮滚到视野中间；系统要求减少动效时直接跳
  useEffect(() => {
    if (!speaking || !playback.playing) return;
    const mark = contentRef.current?.querySelector('mark.lingyue-speaking');
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    mark?.scrollIntoView?.({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }, [speaking, playback.playing]);

  const saveAnnotation = useCallback(() => {
    if (!draft) return;
    const annotation: Annotation = {
      id: newAnnotationId(),
      bookId: book.meta.id,
      anchor: makeAnchor(index, draft.start),
      quote: draft.quote,
      note: note.trim(),
      createdAt: Date.now(),
    };
    try {
      store.addAnnotation(book.meta.id, annotation);
      setAnnotations(store.loadState(book.meta.id).annotations);
      setDraft(null);
      setNote('');
      setHint('已添加划线');
    } catch (e) {
      setHint(e instanceof Error ? e.message : String(e));
    }
  }, [draft, note, book.meta.id, index, store]);

  const removeAnnotation = useCallback((id: string) => {
    try {
      store.removeAnnotation(book.meta.id, id);
      setAnnotations(store.loadState(book.meta.id).annotations);
      setHint('已删除划线');
    } catch (e) {
      setHint(e instanceof Error ? e.message : String(e));
    }
  }, [book.meta.id, store]);

  return (
    <div
      className="reader"
      data-theme={settings.theme}
      data-listen={engine ? 'true' : undefined}
      style={{ '--page-bg': theme.background, '--page-fg': theme.color } as React.CSSProperties}
      onKeyDown={handleKeyDown}
    >
      <a className="skip-link" href="#lingyue-read-content">跳到正文</a>
      {/* 换章时播报章节标题，屏幕阅读器用户不需要靠翻找确认位置 */}
      <div className="lingyue-sr-only" role="status" aria-live="polite">{chapter?.title ?? ''}</div>

      <header className="reader-bar">
        {onBack && <button className="icon-btn" onClick={onBack} aria-label="返回书架">返回</button>}
        <div className="reader-bar-title">
          <span className="reader-book">{book.meta.title}</span>
          <span className="reader-chapter">{index + 1} / {book.spine.length}</span>
        </div>
        <div className="reader-bar-actions">
          <button
            className="icon-btn"
            onClick={() => setSideOpen(open => !open)}
            aria-expanded={sideOpen}
            aria-controls="reader-side"
          >目录</button>
          <button
            className="icon-btn"
            onClick={() => setAaOpen(open => !open)}
            aria-expanded={aaOpen}
            aria-controls="aa-panel"
          >Aa</button>
        </div>
        <span className="reader-progress" aria-hidden="true">
          <i style={{ width: ((index + 1) / Math.max(1, book.spine.length) * 100).toFixed(1) + '%' }} />
        </span>
      </header>

      <SettingsPanel settings={settings} onChange={updateSettings} open={aaOpen} />
      {sideOpen && <button className="reader-backdrop" aria-label="关闭目录" onClick={() => setSideOpen(false)} />}

      <div className="reader-body">
        <aside id="reader-side" className={'reader-side' + (sideOpen ? ' is-open' : '')}>
          <h2 className="side-title">目录</h2>
          <nav aria-label="目录">
            <ul>
              {book.toc.map(item => (
                <li key={item.index}>
                  <button
                    className="toc-item"
                    onClick={() => goTo(item.index)}
                    aria-current={item.index === index ? 'true' : undefined}
                  >{item.title}</button>
                </li>
              ))}
            </ul>
          </nav>

          <h2 className="side-title">划线（{annotations.length}）</h2>
          {annotations.length === 0 && <p className="side-empty">选中正文即可划线</p>}
          <ul>
            {annotations.map(annotation => {
              const parsed = parseAnchor(annotation.anchor);
              const excerpt = annotation.quote.slice(0, 20);
              return (
                <li key={annotation.id} className="anno">
                  <div className="anno-chapter">{parsed ? book.spine[parsed.chapter]?.title ?? '' : ''}</div>
                  <blockquote className="anno-quote">
                    {annotation.quote.slice(0, 40)}{annotation.quote.length > 40 ? '…' : ''}
                  </blockquote>
                  {annotation.note && <p className="anno-note">{annotation.note}</p>}
                  <div className="anno-actions">
                    <button aria-label={'定位到划线：' + excerpt} onClick={() => parsed && goTo(parsed.chapter)}>定位</button>
                    <button aria-label={'删除划线：' + excerpt} onClick={() => removeAnnotation(annotation.id)}>删除</button>
                  </div>
                </li>
              );
            })}
          </ul>
          {hint && <p className="reader-hint" role="status">{hint}</p>}
        </aside>

        <main id="lingyue-read-content" tabIndex={-1} aria-label="正文" className="reader-main">
          <div className="reader-article">
            {chapter?.loadDoc ? (
              <OriginalChapter
                chapter={chapter}
                settings={settings}
                highlights={highlights}
                speaking={speaking}
                onSelect={handleIframeSelection}
                onStep={step}
              />
            ) : (
              // 章节标题本来就写在正文 HTML 里（TXT 的 <h1>、EPUB 的原标题），
              // 外面再渲染一次会出现两个标题；标题样式交给 .reader-body-text h1。
              <div
                ref={contentRef}
                className="reader-body-text"
                onMouseUp={handleSelection}
                onKeyUp={handleSelection}
                style={{
                  fontSize: settings.fontSize,
                  lineHeight: settings.lineHeight,
                  fontFamily: FONT_STACK[settings.fontFamily],
                }}
                dangerouslySetInnerHTML={{ __html: chapter?.html ?? '' }}
              />
            )}
          </div>

          <div className="chapter-nav">
            <button
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              aria-keyshortcuts="Alt+ArrowLeft"
            >上一章</button>
            <button
              onClick={() => goTo(index + 1)}
              disabled={index >= lastIndex}
              aria-keyshortcuts="Alt+ArrowRight"
            >下一章</button>
          </div>
        </main>
      </div>

      {engine && (
        <div className="listen-bar" role="region" aria-label="听书控制">
          <button
            className="listen-toggle"
            onClick={() => (playback.playing ? playback.pause() : playback.playFrom(index))}
          >{playback.playing ? '暂停' : '听书'}</button>
          <div className="listen-info">
            <strong>{playback.playing ? '正在听' : '边听边看'}</strong>
            <span>
              {playback.status
                ? playback.status
                : playback.progress.count > 0 && playback.progress.chapter === index
                  ? '第 ' + (playback.progress.segment + 1) + ' / ' + playback.progress.count + ' 段'
                  : '第 ' + (index + 1) + ' 章'}
            </span>
          </div>
          <button
            className="icon-btn"
            onClick={() => playback.jumpTo(index - 1)}
            disabled={index === 0}
            aria-label="上一章"
          ><span aria-hidden="true">‹</span></button>
          <button
            className="icon-btn"
            onClick={() => playback.jumpTo(index + 1)}
            disabled={index >= lastIndex}
            aria-label="下一章"
          ><span aria-hidden="true">›</span></button>
          <button
            className="icon-btn"
            onClick={() => playback.updateSettings({ rate: nextRate(playback.settings.rate) })}
            aria-label="语速"
          >{playback.settings.rate}×</button>
          {onOpenPlayer && (
            <button className="icon-btn" onClick={onOpenPlayer} aria-label="打开播放器">全屏</button>
          )}
          {playback.status && <span className="lingyue-sr-only" role="status">{playback.status}</span>}
        </div>
      )}

      {draft && (
        <div
          className="sel-toolbar"
          role="group"
          aria-label="添加划线"
          style={{
            top: Math.max(8, draft.top - 52),
            left: Math.max(8, Math.min(draft.left, (globalThis.innerWidth ?? 800) - 320)),
          }}
        >
          <input
            autoFocus
            aria-label="划线笔记"
            placeholder="笔记（可选），回车保存"
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); saveAnnotation(); }
              else if (e.key === 'Escape') { e.preventDefault(); setDraft(null); setNote(''); }
            }}
          />
          <button className="primary" onClick={saveAnnotation}>划线</button>
          <button className="cancelled" onClick={() => { setDraft(null); setNote(''); }}>取消</button>
        </div>
      )}
    </div>
  );
}
