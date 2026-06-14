// src/hooks/useInAppNotifications.js
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, query, orderBy, limit,
  doc, getDoc, updateDoc, serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';

const MAX_ITEMS = 20;

// Types that belong to each mode
const ENTRANCE_TYPES = new Set(['entrance_daily_mock']);
const NMCN_TYPES     = new Set(['cbt_daily_mock', 'announcement']);

/**
 * @param {'nmcn'|'entrance'} mode  — filters notifications to the current app section.
 *   - 'nmcn'     → only cbt_daily_mock + announcement types
 *   - 'entrance' → only entrance_daily_mock type
 */
export function useInAppNotifications(mode = 'nmcn') {
  const { user } = useAuth();
  const [items,       setItems]       = useState([]);
  const [lastReadAt,  setLastReadAt]  = useState(null);
  const [loading,     setLoading]     = useState(true);
  const lastReadRef = useRef(null);

  // Load lastReadAt once (or when user/mode changes)
  useEffect(() => {
    if (!user) return;
    const lrKey = mode === 'entrance'
      ? 'entranceNotificationsLastReadAt'
      : 'notificationsLastReadAt';

    getDoc(doc(db, 'users', user.uid))
      .then(snap => {
        if (snap.exists()) {
          const lrDate = snap.data()[lrKey]?.toDate?.() || null;
          lastReadRef.current = lrDate;
          setLastReadAt(lrDate);
        }
      })
      .catch(() => {});
  }, [user, mode]);

  // Real-time listener for announcements
  useEffect(() => {
    setLoading(true);
    const allowedTypes = mode === 'entrance' ? ENTRANCE_TYPES : NMCN_TYPES;

    const q = query(
      collection(db, 'dailyAnnouncements'),
      orderBy('createdAt', 'desc'),
      limit(MAX_ITEMS),
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(item => {
          const t = item.type || 'announcement';
          return allowedTypes.has(t);
        });
      setItems(list);
      setLoading(false);
    }, () => {
      setItems([]);
      setLoading(false);
    });

    return unsub;
  }, [mode]);

  const getTime = (a) => a.createdAt?.toDate?.()?.getTime?.() || 0;

  const unreadCount = lastReadAt
    ? items.filter(a => getTime(a) > lastReadAt.getTime()).length
    : items.length;

  const markAllRead = useCallback(async () => {
    if (!user || items.length === 0) return;
    const now = new Date();
    lastReadRef.current = now;
    setLastReadAt(now);
    try {
      const lrKey = mode === 'entrance'
        ? 'entranceNotificationsLastReadAt'
        : 'notificationsLastReadAt';
      await updateDoc(doc(db, 'users', user.uid), { [lrKey]: serverTimestamp() });
    } catch {
      // best-effort — badge will simply re-show on next load if this fails
    }
  }, [user, items, mode]);

  const reload = useCallback(() => {}, []); // no-op: onSnapshot handles updates

  return { items, loading, unreadCount, lastReadAt, markAllRead, reload };
}
