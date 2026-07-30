// public/service-worker.js
// NMCN CBT Platform — PWA Service Worker
// SECURITY: Exam/question content is NEVER cached for offline access.

const CACHE_NAME = 'nmcn-cbt-v7';

// Only cache shell assets — no question data
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Never served from the SW cache-first path, even for non-navigate requests
// (some webview/standalone contexts fetch these without mode:'navigate').
const SHELL_HTML_PATHS = ['/', '/index.html'];

// Paths that must NEVER be served from cache
const NO_CACHE_PATTERNS = [
  /\/exam/i,
  /\/question/i,
  /\/entrance/i,
  /\/mock/i,
  /\/practice/i,
  /\/drill/i,
  /firestore/i,
  /firebase/i,
  /anthropic/i,
  /paystack/i,
];

// ── Install ────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ── Activate — clear old caches ────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ──────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Navigation requests — network-first, fall back to cached shell.
  // IMPORTANT: this must run BEFORE the protected-content check below.
  // Routes like /entrance-exam contain "entrance" and would otherwise
  // get matched as protected API data instead of a page navigation,
  // serving a raw JSON 503 instead of the cached app shell on any
  // network hiccup.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Never cache protected content — always network-only
  const isProtected = NO_CACHE_PATTERNS.some(p => p.test(url.href));
  if (isProtected) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Offline access to exam content is not permitted.' }), {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        })
      )
    );
    return;
  }

  // Shell HTML — always network-first, even outside mode:'navigate', so a
  // refreshed tab never gets a stale index.html pointing at old JS chunks.
  if (SHELL_HTML_PATHS.includes(url.pathname)) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Shell assets — cache-first, update in background.
  // Cache API only supports GET requests — attempting cache.put() on
  // POST/HEAD/etc throws. Only cache GETs; let everything else pass
  // straight through to the network untouched.
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request));
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
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// ── Push Notifications ─────────────────────────────────────────────
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'NMCN CBT', {
      body:    data.body  || 'New notification',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/badge-72.png',
      data:    data,
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
