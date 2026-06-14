// src/hooks/useChatNotifications.js
// Listens to direct chats + group chats and returns unread counts per mode.
//
// nmcn mode    → directChats (all) + groupChats
// entrance mode→ directChats (all) + entranceGroupChats
//
// Direct chats are shared across modes — a message is a message.
// Group chats are strictly separated by collection.

import { useState, useEffect, useRef } from 'react';
import {
  collection, query, where, onSnapshot, orderBy,
} from 'firebase/firestore';
import { db }      from '../firebase/config';
import { useAuth } from '../context/AuthContext';

export function useChatNotifications(mode = 'nmcn') {
  const { user }  = useAuth();
  const myUid     = user?.uid;

  const [chatThreads, setChatThreads] = useState([]);  // direct message threads with unread
  const [groupUnread, setGroupUnread] = useState(0);   // total unread from group chats
  const [totalUnread, setTotalUnread] = useState(0);

  const prevUnread = useRef(0);
  const [pulse, setPulse] = useState(false);

  // ── 1. Direct chats listener ──────────────────────────────────
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
          const data      = d.data();
          const unread    = data.unreadCounts?.[myUid] || 0;
          const otherUid  = data.participants?.find(p => p !== myUid) || '';
          const otherName = data.participantNames?.[otherUid]
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
            type: 'direct',
          };
        })
        .filter(t => t.unread > 0);  // only threads with unread messages

      setChatThreads(threads);
    }, err => console.error('useChatNotifications directChats error:', err));

    return unsub;
  }, [myUid]);

  // ── 2. Group chats listener — collection depends on mode ──────
  useEffect(() => {
    if (!myUid) return;

    const groupCol = mode === 'entrance' ? 'entranceGroupChats' : 'groupChats';

    const unsub = onSnapshot(
      collection(db, groupCol),
      (snap) => {
        let total = 0;
        snap.docs.forEach(d => {
          total += d.data().unreadCounts?.[myUid] || 0;
        });
        setGroupUnread(total);
      },
      err => console.error('useChatNotifications groupChats error:', err)
    );

    return unsub;
  }, [myUid, mode]);

  // ── 3. Combine totals + pulse ─────────────────────────────────
  useEffect(() => {
    const directUnread = chatThreads.reduce((s, t) => s + t.unread, 0);
    const total = directUnread + groupUnread;

    if (total > prevUnread.current) {
      setPulse(true);
      setTimeout(() => setPulse(false), 1200);
    }
    prevUnread.current = total;
    setTotalUnread(total);
  }, [chatThreads, groupUnread]);

  return { chatThreads, totalUnread, groupUnread, pulse };
}
