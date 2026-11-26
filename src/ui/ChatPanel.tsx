import React, { useState } from 'react';
import type { Book, Annotation } from '../core/types';
import type { LLMProvider } from '../core/agent/types';
import { runAgent } from '../core/agent/agent';

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  sourceChapter?: number;
}

interface ChatPanelProps {
  book: Book;
  provider: LLMProvider;
  annotations: Annotation[];
  onJump: (chapterIndex: number) => void;
  /** 由 main 从 bookStore.chatHistory 读入 */
  initialMessages?: ChatMsg[];
  /** 回合结束后写回 bookStore.chatHistory */
  onPersist?: (messages: ChatMsg[]) => void;
  /** 当前阅读章节，作为 Agent 上下文 */
  chapterIndex?: number;
}

export function ChatPanel({ book, provider, annotations, onJump, initialMessages = [], onPersist, chapterIndex = 0 }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function send() {
    const question = input.trim();
    if (!question || loading) return;
    const history = [...messages, { role: 'user' as const, content: question }];
    setMessages(history);
    setInput('');
    setLoading(true);
    setError('');
    try {
      const output = await runAgent({
        provider,
        book,
        chapterIndex,
        annotations,
        chatHistory: messages,
        question,
      });
      const reply = output.answer || '（模型没有返回内容）';
      const next: ChatMsg[] = [
        ...history,
        { role: 'assistant', content: reply, sourceChapter: output.sourceChapter },
      ];
      setMessages(next);
      onPersist?.(next.map(({ role, content }) => ({ role, content })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', fontFamily: 'system-ui' }}>
      <h3>读书搭子</h3>
      <p><small>和《{book.meta.title}》的 AI 伙伴聊聊这本书（AI 生成内容仅供参考）</small></p>
      <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 120 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', background: m.role === 'user' ? '#e3f2fd' : '#f1f1f1', padding: 8, borderRadius: 8, maxWidth: '80%' }}>
            <div>{m.content}</div>
            {m.role === 'assistant' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <small>AI 生成</small>
                {m.sourceChapter !== undefined && (
                  <button onClick={() => onJump(m.sourceChapter!)}>查看原文</button>
                )}
              </div>
            )}
          </div>
        ))}
        {loading && <div>思考中…</div>}
        {error && <div role="alert" style={{ color: '#b00' }}>{error}</div>}
      </div>
      <form
        style={{ display: 'flex', gap: 8, marginTop: 12 }}
        onSubmit={e => { e.preventDefault(); void send(); }}
      >
        <input
          aria-label="向读书搭子提问"
          placeholder="问点什么，比如「主角为什么这么做？」"
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button type="submit" disabled={loading || !input.trim()}>发送</button>
      </form>
    </div>
  );
}
