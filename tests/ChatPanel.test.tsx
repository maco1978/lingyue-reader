import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatPanel } from '../src/ui/ChatPanel';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('ChatPanel', () => {
  it('渲染对话流、输入框与 AI 生成标记', () => {
    const html = renderToStaticMarkup(
      <ChatPanel
        book={{ meta: { id: 'b1', title: '测试书', author: '', format: 'txt', presentation: 'reflowed' }, spine: [], toc: [] }}
        provider={{ chat: vi.fn() }}
        annotations={[]}
        onJump={vi.fn()}
      />
    );
    expect(html).toContain('读书搭子');
    expect(html).toContain('AI 生成');
  });
});
describe('ChatPanel M3.1', () => {
  const base = (
    <ChatPanel
      book={{ meta: { id: 'b1', title: '测试书', author: '', format: 'txt', presentation: 'reflowed' }, spine: [], toc: [] }}
      provider={{ chat: vi.fn() }}
      annotations={[]}
      onJump={vi.fn()}
    />
  );

  it('渲染「总结本章」快捷按钮', () => {
    const html = renderToStaticMarkup(base);
    expect(html).toContain('总结本章');
  });

  it('渲染划线问答输入框与开关', () => {
    const html = renderToStaticMarkup(base);
    expect(html).toContain('划线问答');
    expect(html).toContain('粘贴划线句子（可选）');
  });
});
describe('ChatPanel 总结本章不受残留划线影响', () => {
  it('预置 questionOverride 时忽略 quote，send 收到的 question 无「针对划线句子」前缀', async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>');
    (globalThis as any).window = dom.window;
    (globalThis as any).document = dom.window.document;
    try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch {}
    const chat = vi.fn((..._args: unknown[]) => Promise.resolve({ answer: 'ok', content: '', sourceChapter: 0 }));
    const container = dom.window.document.getElementById('root')!;
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <ChatPanel
          book={{ meta: { id: 'b1', title: '测试书', author: '', format: 'txt', presentation: 'reflowed' }, spine: [], toc: [] }}
          provider={{ chat }}
          annotations={[]}
          onJump={vi.fn()}
        />
      );
    });
    // 展开划线面板并填入 quote
    const toggle = ([...container.querySelectorAll('button')] as HTMLButtonElement[]).find(b => b.textContent === '划线问答')!;
    await act(async () => { toggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    const quoteInput = container.querySelector('input[aria-label="划线问答"]') as HTMLInputElement;
    await act(async () => {
      quoteInput.value = '这段话很有意思';
      quoteInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    // 点总结本章
    const summaryBtn = ([...container.querySelectorAll('button')] as HTMLButtonElement[]).find(b => b.textContent === '总结本章')!;
    await act(async () => { summaryBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    await act(async () => {});
    expect(chat).toHaveBeenCalled();
    // runAgent 经 buildContext 把 question 拼进最后一条 user 消息
    const lastUser = (chat.mock.calls[0]![0] as unknown as { role: string; content: string }[]).filter(m => m.role === 'user').at(-1)!.content;
    expect(lastUser).toContain('请用 3-5 个要点总结当前章节');
    expect(lastUser).not.toContain('针对划线句子');
    expect(lastUser).not.toContain('这段话很有意思');
    root.unmount();
  });
});