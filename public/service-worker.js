// public/service-worker.js
// NMCN CBT Platform — Offline-capable PWA Service Worker

const CACHE_NAME = 'nmcn-cbt-v2';

// Only cache files that are guaranteed to exist at these exact paths.
// Vite hashes JS/CSS filenames on every build — never hardcode them here.
const STATIC_ASSETS = [
  '/',
  '/index.html',
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

// ── Fetch (cache-first for static assets, network-first for everything else) ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always go network-only for Firebase, Anthropic API, and Paystack
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('anthropic') ||
    url.hostname.includes('paystack')
  ) {
    return;
  }

  // For navigation requests (HTML pages), use network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For all other requests (JS, CSS, images): cache-first, update in background
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached); // fall back to cache if network fails
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
