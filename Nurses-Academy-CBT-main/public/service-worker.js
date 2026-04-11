// public/service-worker.js
// NMCN CBT Platform — Offline-capable PWA Service Worker

const CACHE_NAME = 'nmcn-cbt-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/static/js/main.chunk.js',
  '/static/js/bundle.js',
  '/manifest.json',
];

// ── Install ────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate ───────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch (network-first for API, cache-first for static) ──────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Firebase and API: network only
  if (url.hostname.includes('firebase') || url.hostname.includes('anthropic')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
      return cached || networkFetch;
    })
  );
});

// ── Push Notifications ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'NMCN CBT', {
      body:  data.body  || 'New notification',
      icon:  '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data:  data,
      actions: data.actions || [],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/')
  );
});
