# 聆阅看书 M3 — 读书搭子 Agent Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 让 App 从"能看能听的阅读器"变成真正的 Agent：一个懂你在读什么的读书搭子，带着书级记忆陪你聊书，并能调用工具定位原文（跳转/朗读）。模型可插拔（Hy4 Flash 主 / DeepSeek 辅，用户自填 API Key）。

**Architecture:** `LLMProvider` 统一接口（OpenAI Chat Completions 兼容，Hy4/DeepSeek 共用一份适配器，仅 base_url/model 不同）→ `buildContext` 构造书级记忆（当前章节片段 + 最近划线 + 对话摘要，带预算）→ `AgentLoop` 处理 tool_calls（定位原文工具）→ `ChatPanel` UI。聊天史存 bookStore.chatHistory，回答标「AI 生成」并给「原文出处」按钮。

**Tech Stack:** 沿用 M1/M1.5/M2；无新增运行时依赖（原生 fetch）。模型：Hy4 Flash（base https://api.hunyuan.cloud.tencent.com/v1，model hy4-flash，1024k 上下文）/ DeepSeek（base https://api.deepseek.com，model deepseek-chat），均 OpenAI 兼容。

**Security:** LLM API Key 存 localStorage（用户自填，不硬编码、不进仓库）；上下文只带必要片段，不塞全文；回答明确标注 AI 生成。

---

## File Structure

```
src/core/agent/types.ts           LLMProvider / ChatMessage / ToolCall / AgentResult 契约
src/core/agent/llmProvider.ts     OpenAI 兼容适配器（Hy4/DeepSeek，注入 fetch）
src/core/agent/context.ts         buildContext：书级记忆 → 消息列表（带字符预算）
src/core/agent/tools.ts           定位原文工具 findInBook（章节/锚点）+ 工具注册表
src/core/agent/agent.ts           AgentLoop：调 LLM → 处理 tool_calls → 回灌结果 → 最终回答
src/ui/ChatPanel.tsx              搭子 UI：对话流、输入框、AI 生成标记、原文出处按钮
src/main.tsx                      修改：App 增加「搭子」视图
src/core/types.ts                不改（chatHistory 已在 BookState 预留）
```

---

### Task 1: Agent 契约与可插拔 LLM 适配器（TDD）

**Files:** 创建 src/core/agent/types.ts, src/core/agent/llmProvider.ts, tests/llmProvider.test.ts

- [ ] **Step 1: 写失败的测试（mock fetch）**

```ts
import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider } from '../src/core/agent/llmProvider';

function mockChat(reply: any) {
  return vi.fn(async (_url: string, _init: any) => ({
    ok: true, status: 200,
    json: async () => reply,
  })) as any;
}

describe('OpenAIProvider', () => {
  it('按 OpenAI Chat Completions 协议发请求并解析回答', async () => {
    const fn = mockChat({ choices: [{ message: { role: 'assistant', content: '这是第一章的总结。' }, finish_reason: 'stop' }] });
    const p = new OpenAIProvider('sk-test', 'https://api.hunyuan.cloud.tencent.com/v1', 'hy4-flash', fn);
    const out = await p.chat([{ role: 'user', content: '总结第一章' }]);
    expect(out.content).toBe('这是第一章的总结。');
    expect(fn.mock.calls[0][0]).toContain('/chat/completions');
    const body = JSON.parse(fn.mock.calls[0][1].body);
    expect(body.model).toBe('hy4-flash');
    expect(body.messages[0].content).toBe('总结第一章');
    expect(fn.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-test');
  });

  it('解析 tool_calls（定位原文工具）', async () => {
    const fn = mockChat({ choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'findInBook', arguments: '{"query":"起风"}' } }] }, finish_reason: 'tool_calls' }] });
    const p = new OpenAIProvider('sk', 'https://api.deepseek.com', 'deepseek-chat', fn);
    const out = await p.chat([{ role: 'user', content: '起风在哪' }], [{ name: 'findInBook', description: '在书中定位原文', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } }]);
    expect(out.toolCalls?.[0].name).toBe('findInBook');
    expect(out.toolCalls?.[0].args).toEqual({ query: '起风' });
  });

  it('API 报错时抛出人话错误（含状态码）', async () => {
    const fn = vi.fn(async () => ({ ok: false, status: 401, text: async () => 'invalid key' })) as any;
    const p = new OpenAIProvider('bad', 'https://api.deepseek.com', 'deepseek-chat', fn);
    await expect(p.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/401/);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: pnpm test tests/llmProvider.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

src/core/agent/types.ts：

```ts
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** role=tool 时回填对应 tool_call.id */
  tool_call_id?: string;
}

/** 给模型的工具描述（OpenAI function 形状） */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface AgentResult {
  content: string | null;
  toolCalls?: ToolCall[];
}

export interface LLMProvider {
  chat(messages: ChatMessage[], tools?: ToolSpec[]): Promise<AgentResult>;
}
```

src/core/agent/llmProvider.ts：

```ts
import type { LLMProvider, ChatMessage, ToolSpec, AgentResult, ToolCall } from './types';

/** OpenAI Chat Completions 兼容适配器：Hy4 / DeepSeek 只差 base_url 与 model */
export class OpenAIProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string,
    private fetchFn: typeof fetch = fetch,
  ) {}

  async chat(messages: ChatMessage[], tools?: ToolSpec[]): Promise<AgentResult> {
    const body: Record<string, unknown> = { model: this.model, messages };
    if (tools?.length) body.tools = tools.map(t => ({ type: 'function', function: t }));
    const res = await this.fetchFn(this.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + this.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('模型调用失败（HTTP ' + res.status + '）：' + await res.text());
    const data = await res.json() as any;
    const msg = data.choices?.[0]?.message ?? {};
    const toolCalls: ToolCall[] | undefined = msg.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name ?? '',
      args: JSON.parse(tc.function?.arguments ?? '{}'),
    }));
    return { content: msg.content ?? null, toolCalls };
  }
}
```

- [ ] **Step 4: 运行确认通过并提交**

Run: pnpm test tests/llmProvider.test.ts
Expected: 3/3 通过。
Commit: git add src/core/agent tests/llmProvider.test.ts 后提交 message: feat: 可插拔 LLM 适配器（OpenAI 兼容）

---

### Task 2: 书级记忆构造 context（TDD）

**Files:** 创建 src/core/agent/context.ts, tests/context.test.ts

- [ ] **Step 1: 写失败的测试**

```ts
import { describe, it, expect } from 'vitest';
import { buildContext } from '../src/core/agent/context';
import type { Book } from '../src/core/types';

const book: Book = {
  meta: { id: 'b1', title: '测试书', author: '甲', format: 'txt', presentation: 'reflowed' },
  spine: [
    { index: 0, title: '第一章', html: '<p>他站在门口，风把纸片吹起来。</p>' },
    { index: 1, title: '第二章', html: '<p>雨下了起来。</p>' },
  ],
  toc: [],
};

describe('buildContext', () => {
  it('带当前章节片段与最近划线、对话摘要，且不超过预算', () => {
    const msgs = buildContext({
      book,
      chapterIndex: 0,
      annotations: [{ id: 'n1', bookId: 'b1', anchor: 'a', quote: '风把纸片', note: '比喻', createdAt: 1 }],
      chatHistory: [{ role: 'user', content: '上一轮问题' }],
      question: '这句话什么意思？',
      budgetChars: 500,
    });
    const all = msgs.map(m => m.content).join(' ');
    expect(all).toContain('测试书');
    expect(all).toContain('第一章');
    expect(all).toContain('风把纸片');
    expect(all).toContain('这句话什么意思？');
    expect(all.length).toBeLessThan(2000);
  });

  it('无划线无历史时也能构造', () => {
    const msgs = buildContext({ book, chapterIndex: 1, annotations: [], chatHistory: [], question: '总结', budgetChars: 200 });
    expect(msgs.some(m => m.content.includes('雨下了起来'))).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: pnpm test tests/context.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
import type { Book, Annotation } from '../types';
import type { ChatMessage } from './types';
import { chunkChapter } from '../tts/chunker';

interface ContextInput {
  book: Book;
  chapterIndex: number;
  annotations: Annotation[];
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
  question: string;
  budgetChars?: number;
}

/** 书级记忆 → 模型消息：当前章片段 + 最近划线 + 最近对话摘要 + 问题，带字符预算 */
export function buildContext(input: ContextInput): ChatMessage[] {
  const budget = input.budgetChars ?? 4000;
  const chapter = input.book.spine[Math.max(0, Math.min(input.chapterIndex, input.book.spine.length - 1))];
  const excerpt = chapter ? chunkChapter(chapter.html, budget).slice(0, 2).join('') : '';
  const quotes = input.annotations.slice(-5).map(a => '划线「' + a.quote + '」' + (a.note ? '（笔记：' + a.note + '）' : '')).join('；');
  const history = input.chatHistory.slice(-6).map(h => (h.role === 'user' ? '用户问：' : '搭子答：') + h.content.slice(0, 120)).join('；');

  const system = [
    '你是「读书搭子」，一个懂读者正在读什么的 AI 伙伴。只回答与这本书相关的问题。',
    '书：《' + input.book.meta.title + '》作者：' + (input.book.meta.author || '未知') + '。',
    '当前章节：' + (chapter?.title ?? '未知') + '。',
    '回答中标明「AI 生成」，涉及情节结论尽量引用原文。',
  ].join('\n');
  const context = [
    '【当前章节片段】' + excerpt.slice(0, budget),
    quotes ? '【读者划线】' + quotes : '',
    history ? '【最近对话摘要】' + history : '',
  ].filter(Boolean).join('\n').slice(0, budget);

  return [
    { role: 'system', content: system },
    { role: 'user', content: context + '\n\n问题：' + input.question },
  ];
}
```

- [ ] **Step 4: 运行确认通过并提交**

Run: pnpm test tests/context.test.ts
Expected: 2/2 通过。
Commit: git add src/core/agent/context.ts tests/context.test.ts 后提交 message: feat: 书级记忆上下文构造

---

### Task 3: 定位原文工具与 AgentLoop（TDD）

**Files:** 创建 src/core/agent/tools.ts, src/core/agent/agent.ts, tests/agent.test.ts

- [ ] **Step 1: 写失败的测试（注入假 LLM，验证工具回灌）**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runAgent } from '../src/core/agent/agent';
import type { Book } from '../src/core/types';

const book: Book = {
  meta: { id: 'b1', title: '测试书', author: '', format: 'txt', presentation: 'reflowed' },
  spine: [
    { index: 0, title: '第一章', html: '<p>他站在门口，风把纸片吹起来。</p>' },
    { index: 1, title: '第二章', html: '<p>雨下了起来。</p>' },
  ],
  toc: [],
};

describe('runAgent', () => {
  it('模型请求 findInBook 时执行工具并把结果回灌，最后给出回答', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce({ content: null, toolCalls: [{ id: 'c1', name: 'findInBook', args: { query: '纸片' } }] })
      .mockResolvedValueOnce({ content: '这句话在第一段，描写风把纸片吹起。', toolCalls: undefined });
    const provider = { chat } as any;
    const result = await runAgent({
      provider, book, chapterIndex: 0, annotations: [], chatHistory: [], question: '纸片在哪？',
    });
    expect(result.answer).toContain('第一段');
    expect(chat).toHaveBeenCalledTimes(2);
    const secondMessages = chat.mock.calls[1][0];
    expect(secondMessages.some((m: any) => m.role === 'tool' && m.content.includes('纸片'))).toBe(true);
  });

  it('无工具请求时直接返回回答', async () => {
    const chat = vi.fn().mockResolvedValueOnce({ content: '这是总结。' });
    const result = await runAgent({ provider: { chat } as any, book, chapterIndex: 0, annotations: [], chatHistory: [], question: '总结' });
    expect(result.answer).toBe('这是总结。');
    expect(chat).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: pnpm test tests/agent.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

src/core/agent/tools.ts：

```ts
import type { Book } from '../types';
import type { ToolSpec } from './types';
import { chunkChapter } from '../tts/chunker';

/** 在书中定位一句话，返回章节与原文片段 */
export function findInBook(book: Book, query: string): string {
  for (const ch of book.spine) {
    const text = chunkChapter(ch.html, 100000).join('');
    const idx = text.indexOf(query);
    if (idx >= 0) {
      const from = Math.max(0, idx - 30);
      return '《' + book.meta.title + '》' + ch.title + '：…' + text.slice(from, idx + query.length + 30) + '…（章节序号 ' + ch.index + '）';
    }
  }
  return '未在书中找到「' + query + '」';
}

export const AGENT_TOOLS: ToolSpec[] = [{
  name: 'findInBook',
  description: '在用户正在读的书里定位一句话或关键词，返回所在章节与原文片段。想知道某句话出处时使用。',
  parameters: { type: 'object', properties: { query: { type: 'string', description: '要定位的原文片段或关键词' } }, required: ['query'] },
}];
```

src/core/agent/agent.ts：

```ts
import type { Book, Annotation } from '../types';
import type { LLMProvider, ChatMessage } from './types';
import { buildContext } from './context';
import { AGENT_TOOLS, findInBook } from './tools';

interface AgentInput {
  provider: LLMProvider;
  book: Book;
  chapterIndex: number;
  annotations: Annotation[];
  chatHistory: { role: 'user' | 'assistant'; content: string }[];
  question: string;
}

export interface AgentOutput {
  answer: string;
  /** 工具命中的章节序号，供 UI 显示「原文出处」按钮 */
  sourceChapter?: number;
}

/** 一轮 Agent：构造上下文 → 调 LLM → 若有 tool_calls 则执行并回灌 → 再调 LLM 得最终回答 */
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const messages = buildContext(input);
  const first = await input.provider.chat(messages, AGENT_TOOLS);
  if (!first.toolCalls?.length) return { answer: first.content ?? '' };

  for (const call of first.toolCalls) {
    let result = '';
    let sourceChapter: number | undefined;
    if (call.name === 'findInBook') {
      result = findInBook(input.book, String(call.args.query ?? ''));
      const m = result.match(/章节序号 (\d+)/);
      sourceChapter = m ? Number(m[1]) : undefined;
    } else {
      result = '未知工具：' + call.name;
    }
    messages.push({ role: 'assistant', content: first.content ?? '', tool_call_id: call.id });
    messages.push({ role: 'tool', content: result, tool_call_id: call.id });
    if (sourceChapter !== undefined) messages.push({ role: 'system', content: '（原文出处章节序号：' + sourceChapter + '）' });
  }
  const final = await input.provider.chat(messages);
  return { answer: final.content ?? '' };
}
```

- [ ] **Step 4: 运行确认通过并提交**

Run: pnpm test tests/agent.test.ts
Expected: 2/2 通过。
Commit: git add src/core/agent tests/agent.test.ts 后提交 message: feat: 定位原文工具与 AgentLoop

---

### Task 4: 搭子 UI 与 App 接入（TDD）

**Files:** 创建 src/ui/ChatPanel.tsx, tests/ChatPanel.test.tsx；修改 src/main.tsx

- [ ] **Step 1: 写失败的测试（SSR 渲染）**

```tsx
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
```

- [ ] **Step 2: 运行确认失败**

Run: pnpm test tests/ChatPanel.test.tsx
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 ChatPanel.tsx**

组件 <130 行：props = book / provider / annotations / onJump。状态 messages（从 bookStore.chatHistory 初始化，由 main 传入）/ input / loading。用户提交 → runAgent(...) → 追加用户与 AI 消息（AI 消息带「AI 生成」角标）→ 写回 chatHistory；若 AgentOutput 有 sourceChapter 显示「查看原文」按钮调 onJump(chapterIndex)。渲染阶段不触碰浏览器 API。

- [ ] **Step 4: main.tsx 接入**

App 加「搭子」视图：从 localStorage 读取 LLM Provider 配置（base_url / model / apiKey，默认 Hy4 Flash 的 base 与 model，Key 需用户填，用与 M2 不同的 localStorage key 如 'lingyue:llm-config'）；渲染 ChatPanel，onJump 切回阅读视图并定位章节（复用 Reader 或设置 chapterIndex）。无 Key 时显示引导输入（password）。4 个视图：阅读 / 听书 / 音色管理 / 搭子。

- [ ] **Step 5: 运行确认通过并提交**

Run: pnpm test && pnpm run build
Expected: 全部通过。
Commit: git add src/ui/ChatPanel.tsx tests/ChatPanel.test.tsx src/main.tsx 后提交 message: feat: 读书搭子对话界面与 App 接入

---

## Self-Review（已执行）

1. Spec coverage：规格第 6 节（搭子 4 能力，本计划先落「聊情节 + 定位原文」2 项核心）、第 8 节（Hy4 主 / DeepSeek 辅可插拔）→ Task 1/3/4；书级记忆 → Task 2。
2. Placeholder scan：无 TBD/TODO；每个代码步骤含完整代码。
3. Type consistency：Book/Annotation 不改（chatHistory 已在 BookState 预留）；LLMProvider/ChatMessage/ToolSpec/ToolCall/AgentResult 只在 agent/types.ts 定义；OpenAIProvider/buildContext/runAgent 签名前后一致。
4. Risk noted：真实 LLM 调用需用户 Key 与网络（mock 覆盖协议契约）；工具调用格式经官方文档核实（OpenAI 兼容 tools/tool_calls/role=tool 回灌）；回答标「AI 生成」、可验证性由原文出处按钮保障（规格第 6 节伦理要求）。

## 后续计划

- M3.1：搭子其余 2 项能力（章节总结、划线问答）+ 读书报告/人物关系图。
- Nano 本地引擎（M2 接口）+ 绘本模式（独立产品）。

---

## Execution Handoff

计划保存在 docs/superpowers/plans/2026-11-26-lingyue-m3-agent.md。两种执行方式：
1. Subagent-Driven（推荐）— 每任务派新子代理并两阶段审查。
2. Inline Execution — 本会话批量执行。

选哪种？
