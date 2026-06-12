// src/hooks/useChatNotifications.js
// Listens to all directChats where user is a participant and counts unread messages

import { useState, useEffect } from 'react';
import {
  collection, query, where, onSnapshot,
  collectionGroup, orderBy,
} from 'firebase/firestore';
import { db }      from '../firebase/config';
import { useAuth } from '../context/AuthContext';

export function useChatNotifications() {
  const { user }        = useAuth();
  const myUid           = user?.uid;

  const [chatThreads,   setChatThreads]   = useState([]); // [{chatId, otherUid, otherName, lastMessage, unread, updatedAt}]
  const [totalUnread,   setTotalUnread]   = useState(0);

  useEffect(() => {
    if (!myUid) return;

    // Listen to directChats where I'm a participant
    const q = query(
      collection(db, 'directChats'),
      where('participants', 'array-contains', myUid),
      orderBy('updatedAt', 'desc'),
    );

    const unsub = onSnapshot(q, (snap) => {
      const threads = snap.docs.map(d => {
        const data    = d.data();
        const unread  = data.unreadCounts?.[myUid] || 0;
        const otherUid = data.participants?.find(p => p !== myUid) || '';
        return {
          chatId:      d.id,
          otherUid,
          lastMessage: data.lastMessage || '',
          lastSenderId: data.lastSenderId || '',
          updatedAt:   data.updatedAt,
          unread,
        };
      });

      const total = threads.reduce((s, t) => s + (t.unread || 0), 0);
      setChatThreads(threads);
      setTotalUnread(total);
    }, (err) => {
      console.error('useChatNotifications error:', err);
    });

    return unsub;
  }, [myUid]);

  return { chatThreads, totalUnread };
}
