// src/hooks/useChatNotifications.js
// Listens to directChats where user is a participant, filtered by context (nmcn | entrance)

import { useState, useEffect, useRef } from 'react';
import {
  collection, query, where, onSnapshot, orderBy,
} from 'firebase/firestore';
import { db }      from '../firebase/config';
import { useAuth } from '../context/AuthContext';

/**
 * @param {'nmcn'|'entrance'} mode
 * Returns chatThreads filtered to the current section, with sender names
 * read directly from the doc (no extra Firestore reads needed in the UI).
 *
 * Context filter:
 *   - docs WITH context field → must match mode
 *   - docs WITHOUT context field (legacy) → included in 'nmcn' only
 */
export function useChatNotifications(mode = 'nmcn') {
  const { user }    = useAuth();
  const myUid       = user?.uid;

  const [chatThreads, setChatThreads] = useState([]);
  const [totalUnread, setTotalUnread] = useState(0);

  // Track previous totalUnread so the bell can pulse on new messages
  const prevUnread = useRef(0);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!myUid) return;

    const q = query(
      collection(db, 'directChats'),
      where('participants', 'array-contains', myUid),
      orderBy('updatedAt', 'desc'),
    );

    const unsub = onSnapshot(q, (snap) => {
      const threads = snap.docs
        .map(d => {
          const data        = d.data();
          const unread      = data.unreadCounts?.[myUid] || 0;
          const otherUid    = data.participants?.find(p => p !== myUid) || '';
          const context     = data.context || 'nmcn';           // legacy docs → nmcn
          // Names already stored on the doc — no extra read needed
          const otherName   = data.participantNames?.[otherUid]
                           || data.lastSenderName
                           || 'Student';
          return {
            chatId:       d.id,
            otherUid,
            otherName,
            lastMessage:  data.lastMessage || '',
            lastSenderId: data.lastSenderId || '',
            updatedAt:    data.updatedAt,
            unread,
            context,
          };
        })
        .filter(t => t.context === mode);

      const total = threads.reduce((s, t) => s + (t.unread || 0), 0);

      // Pulse the bell whenever unread count increases
      if (total > prevUnread.current) {
        setPulse(true);
        setTimeout(() => setPulse(false), 1200);
      }
      prevUnread.current = total;

      setChatThreads(threads);
      setTotalUnread(total);
    }, (err) => {
      console.error('useChatNotifications error:', err);
    });

    return unsub;
  }, [myUid, mode]);

  return { chatThreads, totalUnread, pulse };
}
