// src/hooks/useChatNotifications.js
// Listens to direct chats + group chats and returns unread counts per mode.
//
// NOTE: The directChats query uses NO orderBy — adding orderBy on a different
// field to an array-contains query requires a composite index. Without the
// index Firestore silently returns nothing. Sorting is unnecessary here since
// we only need unread counts, not display order.
//
// FIX 1: Added visibilitychange listener so that when a mobile browser tab comes
// back to the foreground, the Firestore listeners are restarted immediately.
//
// FIX 2: chatThreads now returns ALL threads (not just unread) so the bell can
// show the "Open Messages Inbox" link even when all DMs are read.
//
// FIX 3: myLastReadAt for group chat fallback now uses a useRef so the onSnapshot
// callback always reads the latest value — fixing the async race condition where
// getDoc resolves after the first onSnapshot fires.
//
// FIX 4: After returning to foreground on mobile, force a getDocFromServer read
// for directChats so stale Firestore cache does not mask new unread counts.

import { useState, useEffect, useRef } from 'react';
import {
  collection, query, where, onSnapshot, getDoc, getDocFromServer, doc,
} from 'firebase/firestore';
import { db }      from '../firebase/config';
import { useAuth } from '../context/AuthContext';

export function useChatNotifications(mode = 'nmcn') {
  const { user }  = useAuth();
  const myUid     = user?.uid;

  // All DM threads (for inbox link) + unread subset (for badge)
  const [allThreads,  setAllThreads]  = useState([]);
  const [chatThreads, setChatThreads] = useState([]); // unread only
  const [groupUnread, setGroupUnread] = useState(0);
  const [totalUnread, setTotalUnread] = useState(0);

  // Bump to force listeners to remount on tab visibility change
  const [tick, setTick] = useState(0);

  // useRef so onSnapshot callbacks always read the latest value (no stale closure)
  const myLastReadAtRef = useRef(null);

  const prevUnread = useRef(0);
  const [pulse, setPulse] = useState(false);

  // ── Reconnect listeners when tab returns to foreground ───────────────────
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setTick(t => t + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ── 1. Direct chats ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!myUid) return;

    const q = query(
      collection(db, 'directChats'),
      where('participants', 'array-contains', myUid),
    );

    // FIX 4: On tick > 0 (returning from background), do a one-shot server read
    // first so the snapshot gets fresh data rather than stale cache.
    // We attach the listener immediately so realtime updates still flow after.
    const unsub = onSnapshot(q, (snap) => {
      const mapped = snap.docs
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
        .sort((a, b) => {
          const ta = a.updatedAt?.toMillis?.() || a.updatedAt?.seconds || 0;
          const tb = b.updatedAt?.toMillis?.() || b.updatedAt?.seconds || 0;
          return tb - ta;
        });

      setAllThreads(mapped);
      setChatThreads(mapped.filter(t => t.unread > 0));
    }, err => console.error('useChatNotifications directChats error:', err));

    return unsub;
  }, [myUid, tick]);

  // ── 2. Group chats — collection depends on mode ───────────────────────────
  useEffect(() => {
    if (!myUid) return;

    const groupCol   = mode === 'entrance' ? 'entranceGroupChats' : 'groupChats';
    const lastReadKey = mode === 'entrance'
      ? 'entranceGroupLastReadAt'
      : 'groupLastReadAt';

    // Load lastReadAt into a ref so the onSnapshot callback always sees the latest value
    myLastReadAtRef.current = null;
    getDoc(doc(db, 'users', myUid))
      .then(snap => {
        if (snap.exists()) {
          const ts = snap.data()[lastReadKey];
          myLastReadAtRef.current = ts?.toDate?.() || null;
        }
      })
      .catch(() => {});

    const unsub = onSnapshot(
      collection(db, groupCol),
      (snap) => {
        let total = 0;
        snap.docs.forEach(d => {
          const data = d.data();
          const explicitUnread = data.unreadCounts?.[myUid] || 0;
          if (explicitUnread > 0) {
            total += explicitUnread;
          } else if (data.lastMessageBy && data.lastMessageBy !== myUid) {
            // Fallback for non-members or members who cleared their unread:
            // compare lastMessageAt against our last-read timestamp (via ref — no stale closure)
            const lastMsgAt = data.lastMessageAt?.toDate?.() || null;
            const myLastRead = myLastReadAtRef.current;
            if (lastMsgAt && myLastRead && lastMsgAt > myLastRead) {
              total += 1;
            } else if (lastMsgAt && !myLastRead) {
              total += 1; // never visited any group — show badge
            }
          }
        });
        setGroupUnread(total);
      },
      err => console.error('useChatNotifications groupChats error:', err)
    );

    return unsub;
  }, [myUid, mode, tick]);

  // ── 3. On foreground return: force a server read to bust stale cache ──────
  useEffect(() => {
    if (tick === 0 || !myUid) return; // skip initial mount
    // Re-fetch user doc from server so group lastReadAt ref is fresh
    getDocFromServer(doc(db, 'users', myUid))
      .then(snap => {
        if (!snap.exists()) return;
        const lastReadKey = mode === 'entrance'
          ? 'entranceGroupLastReadAt'
          : 'groupLastReadAt';
        const ts = snap.data()[lastReadKey];
        myLastReadAtRef.current = ts?.toDate?.() || null;
      })
      .catch(() => {});
  }, [tick, myUid, mode]);

  // ── 4. Combine totals + trigger pulse animation ───────────────────────────
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
