import React from 'react';
import { createRoot } from 'react-dom/client';
import { Reader } from './ui/Reader';
import { buildTxtBook } from './core/reflowTxt';

const demo = buildTxtBook('示例.txt', new TextEncoder().encode('第一章 起风\n他站在门口，风把纸片吹起来。\n第二章 下雨\n雨下了起来。'));

function App() {
  return <Reader book={demo} />;
}

createRoot(document.getElementById('root')!).render(<App />);
