// src/components/shared/NotificationBell.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInAppNotifications } from '../../hooks/useInAppNotifications';

function timeAgo(date) {
  if (!date) return '';
  const diffMs = Date.now() - date.getTime();
  const mins   = Math.floor(diffMs / 60000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7)   return `${days}d ago`;
  return date.toLocaleDateString();
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { items, loading, unreadCount, markAllRead } = useInAppNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) markAllRead();
  };

  const handleItemClick = (item) => {
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        style={styles.bellBtn}
        onClick={handleToggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Notifications"
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span style={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={styles.dropdown}>
          <div style={styles.header}>Notifications</div>

          {loading ? (
            <div style={styles.empty}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={styles.empty}>No notifications yet</div>
          ) : (
            <div style={styles.list}>
              {items.map(item => (
                <button
                  key={item.id}
                  style={styles.item}
                  onClick={() => handleItemClick(item)}
                >
                  <div style={styles.itemTop}>
                    <span style={styles.itemTitle}>{item.title}</span>
                    <span style={{
                      ...styles.modeBadge,
                      background: item.type === 'entrance_daily_mock'
                        ? 'linear-gradient(135deg,#0891b2,#0e7490)'
                        : 'linear-gradient(135deg,#0D9488,#0f766e)',
                    }}>
                      {item.type === 'entrance_daily_mock' ? 'ENTRANCE' : 'NMCN'}
                    </span>
                  </div>
                  {item.message && <div style={styles.itemMsg}>{item.message}</div>}
                  <div style={styles.itemTime}>{timeAgo(item.createdAt?.toDate?.())}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
  bellBtn: {
    position: 'relative',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 38, height: 38, borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
    cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0,
    transition: 'background 0.15s',
  },
  badge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 16, height: 16, padding: '0 4px',
    borderRadius: 9, background: '#EF4444', color: '#fff',
    fontSize: 10, fontWeight: 800, lineHeight: '16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: '0 0 0 2px var(--nav-bg)',
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
    background: 'var(--bg-card)', border: '1px solid var(--border)',
    borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    minWidth: 290, maxWidth: '90vw', overflow: 'hidden', zIndex: 200,
    animation: 'fadeIn 0.15s ease',
  },
  header: {
    padding: '12px 16px', fontSize: 13, fontWeight: 800,
    color: 'var(--text-primary)', borderBottom: '1px solid var(--border)',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  list: { maxHeight: 360, overflowY: 'auto' },
  item: {
    display: 'block', width: '100%', textAlign: 'left',
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
    transition: 'background 0.15s',
  },
  itemTop: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginBottom: 4,
  },
  itemTitle: {
    fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
    lineHeight: 1.3,
  },
  itemMsg: {
    fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4, marginBottom: 4,
  },
  itemTime: {
    fontSize: 11, color: 'var(--text-muted)', opacity: 0.8,
  },
  modeBadge: {
    fontSize: 9, fontWeight: 800, letterSpacing: 0.8,
    color: '#fff', padding: '3px 7px', borderRadius: 20,
    textTransform: 'uppercase', flexShrink: 0,
  },
  empty: {
    padding: '20px 16px', textAlign: 'center',
    fontSize: 13, color: 'var(--text-muted)',
  },
};
