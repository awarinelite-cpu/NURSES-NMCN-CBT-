// src/hooks/useChatNotifications.js
// Listens to direct chats + group chats and returns unread counts per mode.
//
// NOTE: The directChats query uses NO orderBy — adding orderBy on a different
// field to an array-contains query requires a composite index. Without the
// index Firestore silently returns nothing. Sorting is unnecessary here since
// we only need unread counts, not display order.
//
// FIX: Added visibilitychange listener so that when a mobile browser tab comes
// back to the foreground, the Firestore listeners are restarted immediately.
// Without this, the WebSocket connection dropped in the background takes 10-30s
// to reconnect, during which new message badges don't appear.

import { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db }      from '../firebase/config';
import { useAuth } from '../context/AuthContext';

export function useChatNotifications(mode = 'nmcn') {
  const { user }  = useAuth();
  const myUid     = user?.uid;

  const [chatThreads, setChatThreads] = useState([]);
  const [groupUnread, setGroupUnread] = useState(0);
  const [totalUnread, setTotalUnread] = useState(0);

  // Bump this counter to force listeners to remount (used on visibility change)
  const [tick, setTick] = useState(0);

  const prevUnread = useRef(0);
  const [pulse, setPulse] = useState(false);

  // ── Reconnect listeners when tab comes back to foreground ────────────────
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setTick(t => t + 1); // remounts both listeners below
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ── 1. Direct chats — NO orderBy (avoids missing composite index) ─
  useEffect(() => {
    if (!myUid) return;

    const q = query(
      collection(db, 'directChats'),
      where('participants', 'array-contains', myUid),
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
        .filter(t => t.unread > 0)
        // Sort client-side by updatedAt descending
        .sort((a, b) => {
          const ta = a.updatedAt?.toMillis?.() || a.updatedAt?.seconds || 0;
          const tb = b.updatedAt?.toMillis?.() || b.updatedAt?.seconds || 0;
          return tb - ta;
        });

      setChatThreads(threads);
    }, err => console.error('useChatNotifications directChats error:', err));

    return unsub;
  }, [myUid, tick]);

  // ── 2. Group chats — collection depends on mode ───────────────
  // Counts unread from:
  //   a) unreadCounts[myUid]  — incremented when a member sends (joined users)
  //   b) lastMessageAt > groupLastReadAt — fallback for non-members who never joined
  useEffect(() => {
    if (!myUid) return;

    const groupCol = mode === 'entrance' ? 'entranceGroupChats' : 'groupChats';
    const lastReadKey = mode === 'entrance'
      ? 'entranceGroupLastReadAt'
      : 'groupLastReadAt';

    // Fetch our own groupLastReadAt from user doc once
    let myLastReadAt = null;
    getDoc(doc(db, 'users', myUid))
      .then(snap => {
        if (snap.exists()) {
          const ts = snap.data()[lastReadKey];
          myLastReadAt = ts?.toDate?.() || null;
        }
      })
      .catch(() => {});

    const unsub = onSnapshot(
      collection(db, groupCol),
      (snap) => {
        let total = 0;
        snap.docs.forEach(d => {
          const data = d.data();
          // Primary: explicit unread count for this user (set when they're a member)
          const explicitUnread = data.unreadCounts?.[myUid] || 0;
          if (explicitUnread > 0) {
            total += explicitUnread;
          } else if (data.lastMessageBy && data.lastMessageBy !== myUid) {
            // Fallback: message newer than our last read timestamp
            const lastMsgAt = data.lastMessageAt?.toDate?.() || null;
            if (lastMsgAt && myLastReadAt && lastMsgAt > myLastReadAt) {
              total += 1; // show at least 1 badge for this group
            } else if (lastMsgAt && !myLastReadAt) {
              total += 1; // never read at all — show badge
            }
          }
        });
        setGroupUnread(total);
      },
      err => console.error('useChatNotifications groupChats error:', err)
    );

    return unsub;
  }, [myUid, mode, tick]);

  // ── 3. Combine + pulse ────────────────────────────────────────
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
