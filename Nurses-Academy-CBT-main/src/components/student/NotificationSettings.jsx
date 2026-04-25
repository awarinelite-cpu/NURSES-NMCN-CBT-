// src/components/student/NotificationSettings.jsx
// Drop this anywhere — settings page, profile page, or dashboard.
// Shows a toggle to enable/disable push notifications.

import { usePushNotifications } from '../../hooks/usePushNotifications';

export default function NotificationSettings() {
  const {
    supported, permission, subscribed,
    loading, error, enablePush, disablePush,
  } = usePushNotifications();

  if (!supported) {
    return (
      <div style={s.card}>
        <div style={s.row}>
          <div style={s.iconWrap}>🔕</div>
          <div style={{ flex: 1 }}>
            <div style={s.title}>Push Notifications</div>
            <div style={s.sub}>Not supported on this browser or device.</div>
          </div>
        </div>
      </div>
    );
  }

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
              ? 'You\'ll get a daily reminder if you haven\'t practised'
              : 'Get notified when you miss a day of practice'}
          </div>
          {permission === 'denied' && (
            <div style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>
              ⚠️ Notifications blocked in browser — enable in site settings
            </div>
          )}
        </div>

        {/* Toggle */}
        <button
          onClick={subscribed ? disablePush : enablePush}
          disabled={loading || permission === 'denied'}
          style={{
            ...s.toggle,
            background: subscribed ? 'var(--teal)' : 'rgba(255,255,255,0.1)',
            opacity: (loading || permission === 'denied') ? 0.5 : 1,
            cursor: (loading || permission === 'denied') ? 'not-allowed' : 'pointer',
          }}
          title={subscribed ? 'Disable notifications' : 'Enable notifications'}
        >
          <div style={{
            ...s.thumb,
            transform: subscribed ? 'translateX(20px)' : 'translateX(2px)',
          }} />
        </button>
      </div>

      {/* Status chips */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        {[
          {
            show: subscribed,
            bg: 'rgba(22,163,74,0.12)', border: 'rgba(22,163,74,0.3)', color: '#16A34A',
            label: '✓ Active — daily reminders on',
          },
          {
            show: !subscribed && permission !== 'denied',
            bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.3)', color: '#F59E0B',
            label: '○ Off — tap toggle to enable',
          },
          {
            show: loading,
            bg: 'rgba(13,148,136,0.10)', border: 'rgba(13,148,136,0.3)', color: 'var(--teal)',
            label: '⏳ Processing…',
          },
        ].filter(c => c.show).map((c, i) => (
          <div key={i} style={{
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
            background: c.bg, border: `1px solid ${c.border}`, color: c.color,
          }}>
            {c.label}
          </div>
        ))}
      </div>

      {/* What you'll receive */}
      {subscribed && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: 'rgba(13,148,136,0.06)', borderRadius: 10,
          border: '1px solid rgba(13,148,136,0.15)',
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            You'll receive
          </div>
          {[
            '📅 Daily practice reminder at 8 PM if you haven\'t studied',
            '📋 Scheduled exam alerts — 1 hour before it starts',
            '✅ Subscription confirmation when payment is verified',
          ].map(item => (
            <div key={item} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', gap: 6 }}>
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          marginTop: 10, padding: '8px 12px', borderRadius: 8,
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          fontSize: 12, color: '#EF4444',
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
  row: {
    display: 'flex', alignItems: 'center', gap: 14,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 12, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 20, background: 'rgba(255,255,255,0.05)',
    border: '1.5px solid var(--border)',
  },
  title: {
    fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 2,
  },
  sub: {
    fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4,
  },
  toggle: {
    width: 44, height: 26, borderRadius: 13, border: 'none',
    position: 'relative', flexShrink: 0,
    transition: 'background 0.3s',
  },
  thumb: {
    position: 'absolute', top: 3, width: 20, height: 20,
    borderRadius: '50%', background: '#fff',
    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
    transition: 'transform 0.3s',
  },
};
