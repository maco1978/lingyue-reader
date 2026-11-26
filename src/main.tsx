import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { Reader } from './ui/Reader';
import { AudioPlayer } from './ui/AudioPlayer';
import { VoiceManager } from './ui/VoiceManager';
import { ChatPanel } from './ui/ChatPanel';
import { Library } from './ui/Library';
import { openBook } from './core/openBook';
import { makeAnchor } from './core/anchors';
import { bookStore } from './core/bookStore';
import { library, indexedDbDriver, memoryDriver, type LibraryEntry } from './core/library';
import { voiceCards } from './core/tts/voiceCards';
import { MossApiEngine } from './core/tts/mossApiEngine';
import { OpenAIProvider } from './core/agent/llmProvider';
import type { Book, Storage } from './core/types';
import type { VoiceCard } from './core/tts/types';
import { collectBookData, applyBookData } from './ui/backup';

const API_KEY_STORAGE = 'lingyue:moss-api-key';
const LLM_CONFIG_STORAGE = 'lingyue:llm-config';
const LAST_BOOK_KEY = 'lingyue:last-book';

/** Hy4 Flash 默认值（OpenAI 兼容）；API Key 必须用户自填，永不硬编码 */
const DEFAULT_LLM = { baseUrl: 'https://tokenhub.tencentmaas.com/v1', model: 'hy4-flash' };

interface LlmConfig { baseUrl: string; model: string; apiKey: string }

function loadLlmConfig(): LlmConfig {
  try {
    const raw = window.localStorage.getItem(LLM_CONFIG_STORAGE);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LlmConfig>;
      return { baseUrl: parsed.baseUrl || DEFAULT_LLM.baseUrl, model: parsed.model || DEFAULT_LLM.model, apiKey: parsed.apiKey || '' };
    }
  } catch { /* 损坏的配置按默认处理 */ }
  return { ...DEFAULT_LLM, apiKey: '' };
}

/** localStorage → Storage 适配器（bookStore / voiceCards 同款） */
function localStorageAdapter(): Storage {
  return {
    get: k => window.localStorage.getItem(k),
    set: (k, v) => window.localStorage.setItem(k, v),
    remove: k => window.localStorage.removeItem(k),
  };
}

/** 模块级单例适配器：阅读进度/划线（Reader 注入）与搭子/听书共享同一份 localStorage 书级状态 */
const bookStoreStorage = localStorageAdapter();

const store = bookStore(bookStoreStorage);
const voices = voiceCards(localStorageAdapter());

/** 本地书库：IndexedDB 不可用（隐私模式等）时降级为内存，本次会话仍可读，只是刷新会丢 */
const lib = library(typeof indexedDB === 'undefined' ? memoryDriver() : indexedDbDriver());

/** 章节序号一律夹到合法范围：存储里的旧进度/脏数据不会越界 */
function clampChapter(book: Book, index: number | undefined): number {
  return Math.max(0, Math.min(index ?? 0, book.spine.length - 1));
}

const VIEWS = [
  { id: 'library', label: '书架' },
  { id: 'reader', label: '阅读' },
  { id: 'listen', label: '听书' },
  { id: 'voices', label: '音色管理' },
  { id: 'chat', label: '搭子' },
] as const;

type View = typeof VIEWS[number]['id'];

function TopBar({ view, onView, onImport }: {
  view: View;
  onView: (view: View) => void;
  onImport: (file: File) => void;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark">聆阅</span>
        <span className="lingyue-sr-only">看书</span>
        <span className="brand-seal" aria-hidden="true">书</span>
      </div>
      <nav aria-label="主导航" className="nav">
        {VIEWS.map(item => (
          <button
            key={item.id}
            onClick={() => onView(item.id)}
            aria-current={view === item.id ? 'page' : undefined}
          >{item.label}</button>
        ))}
      </nav>
      <div className="topbar-actions">
        <label className="btn btn-primary lingyue-file">
          导入图书
          <input
            type="file"
            accept=".epub,.mobi,.azw3,.txt,.fb2"
            className="lingyue-sr-only"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
        </label>
      </div>
    </header>
  );
}

function App() {
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('library');
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [opening, setOpening] = useState('');
  const [apiKey, setApiKey] = useState(() => window.localStorage.getItem(API_KEY_STORAGE) ?? '');
  const [keyDraft, setKeyDraft] = useState('');
  const [cards, setCards] = useState<VoiceCard[]>(() => voices.list());
  const [llm, setLlm] = useState<LlmConfig>(loadLlmConfig);
  const [llmKeyDraft, setLlmKeyDraft] = useState('');

  // 换书时释放旧书持有的 blob: 资源（原版渲染的样式/图片缓存）
  useEffect(() => () => { book?.dispose?.(); }, [book]);

  /** 从本地书库打开：取原始文件 → 重新解析 → 记为最近读的一本 */
  const openById = useCallback(async (id: string) => {
    setOpening(id);
    setError('');
    try {
      const found = await lib.open(id);
      if (!found) {
        setError('这本书已不在本地书库，可能已被删除');
        return;
      }
      const loaded = await openBook(found.fileName, found.bytes);
      setBook(loaded);
      setView('reader');
      window.localStorage.setItem(LAST_BOOK_KEY, loaded.meta.id);
      await lib.touch(id);
      setEntries(await lib.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening('');
    }
  }, []);

  // 启动时读书架，并自动接着上次读的那本；书已被删除就停在书架
  useEffect(() => {
    let alive = true;
    void (async () => {
      let list: LibraryEntry[] = [];
      try {
        list = await lib.list();
      } catch (e) {
        console.warn('读取本地书库失败：', e);
      }
      if (!alive) return;
      setEntries(list);
      setReady(true);
      const lastId = window.localStorage.getItem(LAST_BOOK_KEY);
      if (lastId && list.some(entry => entry.id === lastId)) void openById(lastId);
    })();
    return () => { alive = false; };
  }, [openById]);

  /** 导入真实电子书：File → bytes → openBook，成功后再尽力入库 */
  const handleImportBook = useCallback(async (file: File) => {
    setError('');
    setOpening('import');
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const loaded = await openBook(file.name, buf);
      // 先开书再入库：即使书库写不进去，本次阅读也不受影响
      setBook(loaded);
      setView('reader');
      window.localStorage.setItem(LAST_BOOK_KEY, loaded.meta.id);
      try {
        await lib.save({
          fileName: file.name,
          bytes: buf,
          meta: loaded.meta,
          chapterCount: loaded.spine.length,
        });
        setEntries(await lib.list());
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening('');
    }
  }, []);

  /** 从书架删除：图书文件与阅读状态一并清掉 */
  const handleRemoveBook = useCallback(async (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    if (!window.confirm('从书架删除《' + entry.meta.title + '》？阅读进度与聊天记录也会一并删除。')) return;
    try {
      await lib.remove(id);
      store.removeState(id);
      if (book?.meta.id === id) {
        setBook(null);
        setView('library');
      }
      if (window.localStorage.getItem(LAST_BOOK_KEY) === id) window.localStorage.removeItem(LAST_BOOK_KEY);
      setEntries(await lib.list());
    } catch (e) {
      alert('删除失败：' + (e instanceof Error ? e.message : String(e)));
    }
  }, [entries, book]);

  const saveApiKey = useCallback(() => {
    const trimmed = keyDraft.trim();
    if (!trimmed) return;
    window.localStorage.setItem(API_KEY_STORAGE, trimmed);
    setApiKey(trimmed);
    setKeyDraft('');
  }, [keyDraft]);

  const saveLlmKey = useCallback(() => {
    const trimmed = llmKeyDraft.trim();
    if (!trimmed) return;
    const next = { ...llm, apiKey: trimmed };
    window.localStorage.setItem(LLM_CONFIG_STORAGE, JSON.stringify(next));
    setLlm(next);
    setLlmKeyDraft('');
  }, [llmKeyDraft, llm]);

  const engine = useMemo(() => (apiKey ? new MossApiEngine(apiKey) : null), [apiKey]);
  const provider = useMemo(
    () => (llm.apiKey ? new OpenAIProvider(llm.apiKey, llm.baseUrl, llm.model) : null),
    [llm.apiKey, llm.baseUrl, llm.model],
  );

  const handleSaveCard = useCallback((card: VoiceCard) => {
    voices.save(card);
    setCards(voices.list());
  }, []);
  const handleRemoveCard = useCallback((id: string) => {
    voices.remove(id);
    setCards(voices.list());
  }, []);

  const handleBackupExport = useCallback(() => {
    const entries = Object.keys(window.localStorage).map(k => [k, window.localStorage.getItem(k)!] as [string, string]);
    const blob = new Blob([JSON.stringify(collectBookData(Object.fromEntries(entries)), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lingyue-backup.json';
    a.click();
    // 不能在 click() 后同步回收：部分浏览器还没开始读取 blob，下载会被取消
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  const handleBackupImport = useCallback(async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Record<string, string>;
      applyBookData(data, (k, v) => window.localStorage.setItem(k, v));
      alert('已导入，请刷新');
    } catch (e) {
      alert('导入失败：' + (e instanceof Error ? e.message : String(e)));
    }
  }, []);

  const handleJump = useCallback((chapterIndex: number) => {
    if (!book) return;
    // 跳转即移动阅读位置：写回 progress，让阅读页与搭子上下文共用同一个来源
    try {
      store.saveProgress(book.meta.id, {
        bookId: book.meta.id,
        chapterIndex,
        anchor: makeAnchor(chapterIndex, 0),
        updatedAt: Date.now(),
      });
    } catch (e) {
      console.warn('阅读进度保存失败：', e);
    }
    setView('reader');
  }, [book]);

  const handleAudioPosition = useCallback((pos: { chapterIndex: number; anchor: string }) => {
    if (!book) return;
    try {
      store.saveState(book.meta.id, { ...store.loadState(book.meta.id), audioPosition: pos });
    } catch (e) {
      console.warn('听书位置保存失败：', e);
    }
  }, [book]);

  const handlePersistChat = useCallback((messages: { role: 'user' | 'assistant'; content: string }[]) => {
    if (!book) return;
    // 聊天史只是附属数据：存储写满时不能把整轮对话一起弄挂
    try {
      store.saveState(book.meta.id, { ...store.loadState(book.meta.id), chatHistory: messages });
    } catch (e) {
      console.warn('聊天记录保存失败：', e);
    }
  }, [book]);

  const shelf = (
    <Library
      entries={entries}
      currentId={book?.meta.id}
      progressOf={id => store.loadState(id).progress?.chapterIndex}
      busyId={opening}
      onOpen={id => { void openById(id); }}
      onRemove={id => { void handleRemoveBook(id); }}
      onImport={file => { void handleImportBook(file); }}
      onExportBackup={handleBackupExport}
      onImportBackup={file => { void handleBackupImport(file); }}
    />
  );

  const errorBanner = error ? (
    <div role="alert" className="notice notice-danger">
      {error}
      {' '}
      <button onClick={() => setError('')}>关闭</button>
    </div>
  ) : null;

  if (!book) {
    return (
      <div className="app">
        <TopBar view="library" onView={setView} onImport={file => { void handleImportBook(file); }} />
        {errorBanner}
        <main className="app-main">
          {ready ? shelf : <p className="loading">正在读取书架…</p>}
        </main>
      </div>
    );
  }

  // 书级状态一次读出：进度/划线/听书位置/聊天史同源，避免每次渲染反复 JSON.parse
  const state = store.loadState(book.meta.id);
  const readingChapter = clampChapter(book, state.progress?.chapterIndex);
  const listeningChapter = clampChapter(book, state.audioPosition?.chapterIndex);

  // 阅读页是整屏接管：自己的顶栏、无应用导航，把空间全部留给正文
  if (view === 'reader') {
    return (
      <Reader
        key={book.meta.id}
        book={book}
        initialChapter={readingChapter}
        storage={bookStoreStorage}
        onBack={() => setView('library')}
        engine={engine}
        cards={cards}
        onOpenPlayer={() => setView('listen')}
      />
    );
  }

  return (
    <div className="app">
      <TopBar view={view} onView={setView} onImport={file => { void handleImportBook(file); }} />
      {errorBanner}
      {!apiKey && (
        <div className="notice">
          <span className="notice-inline">
            听书需要 MOSS API Key（只存在本机浏览器）：
            <input
              type="password"
              placeholder="粘贴 API Key"
              value={keyDraft}
              onChange={e => setKeyDraft(e.target.value)}
            />
            <button onClick={saveApiKey}>保存</button>
          </span>
        </div>
      )}

      <main className="app-main">
        {view === 'library' && shelf}
        {view === 'listen' && engine && (
          <AudioPlayer
            key={book.meta.id}
            book={book}
            engine={engine}
            cards={cards}
            initialChapter={listeningChapter}
            onPosition={handleAudioPosition}
          />
        )}
        {view === 'listen' && !engine && <p className="loading">请先配置 MOSS API Key</p>}
        {view === 'voices' && engine && (
          <VoiceManager engine={engine} cards={cards} onSave={handleSaveCard} onRemove={handleRemoveCard} />
        )}
        {view === 'voices' && !engine && <p className="loading">请先配置 MOSS API Key</p>}
        {view === 'chat' && provider && (
          // 搭子上下文与阅读页共用 progress 这一个来源：Reader 每次翻页都写回 storage
          <ChatPanel
            key={book.meta.id}
            book={book}
            provider={provider}
            annotations={state.annotations}
            onJump={handleJump}
            initialMessages={state.chatHistory}
            onPersist={handlePersistChat}
            chapterIndex={readingChapter}
          />
        )}
        {view === 'chat' && !provider && (
          <section className="chat-key">
            <h1>读书搭子</h1>
            <p>搭子使用 OpenAI 兼容接口。默认是腾讯混元 Hy4 Flash（{DEFAULT_LLM.baseUrl} / {DEFAULT_LLM.model}），
              也可以在 localStorage 的「{LLM_CONFIG_STORAGE}」里改成 DeepSeek 等任意兼容端点。</p>
            <div className="chat-key-form">
              <input
                type="password"
                placeholder="粘贴 LLM API Key"
                aria-label="LLM API Key"
                value={llmKeyDraft}
                onChange={e => setLlmKeyDraft(e.target.value)}
              />
              <button className="btn btn-primary" onClick={saveLlmKey}>保存</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}); });
}
