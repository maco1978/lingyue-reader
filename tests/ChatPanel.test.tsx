import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatPanel } from '../src/ui/ChatPanel';

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
