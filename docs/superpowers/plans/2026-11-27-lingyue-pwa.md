# 聆阅看书 — PWA 移动端 Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: superpowers:subagent-driven-development or executing-plans. Steps use checkbox (- [ ]) syntax.

**Goal:** 让现有 Web App 可作为 PWA 安装到 iPhone 主屏幕，全屏运行、可离线打开，无需 Xcode/签名/开发者账号。

**Architecture:** 新增 public/manifest.webmanifest + public/sw.js + 图标；index.html 加 manifest 与 iOS meta；main.tsx 注册 SW（production only）；设置区加书库导出/导入（localStorage ↔ JSON 文件）。无新运行时依赖。

---

### Task 1: Manifest、图标与 Service Worker（TDD 式验证）

**Files:** 创建 public/manifest.webmanifest, public/sw.js, public/icon-192.png, public/icon-512.png；修改 index.html, src/main.tsx

- [ ] **Step 1: 生成图标（192/512 PNG）**

用 node 脚本生成简单书本主题 PNG（纯色背景 + 文字「聆」），保存到 public/icon-192.png 与 public/icon-512.png。可用 python PIL（bundled python 有 Pillow）或 node canvas；若无 canvas，用 python：
`python3 -c "from PIL import Image, ImageDraw; ..."`（用 load_workspace_dependencies 取 bundled python 路径）。

- [ ] **Step 2: 写 manifest.webmanifest**

~~~json
{
  "name": "聆阅看书",
  "short_name": "聆阅",
  "description": "开源看书听书软件，支持 EPUB/MOBI/TXT 与 AI 读书搭子",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#4a90d9",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
~~~

- [ ] **Step 3: 写 sw.js**

~~~js
const CACHE = 'lingyue-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('/index.html')))
  );
});
~~~

注意：只缓存同源 GET（App shell）；API 请求跨域直接放过，不缓存用户数据。

- [ ] **Step 4: index.html 加 meta**

在 head 加：
~~~html
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<link rel="apple-touch-icon" href="/icon-192.png" />
~~~

- [ ] **Step 5: main.tsx 注册 SW**

在文件末尾（createRoot 之后）加：
```ts
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
```

- [ ] **Step 6: 验证**

Run: pnpm test && pnpm run build
Expected: 80/80 通过、build 通过；检查 dist/ 含 manifest.webmanifest / sw.js / icon-192.png / icon-512.png。
Commit: git add public src/main.tsx index.html && git commit -m 'feat: PWA manifest、图标与 Service Worker'

---

### Task 2: 书库导出/导入（防沙箱数据丢失）

**Files:** 修改 src/main.tsx；新增 tests/backup.test.ts

- [ ] **Step 1: 写失败的测试**

~~~ts
import { describe, it, expect } from 'vitest';
import { collectBookData, applyBookData } from '../src/ui/backup';

describe('书库备份', () => {
  it('收集与还原 lingyue:* 数据', () => {
    const data = { 'lingyue:voices': '[]', 'lingyue:moss-api-key': 'k' };
    const collected = collectBookData(data);
    expect(collected['lingyue:voices']).toBe('[]');
    const target: Record<string, string> = {};
    applyBookData(collected, (k, v) => { target[k] = v; });
    expect(target['lingyue:voices']).toBe('[]');
  });
});
~~~

- [ ] **Step 2: 运行确认失败**

Run: pnpm test tests/backup.test.ts
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 src/ui/backup.ts**

~~~ts
/** 只备份应用数据键，不备份 API Key（密钥不进备份文件） */
export function collectBookData(store: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(store)) {
    if (k.startsWith('lingyue:') && !k.includes('api-key') && !k.includes('llm-config')) out[k] = v;
  }
  return out;
}

export function applyBookData(data: Record<string, string>, set: (k: string, v: string) => void): void {
  for (const [k, v] of Object.entries(data)) {
    if (k.startsWith('lingyue:')) set(k, v);
  }
}
~~~

- [ ] **Step 4: main.tsx 加导出/导入按钮**

在导航区加「备份」按钮组：
- 导出：`const blob = new Blob([JSON.stringify(collectBookData(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)!]))), null, 2)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lingyue-backup.json'; a.click(); URL.revokeObjectURL(a.href);`
- 导入：hidden file input，onChange 读 File.text() → JSON.parse → applyBookData(data, (k,v) => localStorage.setItem(k,v)) → 提示「已导入，请刷新」

- [ ] **Step 5: 运行确认通过并提交**

Run: pnpm test && pnpm run build
Expected: ≥81 测试通过、build 通过。
Commit: git add src/ui/backup.ts tests/backup.test.ts src/main.tsx && git commit -m 'feat: 书库备份导出与导入'

---

## Self-Review（已执行）

1. Spec coverage：manifest/SW/图标 → Task 1；书库备份 → Task 2。
2. Placeholder scan：无 TBD；代码块完整。
3. Type consistency：collectBookData/applyBookData 签名前后一致；不改核心类型。
4. Risk noted：SW 只缓存同源 GET，不碰 API 与用户数据；备份排除 API Key。

## Execution Handoff

计划保存在 docs/superpowers/plans/2026-11-27-lingyue-pwa.md。
1. Subagent-Driven（推荐） 2. Inline Execution。选哪种？
