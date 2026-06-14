// src/hooks/useChatNotifications.js

import { useState, useEffect, useRef } from 'react';
import {
  collection, query, where,
  onSnapshot, getDoc, getDocs,
  doc, getDocFromServer,
} from 'firebase/firestore';
import { db }      from '../firebase/config';
import { useAuth } from '../context/AuthContext';

export function useChatNotifications(mode = 'nmcn') {
  const { user }  = useAuth();
  const myUid     = user?.uid;

  const [allThreads,  setAllThreads]  = useState([]);
  const [chatThreads, setChatThreads] = useState([]);
  const [groupUnread, setGroupUnread] = useState(0);
  const [totalUnread, setTotalUnread] = useState(0);
  const [tick, setTick] = useState(0);

  const myLastReadAtRef = useRef(null);
  const prevUnread      = useRef(0);
  const [pulse, setPulse] = useState(false);

  // ── Reconnect on foreground return ───────────────────────────────────────
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTick(t => t + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ── 1. Direct chats ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!myUid) return;

    const q = query(
      collection(db, 'directChats'),
      where('participants', 'array-contains', myUid),
    );

    const processSnap = (snap) => {
      const mapped = snap.docs
        .map(d => {
          const data      = d.data();
          const unread    = data.unreadCounts?.[myUid] || 0;
          const otherUid  = data.participants?.find(p => p !== myUid) || '';
          const otherName = data.participantNames?.[otherUid]
                         || data.lastSenderName
                         || 'Student';
          return {
            chatId: d.id, otherUid, otherName,
            lastMessage:  data.lastMessage  || '',
            lastSenderId: data.lastSenderId || '',
            updatedAt:    data.updatedAt,
            unread,
            type: 'direct',
          };
        })
        .sort((a, b) => {
          const ta = a.updatedAt?.toMillis?.() || a.updatedAt?.seconds || 0;
          const tb = b.updatedAt?.toMillis?.() || b.updatedAt?.seconds || 0;
          return tb - ta;
        });

      setAllThreads(mapped);
      setChatThreads(mapped.filter(t => t.unread > 0));
    };

    // On foreground return: force a fresh server read to bust stale cache
    if (tick > 0) {
      getDocs(q).then(processSnap).catch(() => {});
    }

    const unsub = onSnapshot(q, processSnap,
      err => console.error('useChatNotifications directChats error:', err));

    return unsub;
  }, [myUid, tick]);

  // ── 2. Group chats ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!myUid) return;

    const groupCol    = mode === 'entrance' ? 'entranceGroupChats' : 'groupChats';
    const lastReadKey = mode === 'entrance' ? 'entranceGroupLastReadAt' : 'groupLastReadAt';

    myLastReadAtRef.current = null;

    let unsub = () => {};
    let cancelled = false;

    const userDocRef = doc(db, 'users', myUid);

    // Await the user doc BEFORE attaching the group listener so
    // myLastReadAtRef is populated before the first snapshot fires.
    (tick > 0 ? getDocFromServer(userDocRef) : getDoc(userDocRef))
      .then(snap => {
        if (cancelled) return;
        if (snap.exists()) {
          const ts = snap.data()[lastReadKey];
          myLastReadAtRef.current = ts?.toDate?.() || null;
        }

        // Now safe to attach — ref is ready before first snapshot
        unsub = onSnapshot(
          collection(db, groupCol),
          (groupSnap) => {
            let total = 0;
            groupSnap.docs.forEach(d => {
              const data = d.data();
              const explicitUnread = data.unreadCounts?.[myUid] || 0;
              if (explicitUnread > 0) {
                total += explicitUnread;
              } else if (data.lastMessageBy && data.lastMessageBy !== myUid) {
                const lastMsgAt  = data.lastMessageAt?.toDate?.() || null;
                const myLastRead = myLastReadAtRef.current;
                if (lastMsgAt && myLastRead && lastMsgAt > myLastRead) total += 1;
                else if (lastMsgAt && !myLastRead) total += 1;
              }
            });
            setGroupUnread(total);
          },
          err => console.error('useChatNotifications groupChats error:', err)
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsub();
    };
  }, [myUid, mode, tick]);

  // ── 3. Combine + pulse ───────────────────────────────────────────────────
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

  return { allThreads, chatThreads, totalUnread, groupUnread, pulse };
}
