// src/hooks/useInAppNotifications.js
import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, limit, getDocs,
  doc, getDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';

const MAX_ITEMS = 20;

export function useInAppNotifications() {
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

      const list = annSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setItems(list);

      if (userSnap?.exists()) {
        setLastReadAt(userSnap.data().notificationsLastReadAt?.toDate?.() || null);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const getTime = (a) => a.createdAt?.toDate?.()?.getTime?.() || 0;

  const unreadCount = lastReadAt
    ? items.filter(a => getTime(a) > lastReadAt.getTime()).length
    : items.length;

  const markAllRead = useCallback(async () => {
    if (!user || items.length === 0) return;
    setLastReadAt(new Date());
    try {
      await updateDoc(doc(db, 'users', user.uid), { notificationsLastReadAt: serverTimestamp() });
    } catch {
      // best-effort — badge will simply re-show on next load if this fails
    }
  }, [user, items]);

  return { items, loading, unreadCount, lastReadAt, markAllRead, reload: load };
}
