// src/hooks/usePushNotifications.js
// Fixed to handle Android WebView where Notification API exists but is blocked.

import { useState, useEffect } from 'react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';

function checkSupported() {
  try {
    if (typeof window === 'undefined') return false;
    if (!('Notification' in window)) return false;
    if (typeof Notification.requestPermission !== 'function') return false;
    // Android WebView has 'wv)' in UA — Notification exists but always fails
    const ua = navigator.userAgent || '';
    if (/wv\)/.test(ua)) return false;
    if (/FBAN|FBAV|Instagram|LinkedInApp/.test(ua)) return false;
    return true;
  } catch {
    return false;
  }
}

export function usePushNotifications() {
  const { user } = useAuth();
  const supported  = checkSupported();
  const permission = supported ? Notification.permission : 'unsupported';

  const [subscribed, setSubscribed] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid))
      .then(snap => { if (snap.exists()) setSubscribed(!!snap.data().notificationsEnabled); })
      .catch(() => {});
  }, [user]);

  const enablePush = async () => {
    setLoading(true); setError('');
    try {
      if (!supported) throw new Error(
        'Push notifications are not available in this browser. Open in Chrome to enable.'
      );
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error(
        'Permission denied. Allow notifications in browser settings and try again.'
      );
      await updateDoc(doc(db, 'users', user.uid), { notificationsEnabled: true });
      setSubscribed(true);
    } catch (e) {
      setError(e.message || 'Could not enable notifications.');
    } finally {
      setLoading(false);
    }
  };

  const disablePush = async () => {
    setLoading(true); setError('');
    try {
      await updateDoc(doc(db, 'users', user.uid), { notificationsEnabled: false });
      setSubscribed(false);
    } catch {
      setError('Could not save preference. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return { supported, permission, subscribed, loading, error, enablePush, disablePush };
}
