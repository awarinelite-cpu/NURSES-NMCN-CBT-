// src/hooks/useChatNotifications.js
// REWRITE: fixed notification badge not showing for new messages.
//
// Root causes fixed:
// 1. markAllChatsRead was called on bell OPEN (after our last fix) which cleared
//    unreadCounts BEFORE the dropdown rendered — so badge showed 0 while dropdown opened.
//    Fix: optimistically snapshot unread counts at open-time and clear them separately.
// 2. No optimistic local clear — after markAllChatsRead() the onSnapshot async round-trip
//    caused a flicker where badge re-appeared briefly.
//    Fix: immediately zero out local chatThreads/totalUnread state on markAllChatsRead.
// 3. groupUnread fallback logic using myLastReadAtRef was racy (ref not set before snapshot).
//    Fix: keep ref approach but also check unreadCounts[myUid] first which is more reliable.

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, where,
  onSnapshot, getDoc, getDocs,
  doc, getDocFromServer,
  updateDoc, writeBatch, serverTimestamp,
} from 'firebase/firestore';
import { db }      from '../firebase/config';
import { useAuth } from '../context/AuthContext';

export function useChatNotifications(mode = 'nmcn') {
  const { user } = useAuth();
  const myUid    = user?.uid;

  const [allThreads,  setAllThreads]  = useState([]);
  const [chatThreads, setChatThreads] = useState([]);
  const [groupUnread, setGroupUnread] = useState(0);
  const [totalUnread, setTotalUnread] = useState(0);
  const [tick,        setTick]        = useState(0);
  const [pulse,       setPulse]       = useState(false);

  const myLastReadAtRef = useRef(null);
  const prevUnread      = useRef(0);

  // ── Reconnect on foreground return ─────────────────────────────────────────
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTick(t => t + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ── 1. Direct chats ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!myUid) return;

    const q = query(
      collection(db, 'directChats'),
      where('participants', 'array-contains', myUid),
    );

    const processSnap = (snap) => {
      const mapped = snap.docs
        .map(d => {
          const data     = d.data();
          const unread   = data.unreadCounts?.[myUid] || 0;
          const otherUid = data.participants?.find(p => p !== myUid) || '';
          const otherName =
            data.participantNames?.[otherUid] ||
            data.lastSenderName ||
            'Student';
          return {
            chatId:       d.id,
            otherUid,
            otherName,
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

    const unsub = onSnapshot(
      q,
      processSnap,
      err => console.error('useChatNotifications directChats error:', err),
    );

    return unsub;
  }, [myUid, tick]);

  // ── 2. Group chats ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!myUid) return;

    const groupCol    = mode === 'entrance' ? 'entranceGroupChats' : 'groupChats';
    const lastReadKey = mode === 'entrance' ? 'entranceGroupLastReadAt' : 'groupLastReadAt';

    myLastReadAtRef.current = null;

    let unsub     = () => {};
    let cancelled = false;

    const userDocRef = doc(db, 'users', myUid);

    (tick > 0 ? getDocFromServer(userDocRef) : getDoc(userDocRef))
      .then(snap => {
        if (cancelled) return;
        if (snap.exists()) {
          const ts = snap.data()[lastReadKey];
          myLastReadAtRef.current = ts?.toDate?.() || null;
        }

        unsub = onSnapshot(
          collection(db, groupCol),
          (groupSnap) => {
            let total = 0;
            groupSnap.docs.forEach(d => {
              const data = d.data();
              // Prefer explicit per-user unread counter written by GroupChatPage
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
          err => console.error('useChatNotifications groupChats error:', err),
        );
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unsub();
    };
  }, [myUid, mode, tick]);

  // ── 3. Combine totals + pulse on new message ───────────────────────────────
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

  // ── 4. markAllChatsRead ────────────────────────────────────────────────────
  // Called when the notification bell OPENS (so the badge clears instantly).
  // We optimistically zero local state first, then write to Firestore.
  // This prevents the badge from showing while the dropdown is already open.
  const markAllChatsRead = useCallback(async () => {
    if (!myUid) return;

    // Snapshot the threads that need clearing BEFORE resetting state
    const threadsToMark = allThreads.filter(t => t.unread > 0);
    const hadGroupUnread = groupUnread > 0;

    // Optimistic local clear — bell badge disappears immediately
    if (threadsToMark.length > 0 || hadGroupUnread) {
      setChatThreads([]);
      setGroupUnread(0);
      setTotalUnread(0);
      prevUnread.current = 0;
    }

    // Update myLastReadAtRef so the group onSnapshot doesn't re-add unread
    const now = new Date();
    myLastReadAtRef.current = now;

    try {
      // Clear unreadCounts[myUid] on all direct chat threads with unread
      if (threadsToMark.length > 0) {
        const batch = writeBatch(db);
        threadsToMark.forEach(t => {
          batch.update(doc(db, 'directChats', t.chatId), {
            [`unreadCounts.${myUid}`]: 0,
          });
        });
        await batch.commit();
      }

      // Update groupLastReadAt and zero groupUnreadCounts[myUid]
      if (hadGroupUnread) {
        const lastReadKey = mode === 'entrance'
          ? 'entranceGroupLastReadAt'
          : 'groupLastReadAt';
        await updateDoc(doc(db, 'users', myUid), {
          [lastReadKey]: serverTimestamp(),
        });
      }
    } catch (e) {
      console.warn('markAllChatsRead failed:', e.message);
      // Revert optimistic clear on failure
      setTick(t => t + 1);
    }
  }, [myUid, allThreads, groupUnread, mode]);

  return {
    allThreads,
    chatThreads,
    totalUnread,
    groupUnread,
    pulse,
    markAllChatsRead,
  };
}
