// src/components/shared/AdminNotificationBell.jsx
// Admin-side counterpart to NotificationBell.jsx. Surfaces notifications
// targeted at userId:'admin' (new entrance exam payment submissions, new
// subscription receipts) that were previously written to Firestore and
// never shown anywhere.
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminNotifications } from '../../hooks/useAdminNotifications';

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

export default function AdminNotificationBell() {
  const navigate = useNavigate();
  const { items, loading, unreadCount, markAllRead } = useAdminNotifications();
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
        onClick={handleToggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Admin notifications"
        title="Admin notifications"
        style={styles.bellBtn}
      >
        🔔
        {unreadCount > 0 && (
          <span style={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={styles.dropdown}>
          <div style={styles.header}>Admin Notifications</div>
          {loading ? (
            <div style={styles.empty}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={styles.empty}>No notifications yet</div>
          ) : (
            <div style={styles.list}>
              {items.map(item => (
                <button key={item.id} style={styles.item} onClick={() => handleItemClick(item)}>
                  <div style={styles.itemTop}>
                    <span style={styles.itemTitle}>{item.title}</span>
                    <span style={styles.modeBadge}>
                      {item.type === 'entrance_exam_payment' ? 'ENTRANCE' : 'PAYMENT'}
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
  },
  badge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 16, height: 16, padding: '0 4px',
    borderRadius: 9, background: '#EF4444', color: '#fff',
    fontSize: 10, fontWeight: 800, lineHeight: '16px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
    width: 320, maxWidth: '90vw',
    background: 'rgba(11,24,38,0.92)',
    backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
    border: '1px solid rgba(255,255,255,0.10)', borderRadius: 14,
    boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
    overflow: 'hidden', zIndex: 200,
  },
  header: {
    padding: '13px 16px', fontSize: 13, fontWeight: 800,
    color: '#F1F5F9', borderBottom: '1px solid rgba(255,255,255,0.08)',
    textTransform: 'uppercase', letterSpacing: 0.6,
    background: 'rgba(124,58,237,0.12)',
  },
  list: { maxHeight: 320, overflowY: 'auto' },
  item: {
    display: 'block', width: '100%', textAlign: 'left',
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  itemTop: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginBottom: 4,
  },
  itemTitle: { fontSize: 13, fontWeight: 700, color: '#F1F5F9', lineHeight: 1.3 },
  itemMsg:   { fontSize: 12, color: 'rgba(148,163,184,0.9)', lineHeight: 1.4, marginBottom: 4 },
  itemTime:  { fontSize: 11, color: 'rgba(100,116,139,0.8)' },
  modeBadge: {
    fontSize: 9, fontWeight: 800, letterSpacing: 0.8,
    color: '#fff', padding: '3px 7px', borderRadius: 20,
    textTransform: 'uppercase', flexShrink: 0,
    background: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
  },
  empty: {
    padding: '20px 16px', textAlign: 'center',
    fontSize: 13, color: 'rgba(148,163,184,0.8)',
  },
};
