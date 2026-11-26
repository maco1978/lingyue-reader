# 聆阅看书 M3.1 — 搭子对话能力增强 Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (- [ ]) syntax.

**Goal:** 在搭子里加「章节总结」快捷按钮与「划线问答」输入框，两项都复用现有 runAgent，不改核心类型与 AgentLoop。

**Architecture:** 只改 src/ui/ChatPanel.tsx + tests/ChatPanel.test.tsx。章节总结 = 预置问题走现有 send 流程；划线问答 = 可选输入框内容拼进 question，不写 chatHistory。

---

### Task 1: ChatPanel 两项增强（TDD）

**Files:** Modify src/ui/ChatPanel.tsx, tests/ChatPanel.test.tsx

- [ ] **Step 1: 先读现有 ChatPanel.tsx 与测试，确认 send() 结构与当前 SSR 测试断言**

Run: read src/ui/ChatPanel.tsx and tests/ChatPanel.test.tsx
Expected: 了解 props（book/provider/annotations/onJump/initialMessages/onPersist/chapterIndex）与 messages/input/loading/error 状态结构。

- [ ] **Step 2: 写失败的测试**

在 tests/ChatPanel.test.tsx 增加：

~~~tsx
describe('M3.1 增强', () => {
  const baseProps = {
    book: { meta: { id: 'b1', title: '测试书', author: '', format: 'txt' as const, presentation: 'reflowed' as const }, spine: [], toc: [] },
    provider: { chat: vi.fn() },
    annotations: [],
    onJump: vi.fn(),
  };

  it('渲染「总结本章」快捷按钮', () => {
    const html = renderToStaticMarkup(<ChatPanel {...baseProps} />);
    expect(html).toContain('总结本章');
  });

  it('渲染可选划线输入框', () => {
    const html = renderToStaticMarkup(<ChatPanel {...baseProps} />);
    expect(html).toContain('划线');
    expect(html).toContain('placeholder');
  });
});
~~~

- [ ] **Step 3: 运行确认失败**

Run: pnpm test tests/ChatPanel.test.tsx
Expected: FAIL（断言的文案不存在）

- [ ] **Step 4: 实现 ChatPanel 增强**

在 ChatPanel.tsx 中：
1. 顶部（消息流上方、标题区）加按钮「总结本章」，onClick 调用现有 send 逻辑传入预置问题「请用 3-5 个要点总结当前章节」。为避免重复代码，把 send 重构为 `send(questionOverride?: string)`，按钮调 `send('请用 3-5 个要点总结当前章节')`，输入框调 `send()`。
2. 输入区加可选 state `quote`，渲染一个 input（placeholder「粘贴划线句子（可选）」），带开关按钮「划线问答」控制展开/收起（初始收起）。
3. 在 send 内构造 question：若 quote.trim() 非空，`const q = '针对划线句子「' + quote.trim() + '」：' + text`；否则 q = text。把 q 传给 runAgent。chatHistory 持久化仍只存 role/content 消息（quote 不单独入库）。
4. 保持 SSR 安全：button/input 均为原生元素，无浏览器 API 在渲染期调用。
5. 组件仍 < 150 行。

- [ ] **Step 5: 运行确认通过并提交**

Run: pnpm test tests/ChatPanel.test.tsx && pnpm test && pnpm run build
Expected: 新增 2 测试通过；全量 ≥79；build 通过。
Commit: git add src/ui/ChatPanel.tsx tests/ChatPanel.test.tsx && git commit -m 'feat: 搭子增加章节总结与划线问答'

---

## Self-Review（已执行）

1. Spec coverage：规格两项能力 → Task 1；不改类型/AgentLoop。
2. Placeholder scan：无 TBD；代码块完整。
3. Type consistency：复用现有 send/runAgent；ChatMessage 仍 {role,content}。

## Execution Handoff

计划保存在 docs/superpowers/plans/2026-11-27-lingyue-m31-chat-enhance.md。
1. Subagent-Driven（推荐） 2. Inline Execution。选哪种？
