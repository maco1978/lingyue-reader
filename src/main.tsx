import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Reader } from './ui/Reader';
import { AudioPlayer } from './ui/AudioPlayer';
import { VoiceManager } from './ui/VoiceManager';
import { ChatPanel } from './ui/ChatPanel';
import { openBook } from './core/openBook';
import { bookStore } from './core/bookStore';
import { voiceCards } from './core/tts/voiceCards';
import { MossApiEngine } from './core/tts/mossApiEngine';
import { OpenAIProvider } from './core/agent/llmProvider';
import type { Book, Storage } from './core/types';
import type { VoiceCard } from './core/tts/types';
import { collectBookData, applyBookData } from './ui/backup';

const API_KEY_STORAGE = 'lingyue:moss-api-key';
const LLM_CONFIG_STORAGE = 'lingyue:llm-config';

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
  };
}

/** 模块级单例适配器：阅读进度/划线（Reader 注入）与搭子/听书共享同一份 localStorage 书级状态 */
const bookStoreStorage = localStorageAdapter();

const store = bookStore(bookStoreStorage);
const voices = voiceCards(localStorageAdapter());

type View = 'reader' | 'listen' | 'voices' | 'chat';

function App() {
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('reader');
  const [apiKey, setApiKey] = useState(() => window.localStorage.getItem(API_KEY_STORAGE) ?? '');
  const [keyDraft, setKeyDraft] = useState('');
  const [cards, setCards] = useState<VoiceCard[]>(() => voices.list());
  const [llm, setLlm] = useState<LlmConfig>(loadLlmConfig);
  const [llmKeyDraft, setLlmKeyDraft] = useState('');
  const [chatChapter, setChatChapter] = useState(0);

  useEffect(() => {
    // 真实文件入口：把用户选择的 File 读成 Uint8Array 传给 openBook(fileName, bytes)
    // const buf = new Uint8Array(await file.arrayBuffer());
    // openBook(file.name, buf).then(setBook).catch(e => setError(String(e)));
    // 以下为内置 TXT 示例，演示完整链路（阅读与听书共用）
    const demo = new TextEncoder().encode('第一章 起风\n他站在门口，风把纸片吹起来。\n第二章 下雨\n雨下了起来。');
    openBook('示例.txt', demo).then(setBook).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, []);

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

  const engine = apiKey ? new MossApiEngine(apiKey) : null;
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lingyue-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
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
    setChatChapter(chapterIndex);
    setView('reader');
  }, []);

  const handlePersistChat = useCallback((messages: { role: 'user' | 'assistant'; content: string }[]) => {
    if (!book) return;
    store.saveState(book.meta.id, { ...store.loadState(book.meta.id), chatHistory: messages });
  }, [book]);

  if (error) return <div role="alert">{error}</div>;
  if (!book) return <div>正在打开…</div>;

  const chatHistory = store.loadState(book.meta.id).chatHistory;

  return (
    <div style={{ fontFamily: 'system-ui' }}>
      <nav style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #ddd' }}>
        <button onClick={() => setView('reader')}>阅读</button>
        <button onClick={() => setView('listen')}>听书</button>
        <button onClick={() => setView('voices')}>音色管理</button>
        <button onClick={() => setView('chat')}>搭子</button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={handleBackupExport}>备份导出</button>
          <label style={{ cursor: 'pointer' }}>
            备份导入
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void handleBackupImport(f);
                e.target.value = '';
              }}
            />
          </label>
        </span>
      </nav>
      {!apiKey && (
        <div style={{ padding: 8, background: '#fff8e1' }}>
          听书需要 MOSS API Key（存储于浏览器 localStorage，密钥名 {API_KEY_STORAGE}）：
          <input
            type="password"
            placeholder="粘贴 API Key"
            value={keyDraft}
            onChange={e => setKeyDraft(e.target.value)}
          />
          <button onClick={saveApiKey}>保存</button>
        </div>
      )}
      {view === 'reader' && <Reader book={book} initialChapter={chatChapter} storage={bookStoreStorage} />}
      {view === 'listen' && engine && (
        <AudioPlayer
          book={book}
          engine={engine}
          cards={cards}
          initialChapter={Math.max(0, Math.min(
            store.loadState(book.meta.id).audioPosition?.chapterIndex ?? 0,
            book.spine.length - 1,
          ))}
          onPosition={pos => store.saveState(book.meta.id, {
            ...store.loadState(book.meta.id),
            audioPosition: pos,
          })}
        />
      )}
      {view === 'listen' && !engine && <div>请先配置 API Key</div>}
      {view === 'voices' && engine && (
        <VoiceManager engine={engine} cards={cards} onSave={handleSaveCard} onRemove={handleRemoveCard} />
      )}
      {view === 'voices' && !engine && <div>请先配置 API Key</div>}
      {view === 'chat' && provider && (
        // 搭子上下文跟随最新阅读进度（Reader goTo 写入共享 storage），而非仅 onJump 时的快照；
        // 与 Reader.initialChapter 冲突时以 progress 为准
        <ChatPanel
          book={book}
          provider={provider}
          annotations={store.loadState(book.meta.id).annotations}
          onJump={handleJump}
          initialMessages={chatHistory}
          onPersist={handlePersistChat}
          chapterIndex={Math.max(0, Math.min(store.loadState(book.meta.id).progress?.chapterIndex ?? 0, book.spine.length - 1))}
        />
      )}
      {view === 'chat' && !provider && (
        <div style={{ padding: 8, maxWidth: 480, margin: '0 auto' }}>
          <h3>读书搭子</h3>
          <p>搭子需要大模型 API Key（OpenAI 兼容接口）。默认使用腾讯混元 Hy4 Flash（{DEFAULT_LLM.baseUrl} / {DEFAULT_LLM.model}），可在 localStorage「{LLM_CONFIG_STORAGE}」中改 base_url 与 model（如 DeepSeek）。</p>
          <p>
            <input
              type="password"
              placeholder="粘贴 LLM API Key"
              value={llmKeyDraft}
              onChange={e => setLlmKeyDraft(e.target.value)}
            />
            <button onClick={saveLlmKey}>保存</button>
          </p>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}); });
}
