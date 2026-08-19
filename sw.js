/* 墨 · Service Worker —— 让应用在飞行模式 / 无网络下完整可用 */
const CACHE_NAME = 'mo-pwa-v18';

/* 需要离线缓存的静态资源（相对站点根目录） */
const PRECACHE = [
  './',
  './index.html',
  './styles.css?v=18',
  './manifest.json',
  './js/llm.js?v=18',
  './js/store.js?v=18',
  './js/ai.js?v=18',
  './js/app.js?v=18',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/mo-avatar.png'
];

/* 安装：预缓存全部静态资源 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

/* 激活：清理旧版本缓存 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* 请求拦截策略 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  /* 跨域请求（LLM API 等）：永不缓存，直接走网络，失败交给页面兜底 */
  if (url.origin !== self.location.origin) {
    return;
  }

  /* 页面导航：网络优先，断网时回退缓存 */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  /* 静态资源：缓存优先，同时后台更新，保证离线可用且在线时保持最新 */
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
