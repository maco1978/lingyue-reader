import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Reader } from './ui/Reader';
import { openBook } from './core/openBook';
import type { Book } from './core/types';

function App() {
  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    // 真实文件入口：把用户选择的 File 读成 Uint8Array 传给 openBook(fileName, bytes)
    // const buf = new Uint8Array(await file.arrayBuffer());
    // openBook(file.name, buf).then(setBook).catch(e => setError(String(e)));
    // 以下为内置 TXT 示例，演示完整链路
    const demo = new TextEncoder().encode('第一章 起风\n他站在门口，风把纸片吹起来。\n第二章 下雨\n雨下了起来。');
    openBook('示例.txt', demo).then(setBook).catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  if (error) return <div role="alert">{error}</div>;
  if (!book) return <div>正在打开…</div>;
  return <Reader book={book} />;
}

createRoot(document.getElementById('root')!).render(<App />);
