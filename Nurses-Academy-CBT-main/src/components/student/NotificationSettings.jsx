// src/components/student/NotificationSettings.jsx
// Self-contained — no external hook needed.
// Gracefully handles Android WebView where Notification API is blocked.

import { useState, useEffect } from 'react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../context/AuthContext';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

// ── Detect if push notifications are genuinely usable ────────────────────────
function checkSupported() {
  try {
    if (typeof window === 'undefined') return false;
    if (!('Notification' in window)) return false;
    if (typeof Notification.requestPermission !== 'function') return false;
    // Android WebView identifies itself with 'wv' in the UA string —
    // it has the Notification object but always throws on requestPermission.
    const ua = navigator.userAgent || '';
    if (/wv\)/.test(ua)) return false;
    // Some in-app browsers also block it
    if (/FBAN|FBAV|Instagram|LinkedInApp/.test(ua)) return false;
    return true;
  } catch {
    return false;
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────
function useNotifications() {
  const { user } = useAuth();
  const supported  = checkSupported();
  const permission = supported ? Notification.permission : 'unsupported';

  const [subscribed, setSubscribed] = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  // Load saved preference from Firestore
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid))
      .then(snap => { if (snap.exists()) setSubscribed(!!snap.data().notificationsEnabled); })
      .catch(() => {});
  }, [user]);

  const enablePush = async () => {
    setLoading(true); setError('');
    try {
      if (!supported) {
        throw new Error(
          'Push notifications are not available in this browser. ' +
          'Try opening the site in Chrome or your default browser instead of an in-app browser.'
        );
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        throw new Error(
          'Permission denied. Please allow notifications in your browser settings and try again.'
        );
      }
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

// ── Component ─────────────────────────────────────────────────────────────────
export default function NotificationSettings() {
  const {
    supported, permission, subscribed,
    loading, error, enablePush, disablePush,
  } = useNotifications();

  // Not supported (Android WebView / in-app browser) — show informational card only
  if (!supported) {
    return (
      <div style={s.card}>
        <div style={s.row}>
          <div style={s.iconWrap}>🔕</div>
          <div style={{ flex: 1 }}>
            <div style={s.title}>Study Reminders</div>
            <div style={s.sub}>
              Push notifications are not available in this browser.
              Open the site in <strong>Chrome</strong> to enable daily reminders.
            </div>
          </div>
        </div>
      </div>
    );
  }

  const blocked = permission === 'denied';

  return (
    <div style={s.card}>
      <div style={s.row}>

        {/* Icon */}
        <div style={{
          ...s.iconWrap,
          background: subscribed ? 'rgba(13,148,136,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1.5px solid ${subscribed ? 'rgba(13,148,136,0.4)' : 'var(--border)'}`,
        }}>
          {subscribed ? '🔔' : '🔕'}
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={s.title}>Study Reminders</div>
          <div style={s.sub}>
            {subscribed
              ? "You'll get a daily reminder if you haven't practised"
              : 'Get notified when you miss a day of practice'}
          </div>
          {blocked && (
            <div style={{ fontSize: 11, color: '#F59E0B', marginTop: 4, lineHeight: 1.4 }}>
              ⚠️ Notifications are blocked — go to your browser settings → Site Settings → Notifications and allow this site.
            </div>
          )}
        </div>

        {/* Toggle */}
        <button
          onClick={subscribed ? disablePush : enablePush}
          disabled={loading || blocked}
          style={{
            ...s.toggle,
            background: subscribed ? '#0D9488' : 'rgba(255,255,255,0.1)',
            opacity: (loading || blocked) ? 0.45 : 1,
            cursor: (loading || blocked) ? 'not-allowed' : 'pointer',
          }}
          title={blocked ? 'Notifications blocked — enable in browser settings' : subscribed ? 'Disable reminders' : 'Enable reminders'}
        >
          <div style={{
            ...s.thumb,
            transform: subscribed ? 'translateX(20px)' : 'translateX(2px)',
          }} />
        </button>
      </div>

      {/* Status chip */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {subscribed && !loading && (
          <div style={{ ...s.chip, background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.3)', color: '#16A34A' }}>
            ✓ Active — daily reminders on
          </div>
        )}
        {!subscribed && !blocked && !loading && (
          <div style={{ ...s.chip, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.3)', color: '#F59E0B' }}>
            ○ Off — tap toggle to enable
          </div>
        )}
        {loading && (
          <div style={{ ...s.chip, background: 'rgba(13,148,136,0.10)', border: '1px solid rgba(13,148,136,0.3)', color: '#0D9488' }}>
            ⏳ Processing…
          </div>
        )}
      </div>

      {/* What you'll receive */}
      {subscribed && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: 'rgba(13,148,136,0.06)', borderRadius: 10,
          border: '1px solid rgba(13,148,136,0.15)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#0D9488', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            You'll receive
          </div>
          {[
            "📅 Daily practice reminder at 8 PM if you haven't studied",
            '📋 Scheduled exam alerts — 1 hour before it starts',
            '✅ Subscription confirmation when payment is verified',
          ].map(item => (
            <div key={item} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              {item}
            </div>
          ))}
        </div>
      )}

      {/* Error — shown only for real errors, not permission issues */}
      {error && (
        <div style={{
          marginTop: 10, padding: '10px 14px', borderRadius: 10,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          fontSize: 12, color: '#FCA5A5', lineHeight: 1.5,
        }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}

const s = {
  card: {
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 16, padding: '18px 20px',
  },
  row:     { display: 'flex', alignItems: 'center', gap: 14 },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, background: 'rgba(255,255,255,0.05)',
    border: '1.5px solid var(--border)',
  },
  title:  { fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2 },
  sub:    { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 },
  toggle: {
    width: 44, height: 26, borderRadius: 13, border: 'none',
    position: 'relative', flexShrink: 0, transition: 'background 0.3s',
  },
  thumb: {
    position: 'absolute', top: 3, width: 20, height: 20,
    borderRadius: '50%', background: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
    transition: 'transform 0.3s',
  },
  chip: {
    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
  },
};
