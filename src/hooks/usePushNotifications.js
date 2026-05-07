// src/hooks/usePushNotifications.js
import { useEffect, useState, useCallback } from 'react';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';

const VAPID_PUBLIC_KEY = 'BItPTRNZmwVDBb3LbsgBvE6mu7rjsaZ3VXVZ3yYQwXwZeONPwovLqRL1MbVXeKJmFw6IhKeMufvxcxT-EdOjWkQ';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function usePushNotifications() {
  const { user } = useAuth();

  const [permission,    setPermission]    = useState(Notification.permission);
  const [subscribed,    setSubscribed]    = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState(null);
  const [swReady,       setSwReady]       = useState(false);

  // ── Check if SW is registered and subscription exists ──────────
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    navigator.serviceWorker.ready.then(async (reg) => {
      setSwReady(true);
      const existing = await reg.pushManager.getSubscription();
      setSubscribed(!!existing);
    });
  }, []);

  // ── Enable push notifications ───────────────────────────────────
  const enablePush = useCallback(async () => {
    if (!user) { setError('You must be logged in.'); return; }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setError('Push notifications are not supported on this browser.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        setError('Permission denied. Enable notifications in your browser settings.');
        setLoading(false);
        return;
      }

      const reg = await navigator.serviceWorker.ready;

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const subJson = subscription.toJSON();
      await setDoc(doc(db, 'pushSubscriptions', user.uid), {
        userId:    user.uid,
        endpoint:  subJson.endpoint,
        keys:      subJson.keys,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        active:    true,
        device:    navigator.userAgent.slice(0, 200),
      });

      setSubscribed(true);
    } catch (e) {
      console.error('Push subscription error:', e);
      setError('Failed to enable notifications: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // ── Disable push notifications ──────────────────────────────────
  const disablePush = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await deleteDoc(doc(db, 'pushSubscriptions', user.uid));
      setSubscribed(false);
    } catch (e) {
      setError('Failed to disable notifications: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  return { supported, swReady, permission, subscribed, loading, error, enablePush, disablePush };
}
