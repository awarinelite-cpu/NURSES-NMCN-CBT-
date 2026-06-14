// src/hooks/useInAppNotifications.js
import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, limit, getDocs,
  doc, getDoc, updateDoc, serverTimestamp,
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [annSnap, userSnap] = await Promise.all([
        getDocs(query(collection(db, 'dailyAnnouncements'), orderBy('createdAt', 'desc'), limit(MAX_ITEMS))),
        user ? getDoc(doc(db, 'users', user.uid)) : Promise.resolve(null),
      ]);

      // Filter by mode so NMCN and Entrance notifications never cross
      const allowedTypes = mode === 'entrance' ? ENTRANCE_TYPES : NMCN_TYPES;
      const list = annSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(item => {
          // Items without a type are legacy NMCN announcements
          const t = item.type || 'announcement';
          return allowedTypes.has(t);
        });

      setItems(list);

      if (userSnap?.exists()) {
        const lrKey = mode === 'entrance'
          ? 'entranceNotificationsLastReadAt'
          : 'notificationsLastReadAt';
        setLastReadAt(userSnap.data()[lrKey]?.toDate?.() || null);
      }
    } catch (err) {
      console.error('useInAppNotifications fetch error:', err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user, mode]);

  useEffect(() => { load(); }, [load]);

  const getTime = (a) => a.createdAt?.toDate?.()?.getTime?.() || 0;

  const unreadCount = lastReadAt
    ? items.filter(a => getTime(a) > lastReadAt.getTime()).length
    : items.length;

  const markAllRead = useCallback(async () => {
    if (!user || items.length === 0) return;
    setLastReadAt(new Date());
    try {
      const lrKey = mode === 'entrance'
        ? 'entranceNotificationsLastReadAt'
        : 'notificationsLastReadAt';
      await updateDoc(doc(db, 'users', user.uid), { [lrKey]: serverTimestamp() });
    } catch {
      // best-effort — badge will simply re-show on next load if this fails
    }
  }, [user, items, mode]);

  return { items, loading, unreadCount, lastReadAt, markAllRead, reload: load };
}
