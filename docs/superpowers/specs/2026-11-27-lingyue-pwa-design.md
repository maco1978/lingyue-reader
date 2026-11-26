# 聆阅看书 — PWA 移动端方案设计规格

- 日期：2026-11-27
- 状态：设计确认（assistant 推荐方案，用户未明确回复时按推荐推进）

## 目标

把现有 Web App 变成可在 iPhone 主屏幕安装、全屏运行的 PWA：无需 Xcode、无需签名、无 7 天过期。

## 为什么选 PWA

- 本机无 Xcode（只有 Command Line Tools），iOS 原生编译不可行
- 用户无开发者账号，不上架；免费签名方案 7 天过期、体验差
- PWA 零工具链成本，现有代码几乎不改

## 设计

### 1. Web App Manifest
- 新建 public/manifest.webmanifest：name/short_name「聆阅看书」、start_url「/」、display「standalone」、theme_color / background_color、icons（192/512 PNG）
- index.html 加 <link rel="manifest"> 与 apple-mobile-web-app-capable / apple-mobile-web-app-status-bar-style

### 2. Service Worker
- 新建 public/sw.js：预缓存 App shell（index.html、JS/CSS 产物），网络优先 + 缓存回退
- 注意：EPUB 文件与 API 响应不做缓存（用户数据与隐私）
- src/main.tsx 注册 SW（仅在 production、'serviceWorker' in navigator 时）

### 3. 图标
- 生成 192/512 PNG 图标（用 canvas 或简单 SVG→PNG，教材/书本主题）

### 4. 书库备份（缓解沙箱数据丢失）
- 设置页加「导出书库」/「导入书库」按钮：导出 localStorage 里 lingyue:* 为 JSON 文件；导入时解析并写回
- 用 Blob + URL.createObjectURL（浏览器环境可用）

### 5. 验证
- build 后检查 dist 包含 manifest/sw/icons
- 本地起静态服务器，curl 验证 manifest 与 sw 可访问
- 全量测试 80/80 通过

## 边界
- 不做推送、后台播放、系统分享（需原生能力，留 Capacitor 后续）
- 不引入新运行时依赖（SW 手写）
- 用户数据仍仅在本地浏览器沙箱
