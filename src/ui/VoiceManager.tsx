import React, { useState } from 'react';
import type { TTSEngine } from '../core/tts/types';

interface Props {
  engine: TTSEngine;
  cards: { id: string; name: string; voiceId: string; rate: number; reference: 'upload' | 'designed' }[];
  onSave: (card: { id: string; name: string; voiceId: string; rate: number; reference: 'upload' | 'designed' }) => void;
  onRemove: (id: string) => void;
}

/** 音色管理：上传参考音频创建音色，保存为音色卡，支持删除 */
export function VoiceManager({ engine, cards, onSave, onRemove }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');

  async function create() {
    if (!file || !name.trim()) { setStatus('请选择音频文件并填写名称'); return; }
    setStatus('创建中…');
    try {
      const voiceId = await engine.createVoice(file, name.trim());
      onSave({ id: crypto.randomUUID(), name: name.trim(), voiceId, rate: 1, reference: 'upload' });
      setName('');
      setFile(null);
      setStatus('创建成功');
    } catch (e) {
      setStatus('创建失败：' + String(e));
    }
  }

  return (
    <section className="voices" aria-labelledby="voices-title">
      <h1 id="voices-title">音色管理</h1>
      <p className="voices-lead">上传一段参考音频，就能用这个声音朗读整本书。</p>

      <div className="voice-create">
        <input
          type="file"
          accept="audio/*"
          className="lingyue-file"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />
        <input
          type="text"
          placeholder="音色名称"
          aria-label="音色名称"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <button className="btn btn-primary" onClick={() => void create()}>创建音色</button>
      </div>
      <span className="voice-status" role="status">{status}</span>

      {cards.length === 0 ? (
        <p className="voice-empty">还没有音色。创建后，听书时就能在音色列表里选到它。</p>
      ) : (
        <ul className="voice-list">
          {cards.map(c => (
            <li key={c.id} className="voice-row">
              <span className="voice-name">{c.name}</span>
              <span className="voice-meta">{c.reference === 'upload' ? '参考音频' : '文字设计'} · 语速 {c.rate}</span>
              <button onClick={() => onRemove(c.id)} aria-label={'删除音色：' + c.name}>删除</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
