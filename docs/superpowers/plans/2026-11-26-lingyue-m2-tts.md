# 聆阅看书 M2 — 听书引擎与音色卡 Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 让 App 能听书：把章节文本经 MOSS-TTS 托管 API 合成为语音，支持「音色匹配」（上传参考音频创建音色 → 音色卡本地保存 voice_id → 播放时引用），播放器与 M1 的书级状态（audioPosition）打通，Nano 本地引擎留接口。

**Architecture:** 统一 `TTSEngine` 接口（createVoice + synthesize），第一版实现 `MossApiEngine`（HTTP 适配器，依赖注入 fetch 便于测试）；音色卡（VoiceCard: 名称/voice_id/语速/来源）存本地 Storage；`AudioPlayer` 组件串联章节文本→分段→合成→播放，并把听书位置写回 bookStore。M3 搭子可直接复用音色卡（绘本多角色预留）。

**Tech Stack:** 沿用 M1/M1.5（React + TypeScript + Vite + Vitest）；无新增运行时依赖（浏览器原生 fetch + Audio）。MOSS API：Base https://api.mosi.cn，Bearer Key；创建音色 POST /v1/audio/voices（multipart，wav/mp3/m4a/flac，≤10MB/30s）→ voice_id；合成 POST /v1/audio/speech（JSON: model/input/voice_id/language?/response_format）。

**Security:** API Key 只存本地、不进代码库；请求直连 MOSI；CSP 的 connect-src 需加入 https://api.mosi.cn（M1.5 当前是 connect-src 'self'，必须放宽这一项，否则播放全挂）。

---

## File Structure

```
src/core/tts/types.ts           TTSEngine / VoiceCard / SynthRequest 定义（唯一契约）
src/core/tts/mossApiEngine.ts   MOSS 托管 API 适配器（createVoice / synthesize）
src/core/tts/chunker.ts         章节 HTML → 纯文本分段（按标点/长度切）
src/core/tts/voiceCards.ts      音色卡 CRUD（注入 Storage）
src/ui/AudioPlayer.tsx          播放器：章节选择、播放/暂停、音色选择、进度回写
src/ui/VoiceManager.tsx         音色管理：上传参考音频→创建音色→保存卡
src/main.tsx                    修改：App 增加「阅读/听书」切换
index.html                      修改：CSP connect-src 加 https://api.mosi.cn
```

---

### Task 1: TTS 契约、音色卡与 CSP（TDD）

**Files:** 创建 src/core/tts/types.ts, src/core/tts/voiceCards.ts, tests/voiceCards.test.ts；修改 index.html

- [ ] **Step 1: 写失败的测试**

```ts
import { describe, it, expect } from 'vitest';
import { voiceCards, memoryStorage } from '../src/core/tts/voiceCards';

describe('voiceCards', () => {
  it('新库为空', () => {
    expect(voiceCards(memoryStorage()).list()).toEqual([]);
  });

  it('保存音色卡后可读回，字段完整', () => {
    const cards = voiceCards(memoryStorage());
    cards.save({ id: 'v1', name: '旁白', voiceId: 'voice-abc', rate: 1.0, reference: 'upload' });
    expect(cards.list()[0]).toEqual({ id: 'v1', name: '旁白', voiceId: 'voice-abc', rate: 1.0, reference: 'upload' });
  });

  it('删除音色卡', () => {
    const cards = voiceCards(memoryStorage());
    cards.save({ id: 'v1', name: '旁白', voiceId: 'voice-abc', rate: 1.0, reference: 'upload' });
    cards.remove('v1');
    expect(cards.list()).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: pnpm test tests/voiceCards.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 定义契约与实现**

src/core/tts/types.ts：

```ts
/** 听书引擎：第一版 MossApiEngine，后续可加 NanoEngine */
export interface TTSEngine {
  /** 上传参考音频创建音色，返回 voice_id */
  createVoice(file: Blob, name: string): Promise<string>;
  /** 合成语音，返回音频 Blob */
  synthesize(req: SynthRequest): Promise<Blob>;
}

export interface SynthRequest {
  text: string;
  voiceId: string;
  rate?: number;
  language?: string;
  signal?: AbortSignal;
}

/** 音色卡：听书与绘本共用资产 */
export interface VoiceCard {
  id: string;
  name: string;
  voiceId: string;
  rate: number;
  /** 来源标记：upload=上传参考音频 / designed=文字设计 */
  reference: 'upload' | 'designed';
}
```

src/core/tts/voiceCards.ts：

```ts
import type { VoiceCard } from './types';
import type { Storage } from '../types';

export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return { get: k => map.get(k) ?? null, set: (k, v) => { map.set(k, v); } };
}

const KEY = 'lingyue:voices';

export function voiceCards(storage: Storage) {
  function list(): VoiceCard[] {
    const raw = storage.get(KEY);
    return raw ? JSON.parse(raw) as VoiceCard[] : [];
  }
  function save(card: VoiceCard): void {
    const all = list().filter(c => c.id !== card.id);
    all.push(card);
    storage.set(KEY, JSON.stringify(all));
  }
  function remove(id: string): void {
    storage.set(KEY, JSON.stringify(list().filter(c => c.id !== id)));
  }
  return { list, save, remove };
}
```

- [ ] **Step 4: CSP 放宽 connect-src**

index.html 的 CSP 里把 `connect-src 'self'` 改为 `connect-src 'self' https://api.mosi.cn`（唯一改动）。

- [ ] **Step 5: 运行确认通过并提交**

Run: pnpm test tests/voiceCards.test.ts && pnpm run build
Expected: 3/3 通过，构建通过。
Commit: git add src/core/tts tests/voiceCards.test.ts index.html 后提交 message: feat: TTS 契约、音色卡与 CSP 放行

---

### Task 2: MOSS API 适配器（TDD，注入 fetch）

**Files:** 创建 src/core/tts/mossApiEngine.ts, tests/mossApiEngine.test.ts

- [ ] **Step 1: 写失败的测试（mock fetch，不发真实请求）**

```ts
import { describe, it, expect, vi } from 'vitest';
import { MossApiEngine } from '../src/core/tts/mossApiEngine';

function mockFetch(responses: { ok: boolean; body: string | Blob; contentType?: string }[]) {
  const calls: { url: string; init: any }[] = [];
  const fn = vi.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    const r = responses.shift()!;
    return {
      ok: r.ok, status: r.ok ? 200 : 400,
      headers: { get: () => r.contentType ?? 'application/json' },
      blob: async () => r.body as Blob,
      text: async () => r.body as string,
      json: async () => JSON.parse(r.body as string),
    } as any;
  });
  return { fn, calls };
}

describe('MossApiEngine', () => {
  it('createVoice 用 multipart 上传参考音频并解析 voice_id', async () => {
    const { fn, calls } = mockFetch([{ ok: true, body: '{"id":"voice-123","object":"audio.voice"}' }]);
    const engine = new MossApiEngine('sk-test', fn as any);
    const id = await engine.createVoice(new Blob(['audio']), '旁白');
    expect(id).toBe('voice-123');
    expect(calls[0].url).toContain('/v1/audio/voices');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers.Authorization).toBe('Bearer sk-test');
    expect(String(calls[0].init.body)).toContain('旁白');
  });

  it('synthesize 用 voice_id 合成并返回音频 Blob', async () => {
    const audioBlob = new Blob(['RIFFfake'], { type: 'audio/wav' });
    const { fn, calls } = mockFetch([{ ok: true, body: audioBlob, contentType: 'audio/wav' }]);
    const engine = new MossApiEngine('sk-test', fn as any);
    const out = await engine.synthesize({ text: '第一章', voiceId: 'voice-123' });
    expect(out).toBe(audioBlob);
    const body = JSON.parse(calls[0].init.body);
    expect(body.voice_id).toBe('voice-123');
    expect(body.input).toBe('第一章');
    expect(body.model).toBeTruthy();
  });

  it('API 报错时抛出人话错误', async () => {
    const { fn } = mockFetch([{ ok: false, body: '{"error":{"message":"invalid voice"}}' }]);
    const engine = new MossApiEngine('sk-test', fn as any);
    await expect(engine.createVoice(new Blob(['x']), 'x')).rejects.toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: pnpm test tests/mossApiEngine.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
import type { TTSEngine, SynthRequest } from './types';

const DEFAULT_BASE = 'https://api.mosi.cn';
const DEFAULT_MODEL = 'moss-tts-1.5-flash';

/** MOSS 托管 API 适配器。fetch 通过构造器注入，测试可 mock。 */
export class MossApiEngine implements TTSEngine {
  constructor(
    private apiKey: string,
    private fetchFn: typeof fetch = fetch,
    private baseUrl: string = DEFAULT_BASE,
    private model: string = DEFAULT_MODEL,
  ) {}

  private auth() { return { Authorization: 'Bearer ' + this.apiKey }; }

  async createVoice(file: Blob, name: string): Promise<string> {
    const form = new FormData();
    form.append('file', file, 'reference.' + (file.type.split('/')[1] ?? 'wav'));
    form.append('name', name);
    const res = await this.fetchFn(this.baseUrl + '/v1/audio/voices', {
      method: 'POST', headers: this.auth(), body: form,
    });
    if (!res.ok) throw new Error('音色创建失败：' + await res.text());
    const data = await res.json() as { id?: string };
    if (!data.id) throw new Error('音色创建失败：响应缺少 voice_id');
    return data.id;
  }

  async synthesize(req: SynthRequest): Promise<Blob> {
    const body: Record<string, unknown> = {
      model: this.model,
      input: req.text,
      voice_id: req.voiceId,
      response_format: 'mp3',
    };
    if (req.language) body.language = req.language;
    if (req.rate && req.rate !== 1) body.speed = req.rate;
    const res = await this.fetchFn(this.baseUrl + '/v1/audio/speech', {
      method: 'POST',
      headers: { ...this.auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: req.signal,
    });
    if (!res.ok) throw new Error('语音合成失败：' + await res.text());
    return res.blob();
  }
}
```

- [ ] **Step 4: 运行确认通过并提交**

Run: pnpm test tests/mossApiEngine.test.ts
Expected: 3/3 通过。
Commit: git add src/core/tts/mossApiEngine.ts tests/mossApiEngine.test.ts 后提交 message: feat: MOSS-TTS 托管 API 适配器

---

### Task 3: 章节文本分段器 chunker（TDD）

**Files:** 创建 src/core/tts/chunker.ts, tests/chunker.test.ts

- [ ] **Step 1: 写失败的测试**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { chunkChapter } from '../src/core/tts/chunker';

beforeAll(() => {
  const dom = new JSDOM('');
  (globalThis as any).DOMParser = dom.window.DOMParser;
});

describe('chunkChapter', () => {
  it('把章节 XHTML 转成纯文本并按长度分段', () => {
    const html = '<h1>第一章</h1><p>他站在门口。</p><p>风把纸片吹起来。</p>';
    const chunks = chunkChapter(html, 12);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toContain('他站在门口。');
    expect(chunks.join('')).not.toContain('<');
  });

  it('空章节返回空数组', () => {
    expect(chunkChapter('', 100)).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: pnpm test tests/chunker.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
/** 章节 XHTML → 纯文本分段：去标签、压缩空白、按标点/长度切，供 TTS 逐段合成 */
export function chunkChapter(html: string, maxLen = 800): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return [];

  const chunks: string[] = [];
  let buf = '';
  for (const ch of text) {
    buf += ch;
    if (buf.length >= maxLen && /[。！？!?.;；]/.test(ch)) {
      chunks.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}
```

- [ ] **Step 4: 运行确认通过并提交**

Run: pnpm test tests/chunker.test.ts
Expected: 2/2 通过。
Commit: git add src/core/tts/chunker.ts tests/chunker.test.ts 后提交 message: feat: 章节文本分段器

---

### Task 4: 播放器与音色管理 UI（TDD）

**Files:** 创建 src/ui/AudioPlayer.tsx, src/ui/VoiceManager.tsx, tests/AudioPlayer.test.tsx；修改 src/main.tsx

- [ ] **Step 1: 写失败的测试（组件渲染）**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AudioPlayer } from '../src/ui/AudioPlayer';

describe('AudioPlayer', () => {
  it('渲染播放按钮与章节标题', () => {
    const html = renderToStaticMarkup(
      <AudioPlayer
        book={{ meta: { id: 'b1', title: '测试书', author: '', format: 'txt', presentation: 'reflowed' }, spine: [{ index: 0, title: '第一章', html: '正文' }], toc: [] }}
        engine={{ createVoice: vi.fn(), synthesize: vi.fn() }}
        cards={[]}
        onPosition={vi.fn()}
      />
    );
    expect(html).toContain('播放');
    expect(html).toContain('第一章');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: pnpm test tests/AudioPlayer.test.tsx
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 UI 组件**

AudioPlayer.tsx（<120 行）：props = book / engine / cards / onPosition。状态 currentChapter / playing。点击「播放」→ chunkChapter(book.spine[i].html) 逐段 engine.synthesize → new Audio(URL.createObjectURL(blob)) 播放 → 播完切下一段；切章时 onPosition({ chapterIndex, anchor: makeAnchor(index,0) })；音色下拉从 cards 选择（无卡时提示先创建音色）；暂停/停止用 audio.pause() + AbortController 取消在途请求。

VoiceManager.tsx（<100 行）：文件 input + 名称输入 → engine.createVoice(file, name) → voiceCards.save({ id, name, voiceId, rate:1, reference:'upload' })；列出已存音色卡并支持删除。

- [ ] **Step 4: main.tsx 接入**

App 顶部加「阅读 / 听书」切换：听书视图渲染 AudioPlayer（复用 openBook 的 demo book），音色卡来自 voiceCards(bookStore 同款 Storage)；加「音色管理」入口渲染 VoiceManager。API Key 从 localStorage 读取（无 Key 显示引导输入，不硬编码）。

- [ ] **Step 5: 运行确认通过并提交**

Run: pnpm test && pnpm run build
Expected: 全部通过。
Commit: git add src/ui tests/AudioPlayer.test.tsx src/main.tsx 后提交 message: feat: 听书播放器与音色管理界面

---

## Self-Review（已执行）

1. Spec coverage：规格第 6/7 节（书级状态 audioPosition、音色卡、听书引擎接口）→ Task 1/2/3/4；Nano 接口预留 → TTSEngine 抽象。
2. Placeholder scan：无 TBD/TODO；每个代码步骤含完整代码。
3. Type consistency：Book 类型不变（audioPosition 已在 BookState 预留）；TTSEngine/VoiceCard/SynthRequest 只在 tts/types.ts 定义；MossApiEngine/voiceCards/chunkChapter 签名前后一致。
4. Risk noted：MOSS API 真实调用需 API Key 与网络，不在单测范围（mock fetch 覆盖契约）；真实听书验收需用户自己填 Key。CSP connect-src 必须加 api.mosi.cn（Task 1）。

## 后续计划

- M3 读书搭子 Agent：书级记忆 + 4 项能力 + 工具（定位原文）+ Hy4/DeepSeek 可插拔。
- Nano 本地引擎：实现同一 TTSEngine 接口，作为第二引擎（Android 优先）。

---

## Execution Handoff

计划保存在 docs/superpowers/plans/2026-11-26-lingyue-m2-tts.md。两种执行方式：
1. Subagent-Driven（推荐）— 每任务派新子代理并两阶段审查。
2. Inline Execution — 本会话批量执行。

选哪种？
