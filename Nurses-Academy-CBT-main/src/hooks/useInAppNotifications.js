// src/hooks/useInAppNotifications.js
//
// FIX (2026-07): the bell was only ever reading `dailyAnnouncements` (a
// broadcast collection for daily-mock alerts). Meanwhile FIVE places in the
// app -- EntranceExamManager (payment confirm/revoke), PaymentsManager
// (payment confirm, device reset), and AnnouncementsManager (admin
// broadcasts) -- were writing to a completely separate per-user
// `notifications` collection that nothing ever read. Those notifications
// were silently dead: written to Firestore, never shown anywhere. This hook
// now merges both sources so every notification actually reaches the bell.
//
// Also fixed: dailyMockExamRotation.js (NMCN) writes type 'daily_mock_exam',
// but this file's allow-list only accepted 'cbt_daily_mock' -- a plain
// string mismatch that meant the main NMCN daily-mock alert never showed
// either. Corrected below.
import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, orderBy, limit,
  onSnapshot,
  doc, getDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db }      from '../firebase/config';
import { useAuth } from '../context/AuthContext';

const MAX_ITEMS = 20;

const ENTRANCE_TYPES = new Set(['entrance_daily_mock']);
const NMCN_TYPES     = new Set(['daily_mock_exam', 'cbt_daily_mock', 'announcement']);

// Fallback destinations for personal-notification docs that predate the
// `link` field (already sitting in Firestore before this fix shipped), or
// for any future write site that forgets to set one. Keeps the "every
// notification should lead to where it came from" guarantee even for old
// data. Where a type spans both entrance/NMCN contexts (payment_confirmed),
// the body text is checked for the word "entrance" -- best-effort only;
// new writes should always set `link` explicitly instead of relying on this.
function fallbackLink(item) {
  const body = (item.body || item.message || '').toLowerCase();
  switch (item.type) {
    case 'payment_confirmed': return body.includes('entrance') ? '/entrance-exam' : '/subscription';
    case 'payment_revoked':   return '/entrance-exam/payment';
    case 'device_reset':      return '/profile';
    case 'announcement':      return '/dashboard';
    default:                  return '/dashboard';
  }
}

export function useInAppNotifications(mode = 'nmcn') {
  const { user } = useAuth();
  const [broadcastItems, setBroadcastItems] = useState([]); // dailyAnnouncements (mode-scoped)
  const [personalItems,  setPersonalItems]  = useState([]); // notifications (userId or 'all', always visible)
  const [loading,        setLoading]        = useState(true);

  const [lastReadAt, setLastReadAt] = useState(() => {
    try {
      const key = mode === 'entrance' ? 'nmcn_entrance_notif_lastread' : 'nmcn_cbt_notif_lastread';
      const stored = localStorage.getItem(key);
      return stored ? new Date(parseInt(stored, 10)) : null;
    } catch { return null; }
  });
  // Personal notifications aren't mode-scoped (a payment notice matters
  // regardless of which section you're browsing), so they share one
  // lastReadAt across both bell instances instead of per-mode.
  const [personalLastReadAt, setPersonalLastReadAt] = useState(() => {
    try {
      const stored = localStorage.getItem('nmcn_personal_notif_lastread');
      return stored ? new Date(parseInt(stored, 10)) : null;
    } catch { return null; }
  });

  // ── 1. Live listener on dailyAnnouncements (broadcast, mode-scoped) ───────
  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, 'dailyAnnouncements'),
      orderBy('createdAt', 'desc'),
      limit(MAX_ITEMS),
    );

    const unsub = onSnapshot(q, (snap) => {
      const allowedTypes = mode === 'entrance' ? ENTRANCE_TYPES : NMCN_TYPES;
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data(), source: 'broadcast' }))
        .filter(item => allowedTypes.has(item.type || 'announcement'));
      setBroadcastItems(list);
      setLoading(false);
    }, (err) => {
      console.error('useInAppNotifications dailyAnnouncements error:', err);
      setLoading(false);
    });

    return unsub;
  }, [mode]);

  // ── 2. Live listener on notifications (personal, addressed to this user
  //       or broadcast to 'all'; NOT mode-scoped -- account-level notices
  //       like payment status should stay visible everywhere) ─────────────
  useEffect(() => {
    if (!user) { setPersonalItems([]); return; }
    // NOTE: this compound query (where 'in' + orderBy on a different field)
    // needs a Firestore composite index. If the console logs a
    // "requires an index" error with a link, click it once to create it.
    const q = query(
      collection(db, 'notifications'),
      where('userId', 'in', [user.uid, 'all']),
      orderBy('createdAt', 'desc'),
      limit(MAX_ITEMS),
    );
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title,
          message: data.body || data.message || '',
          type: data.type || 'notice',
          link: data.link || fallbackLink(data),
          createdAt: data.createdAt,
          source: 'personal',
        };
      });
      setPersonalItems(list);
    }, (err) => {
      console.error('useInAppNotifications notifications error:', err);
    });
    return unsub;
  }, [user]);

  // ── 3. Fetch lastReadAt values from user doc once on mount ─────────────
  useEffect(() => {
    if (!user) return;
    const lrKey = mode === 'entrance'
      ? 'entranceNotificationsLastReadAt'
      : 'notificationsLastReadAt';

    getDoc(doc(db, 'users', user.uid))
      .then(snap => {
        if (snap.exists()) {
          const d = snap.data();
          setLastReadAt(d[lrKey]?.toDate?.() || null);
          setPersonalLastReadAt(d.personalNotifLastReadAt?.toDate?.() || null);
        }
      })
      .catch(() => {});
  }, [user, mode]);

  // ── 4. Merge + sort ─────────────────────────────────────────────────────
  const items = [...broadcastItems, ...personalItems].sort((a, b) => {
    const ta = a.createdAt?.toDate?.()?.getTime?.() || 0;
    const tb = b.createdAt?.toDate?.()?.getTime?.() || 0;
    return tb - ta;
  }).slice(0, MAX_ITEMS);

  // ── 5. Unread count ─────────────────────────────────────────────────────
  const getTime = (a) => a.createdAt?.toDate?.()?.getTime?.() || 0;
  const broadcastUnread = lastReadAt
    ? broadcastItems.filter(a => getTime(a) > lastReadAt.getTime()).length
    : broadcastItems.length;
  const personalUnread = personalLastReadAt
    ? personalItems.filter(a => getTime(a) > personalLastReadAt.getTime()).length
    : personalItems.length;
  const unreadCount = broadcastUnread + personalUnread;

  // ── 6. Mark all read (both sources) ─────────────────────────────────────
  const markAllRead = useCallback(async () => {
    if (!user) return;
    const now = new Date();
    setLastReadAt(now);
    setPersonalLastReadAt(now);
    try {
      const lsKey = mode === 'entrance' ? 'nmcn_entrance_notif_lastread' : 'nmcn_cbt_notif_lastread';
      localStorage.setItem(lsKey, String(now.getTime()));
      localStorage.setItem('nmcn_personal_notif_lastread', String(now.getTime()));
    } catch {}
    try {
      const lrKey = mode === 'entrance'
        ? 'entranceNotificationsLastReadAt'
        : 'notificationsLastReadAt';
      await updateDoc(doc(db, 'users', user.uid), {
        [lrKey]: serverTimestamp(),
        personalNotifLastReadAt: serverTimestamp(),
      });
    } catch {
      // best-effort
    }
  }, [user, mode]);

  return { items, loading, unreadCount, lastReadAt, markAllRead };
}
