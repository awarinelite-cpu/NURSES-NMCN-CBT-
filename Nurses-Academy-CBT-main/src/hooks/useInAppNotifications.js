// src/hooks/useInAppNotifications.js
import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, limit,
  onSnapshot,
  doc, getDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db }      from '../firebase/config';
import { useAuth } from '../context/AuthContext';

const MAX_ITEMS = 20;

const ENTRANCE_TYPES = new Set(['entrance_daily_mock']);
const NMCN_TYPES     = new Set(['cbt_daily_mock', 'announcement']);

export function useInAppNotifications(mode = 'nmcn') {
  const { user } = useAuth();
  const [items,      setItems]      = useState([]);
  const [lastReadAt, setLastReadAt] = useState(null);
  const [loading,    setLoading]    = useState(true);

  // ── 1. Live listener on dailyAnnouncements ─────────────────────────────────
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
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(item => {
          const t = item.type || 'announcement';
          return allowedTypes.has(t);
        });
      setItems(list);
      setLoading(false);
    }, (err) => {
      console.error('useInAppNotifications snapshot error:', err);
      setLoading(false);
    });

    return unsub;
  }, [mode]);

  // ── 2. Fetch lastReadAt from user doc once on mount ────────────────────────
  useEffect(() => {
    if (!user) return;
    const lrKey = mode === 'entrance'
      ? 'entranceNotificationsLastReadAt'
      : 'notificationsLastReadAt';

    getDoc(doc(db, 'users', user.uid))
      .then(snap => {
        if (snap.exists()) {
          setLastReadAt(snap.data()[lrKey]?.toDate?.() || null);
        }
      })
      .catch(() => {});
  }, [user, mode]);

  // ── 3. Unread count ────────────────────────────────────────────────────────
  const getTime = (a) => a.createdAt?.toDate?.()?.getTime?.() || 0;
  const unreadCount = lastReadAt
    ? items.filter(a => getTime(a) > lastReadAt.getTime()).length
    : items.length;

  // ── 4. Mark all read ───────────────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    if (!user || items.length === 0) return;
    setLastReadAt(new Date());
    try {
      const lrKey = mode === 'entrance'
        ? 'entranceNotificationsLastReadAt'
        : 'notificationsLastReadAt';
      await updateDoc(doc(db, 'users', user.uid), { [lrKey]: serverTimestamp() });
    } catch {
      // best-effort
    }
  }, [user, items, mode]);

  return { items, loading, unreadCount, lastReadAt, markAllRead };
}
