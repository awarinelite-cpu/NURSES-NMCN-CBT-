// src/components/shared/MessageNotifier.jsx
// Watches for new unread DMs and fires:
//   1. An in-app toast (when user is on a different page)
//   2. A browser push notification (if permission granted)
// Mounted inside AppLayout so it's always active.

import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useChatNotifications } from '../../hooks/useChatNotifications';
import { useToast } from './Toast';

const MSG_PUSH_KEY = 'nmcn_last_msg_push_ts';

export default function MessageNotifier({ mode = 'nmcn' }) {
  const { totalUnread, chatThreads } = useChatNotifications(mode);
  const { toast } = useToast();
  const location  = useLocation();
  const navigate  = useNavigate();
  const prevCount = useRef(null);

  // Chat inbox paths — we don't fire a toast if the user is already there
  const inboxPaths = ['/chat-inbox', '/entrance-exam/chat-inbox'];
  const isOnInbox  = inboxPaths.some(p => location.pathname.startsWith(p));

  useEffect(() => {
    // Skip on very first render (prevCount not set yet)
    if (prevCount.current === null) {
      prevCount.current = totalUnread;
      return;
    }

    const gained = totalUnread - prevCount.current;
    prevCount.current = totalUnread;

    if (gained <= 0) return; // count went down or stayed same — no new messages

    // ── In-app toast ──────────────────────────────────────────────────────
    if (!isOnInbox) {
      // Try to get the sender name from the latest unread thread
      const latestThread = chatThreads
        .slice()
        .sort((a, b) => {
          const ta = a.updatedAt?.toMillis?.() || a.updatedAt?.seconds * 1000 || 0;
          const tb = b.updatedAt?.toMillis?.() || b.updatedAt?.seconds * 1000 || 0;
          return tb - ta;
        })[0];

      const senderName = latestThread?.otherName || 'Someone';
      const msg =
        gained === 1
          ? `💬 New message from ${senderName}`
          : `💬 ${gained} new messages`;

      const inboxPath = mode === 'entrance' ? '/entrance-exam/chat-inbox' : '/chat-inbox';

      toast(
        <span
          style={{ cursor: 'pointer' }}
          onClick={() => navigate(inboxPath)}
        >
          {msg} — <strong>tap to read</strong>
        </span>,
        'info',
        5000
      );
    }

    // ── Browser push notification ─────────────────────────────────────────
    try {
      if (typeof window === 'undefined') return;
      if (!('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      // Debounce: don't push more than once per 30 seconds
      const lastTs  = Number(localStorage.getItem(MSG_PUSH_KEY) || 0);
      const nowTs   = Date.now();
      if (nowTs - lastTs < 30_000) return;

      const latestThread = chatThreads
        .slice()
        .sort((a, b) => {
          const ta = a.updatedAt?.toMillis?.() || a.updatedAt?.seconds * 1000 || 0;
          const tb = b.updatedAt?.toMillis?.() || b.updatedAt?.seconds * 1000 || 0;
          return tb - ta;
        })[0];

      const senderName = latestThread?.otherName || 'Someone';
      const inboxPath  = mode === 'entrance' ? '/entrance-exam/chat-inbox' : '/chat-inbox';

      const notif = new Notification('💬 New Message', {
        body: `${senderName} sent you a message. Tap to read.`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png',
        tag: 'nmcn-dm-message',
        renotify: true,
        data: { url: inboxPath },
      });

      notif.onclick = () => {
        window.focus();
        window.location.href = notif.data?.url || inboxPath;
        notif.close();
      };

      localStorage.setItem(MSG_PUSH_KEY, String(nowTs));
    } catch (e) {
      // Non-fatal — push failed silently
      console.warn('Message push notification failed:', e.message);
    }
  }, [totalUnread]); // eslint-disable-line react-hooks/exhaustive-deps

  return null; // Renders nothing — side effects only
}
