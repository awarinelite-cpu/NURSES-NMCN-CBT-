// src/hooks/useChatNotifications.js
// Listens to directChats where user is a participant, filtered by context (nmcn | entrance)

import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot, orderBy,
} from 'firebase/firestore';
import { db }      from '../firebase/config';
import { useAuth } from '../context/AuthContext';

/**
 * @param {'nmcn'|'entrance'} mode
 *   'nmcn'     → only chats with context === 'nmcn'  (CBT section)
 *   'entrance' → only chats with context === 'entrance'
 *
 * Existing chats without a context field are treated as 'nmcn' for
 * backwards-compatibility (they were all opened from the CBT section).
 */
export function useChatNotifications(mode = 'nmcn') {
  const { user }      = useAuth();
  const myUid         = user?.uid;

  const [chatThreads,  setChatThreads]  = useState([]);
  const [totalUnread,  setTotalUnread]  = useState(0);

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
          const data     = d.data();
          const unread   = data.unreadCounts?.[myUid] || 0;
          const otherUid = data.participants?.find(p => p !== myUid) || '';
          // Chats written before context field existed default to 'nmcn'
          const context  = data.context || 'nmcn';
          return {
            chatId:       d.id,
            otherUid,
            lastMessage:  data.lastMessage || '',
            lastSenderId: data.lastSenderId || '',
            updatedAt:    data.updatedAt,
            unread,
            context,
          };
        })
        // Only surface chats that belong to the current section
        .filter(t => t.context === mode);

      const total = threads.reduce((s, t) => s + (t.unread || 0), 0);
      setChatThreads(threads);
      setTotalUnread(total);
    }, (err) => {
      console.error('useChatNotifications error:', err);
    });

    return unsub;
  }, [myUid, mode]);

  return { chatThreads, totalUnread };
}
