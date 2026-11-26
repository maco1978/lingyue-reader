import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Reader } from './ui/Reader';
import { AudioPlayer } from './ui/AudioPlayer';
import { VoiceManager } from './ui/VoiceManager';
import { openBook } from './core/openBook';
import { bookStore } from './core/bookStore';
import { voiceCards } from './core/tts/voiceCards';
import { MossApiEngine } from './core/tts/mossApiEngine';
import type { Book, Storage } from './core/types';
import type { VoiceCard } from './core/tts/types';

const API_KEY_STORAGE = 'lingyue:moss-api-key';

/** localStorage → Storage 适配器（bookStore / voiceCards 同款） */
function localStorageAdapter(): Storage {
  return {
    get: k => window.localStorage.getItem(k),
    set: (k, v) => window.localStorage.setItem(k, v),
  };
}

const store = bookStore(localStorageAdapter());
const voices = voiceCards(localStorageAdapter());

type View = 'reader' | 'listen' | 'voices';

function App() {
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<View>('reader');
  const [apiKey, setApiKey] = useState(() => window.localStorage.getItem(API_KEY_STORAGE) ?? '');
  const [keyDraft, setKeyDraft] = useState('');
  const [cards, setCards] = useState<VoiceCard[]>(() => voices.list());

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

  const engine = apiKey ? new MossApiEngine(apiKey) : null;

  const handleSaveCard = useCallback((card: VoiceCard) => {
    voices.save(card);
    setCards(voices.list());
  }, []);
  const handleRemoveCard = useCallback((id: string) => {
    voices.remove(id);
    setCards(voices.list());
  }, []);

  if (error) return <div role="alert">{error}</div>;
  if (!book) return <div>正在打开…</div>;

  return (
    <div style={{ fontFamily: 'system-ui' }}>
      <nav style={{ display: 'flex', gap: 8, padding: 8, borderBottom: '1px solid #ddd' }}>
        <button onClick={() => setView('reader')}>阅读</button>
        <button onClick={() => setView('listen')}>听书</button>
        <button onClick={() => setView('voices')}>音色管理</button>
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
      {view === 'reader' && <Reader book={book} />}
      {view === 'listen' && engine && (
        <AudioPlayer
          book={book}
          engine={engine}
          cards={cards}
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
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
