// src/hooks/useAdminNotifications.js
//
// Two write sites in the app notify the admin, not a student:
//   - EntranceExamPaymentPage.jsx  -> type 'entrance_exam_payment'
//   - SubscriptionPage.jsx         -> type 'payment'
// Both write { userId: 'admin', ... } to the shared `notifications`
// collection. Like the student-side fix, these were previously dead --
// written, never read. This hook surfaces them for the AdminNotificationBell.
//
// Read-state note: 'admin' is a shared logical target, potentially spanning
// multiple real admin accounts. Mutating a shared doc's `read` field would
// clear the badge for every admin the moment any one of them opens it,
// which is probably fine for a single-admin shop but not safe to assume.
// Uses a per-admin lastReadAt (stored on that admin's own user doc) instead,
// same pattern as the student-side broadcast/personal split.
import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, orderBy, limit,
  onSnapshot,
  doc, getDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db }      from '../firebase/config';
import { useAuth } from '../context/AuthContext';

const MAX_ITEMS = 20;

function fallbackLink(type) {
  if (type === 'entrance_exam_payment') return '/admin/entrance-exam?tab=payments';
  if (type === 'payment')                return '/admin/payments';
  return '/admin';
}

export function useAdminNotifications() {
  const { user, isAdmin, isSubAdmin } = useAuth();
  // Subadmins also have access to /admin/payments and /admin/entrance-exam
  // (see SubAdminRoute in App.jsx) and are the ones actually confirming
  // these payments day-to-day, so they need to see these too, not just
  // full admins.
  const canSee = isAdmin || isSubAdmin;
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [lastReadAt, setLastReadAt] = useState(() => {
    try {
      const stored = localStorage.getItem('nmcn_admin_notif_lastread');
      return stored ? new Date(parseInt(stored, 10)) : null;
    } catch { return null; }
  });

  useEffect(() => {
    if (!canSee) { setLoading(false); return; }
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', 'admin'),
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
          link: data.link || fallbackLink(data.type),
          createdAt: data.createdAt,
        };
      });
      setItems(list);
      setLoading(false);
    }, (err) => {
      console.error('useAdminNotifications error:', err);
      setLoading(false);
    });
    return unsub;
  }, [canSee]);

  useEffect(() => {
    if (!user || !canSee) return;
    getDoc(doc(db, 'users', user.uid))
      .then(snap => {
        if (snap.exists()) {
          setLastReadAt(snap.data().adminNotifLastReadAt?.toDate?.() || null);
        }
      })
      .catch(() => {});
  }, [user, canSee]);

  const getTime = (a) => a.createdAt?.toDate?.()?.getTime?.() || 0;
  const unreadCount = lastReadAt
    ? items.filter(a => getTime(a) > lastReadAt.getTime()).length
    : items.length;

  const markAllRead = useCallback(async () => {
    if (!user) return;
    const now = new Date();
    setLastReadAt(now);
    try { localStorage.setItem('nmcn_admin_notif_lastread', String(now.getTime())); } catch {}
    try {
      await updateDoc(doc(db, 'users', user.uid), { adminNotifLastReadAt: serverTimestamp() });
    } catch {
      // best-effort
    }
  }, [user]);

  return { items, loading, unreadCount, markAllRead };
}
