// public/service-worker.js
// NMCN CBT Platform — PWA Service Worker
// SECURITY: Exam/question content is NEVER cached for offline access.

const CACHE_NAME = 'nmcn-cbt-v3';

// Only cache shell assets — no question data
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

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

  // Navigation requests — network-first
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Shell assets — cache-first, update in background
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
