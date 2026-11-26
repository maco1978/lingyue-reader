const CACHE = 'lingyue-v1';
const SHELL = ['/lingyue-reader/', '/lingyue-reader/index.html', '/lingyue-reader/manifest.webmanifest', '/lingyue-reader/icon-192.png', '/lingyue-reader/icon-512.png'];
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
      if (res.ok) {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {}));
      }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('/lingyue-reader/index.html')))
  );
});