/* firebase-messaging-sw.js
 * Handles Firebase Cloud Messaging push notifications while the app is
 * closed or backgrounded (e.g. "New Daily Mock Exam is live!"). Must live
 * at the site root so its scope covers the whole origin.
 */
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCVfETXFbWm2b8ywy8auurgf8r80unQ3A4",
  authDomain: "elitecarehub-a80da.firebaseapp.com",
  projectId: "elitecarehub-a80da",
  storageBucket: "elitecarehub-a80da.firebasestorage.app",
  messagingSenderId: "76292607120",
  appId: "1:76292607120:web:29ac5fae7fb4e58876dc15",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'New Daily Mock Exam is Live!';
  const body  = payload.notification?.body  || "Today's mock exam is ready — tap to start.";
  const url   = payload.data?.url || '/daily-mock-exam';

  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: 'nmcn-daily-mock',
    data: { url },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/daily-mock-exam';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) { client.focus(); client.navigate(url); return; }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
