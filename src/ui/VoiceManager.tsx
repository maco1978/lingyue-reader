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
    <div style={{ fontFamily: 'system-ui', maxWidth: 720 }}>
      <h2>音色管理</h2>
      <div>
        <input type="file" accept="audio/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <input placeholder="音色名称" value={name} onChange={e => setName(e.target.value)} />
        <button onClick={() => void create()}>创建音色</button>
        <span style={{ marginLeft: 8 }}>{status}</span>
      </div>
      <ul>
        {cards.map(c => (
          <li key={c.id}>
            {c.name}（rate={c.rate}，{c.reference}）
            <button onClick={() => onRemove(c.id)} style={{ marginLeft: 8 }}>删除</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
