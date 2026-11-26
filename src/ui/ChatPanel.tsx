import React, { useState, useRef, useEffect } from 'react';
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
  const [quote, setQuote] = useState('');
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /** 聊天史是附属数据：存储写满时不阻塞对话本身 */
  function persist(msgs: ChatMsg[]) {
    try {
      onPersist?.(msgs.map(({ role, content }) => ({ role, content })));
    } catch {
      // 落盘失败不影响本轮问答
    }
  }

  async function send(questionOverride?: string) {
    const text = (questionOverride ?? input).trim();
    const q = questionOverride ? '' : quote.trim();
    const question = q
      ? '针对划线句子「' + q.slice(0, 200) + '」：' + text
      : text;
    if (!text || loading) return;
    const history = [...messages, { role: 'user' as const, content: question }];
    setMessages(history);
    // 用户问题即时持久化：报错或中途切视图都不丢提问
    persist(history);
    setInput('');
    setQuote('');
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
      if (!mountedRef.current) return;
      const reply = output.answer || '（模型没有返回内容）';
      const next: ChatMsg[] = [
        ...history,
        { role: 'assistant', content: reply, sourceChapter: output.sourceChapter },
      ];
      setMessages(next);
      persist(next);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
      // 失败时用户问题已在上面持久化，无需重复写
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  return (
    <section className="chat" aria-labelledby="chat-title">
      <header className="chat-head">
        <h1 id="chat-title">读书搭子</h1>
        <p>和《{book.meta.title}》的 AI 伙伴聊聊这本书（AI 生成内容仅供参考）</p>
      </header>

      <div className="chat-log" aria-live="polite">
        {messages.length === 0 && !loading && (
          <p className="chat-empty">可以问情节、理人物关系，或者选中一段话问出处。</p>
        )}
        {messages.map((m, i) => (
          m.role === 'user' ? (
            <div key={i} className="msg msg-user">{m.content}</div>
          ) : (
            <div key={i} className="msg msg-ai">
              <div className="bubble">{m.content}</div>
              <div className="msg-meta">
                <span>AI 生成</span>
                {m.sourceChapter !== undefined && (
                  <button onClick={() => onJump(m.sourceChapter!)}>查看原文</button>
                )}
              </div>
            </div>
          )
        ))}
        {loading && <p className="chat-loading">思考中…</p>}
        {error && <p role="alert" className="chat-error">{error}</p>}
      </div>

      <div className="chat-tools">
        <button type="button" onClick={() => { void send('请用 3-5 个要点总结当前章节'); }} disabled={loading}>总结本章</button>
        <button type="button" onClick={() => setQuoteOpen(o => !o)} aria-expanded={quoteOpen}>划线问答</button>
      </div>
      <div className="chat-quote" hidden={!quoteOpen}>
        <input
          aria-label="划线问答"
          placeholder="粘贴划线句子（可选）"
          value={quote}
          onChange={e => setQuote(e.target.value)}
        />
      </div>

      <form
        className="composer"
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
    </section>
  );
}
