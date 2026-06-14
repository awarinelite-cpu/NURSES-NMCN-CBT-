// src/components/shared/NotificationBell.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useInAppNotifications }  from '../../hooks/useInAppNotifications';
import { useChatNotifications }   from '../../hooks/useChatNotifications';

const entrancePrefixes = ['/entrance-exam', '/admin/entrance-exam'];
function isEntrancePath(p) { return entrancePrefixes.some(x => p.startsWith(x)); }

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

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

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const mode = isEntrancePath(location.pathname) ? 'entrance' : 'nmcn';
  const { items, loading, unreadCount, markAllRead } = useInAppNotifications(mode);
  const { chatThreads, totalUnread: chatUnread, groupUnread, pulse } = useChatNotifications(mode);

  // Inject bell animation keyframes once
  useEffect(() => {
    const id = 'bell-ring-keyframes';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = `
        @keyframes bellRing {
          0%   { transform: rotate(0deg); }
          20%  { transform: rotate(-18deg); }
          40%  { transform: rotate(18deg); }
          60%  { transform: rotate(-12deg); }
          80%  { transform: rotate(12deg); }
          100% { transform: rotate(0deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Base paths for navigation — never cross between sections
  const chatBase  = mode === 'entrance' ? '/entrance-exam/chat' : '/chat';
  const inboxPath = mode === 'entrance' ? '/entrance-exam/chat-inbox' : '/chat-inbox';
  const [open, setOpen] = useState(false);
  const ref    = useRef(null);
  const btnRef = useRef(null);

  // Position state for the dropdown — recalculated each time it opens
  const [dropPos, setDropPos] = useState({ left: 'auto', right: 0, width: 320 });

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = () => {
    const next = !open;
    if (next && btnRef.current) {
      // Calculate where the dropdown should sit so it never bleeds off-screen
      const vw      = window.innerWidth;
      const PADDING = 8;           // min gap from viewport edge
      const WIDTH   = Math.min(320, vw - PADDING * 2);
      const btnRect = btnRef.current.getBoundingClientRect();
      // Try to right-align to the button; shift left if that would clip the left edge
      let rightEdge = btnRect.right;           // natural right-align anchor
      let leftPos   = rightEdge - WIDTH;
      if (leftPos < PADDING) leftPos = PADDING;
      if (leftPos + WIDTH > vw - PADDING) leftPos = vw - PADDING - WIDTH;
      // Convert back to offset relative to the wrapper (which is position:relative)
      const wrapRect = ref.current.getBoundingClientRect();
      setDropPos({
        left:  leftPos - wrapRect.left,
        right: 'auto',
        width: WIDTH,
      });
    }
    setOpen(next);
    if (next && unreadCount > 0) markAllRead();
  };

  const handleItemClick = (item) => {
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  // Unread chat threads (those with unread > 0)
  const unreadChats = chatThreads.filter(t => t.unread > 0);

  // Total badge = exam notifications + unread chats
  const totalBadge = unreadCount + chatUnread;

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        ref={btnRef}
        style={{
          ...styles.bellBtn,
          ...(pulse ? styles.bellPulse : {}),
        }}
        onClick={handleToggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Notifications"
        title="Notifications"
      >
        🔔
        {totalBadge > 0 && (
          <span style={styles.badge}>{totalBadge > 9 ? '9+' : totalBadge}</span>
        )}
      </button>

      {open && (
        <div style={{
          ...styles.dropdown,
          left:  dropPos.left,
          right: dropPos.right,
          width: dropPos.width,
        }}>
          <div style={styles.header}>Notifications</div>

          {/* ── CHAT MESSAGES SECTION ── */}
          {unreadChats.length > 0 && (
            <>
              <div style={styles.sectionLabel}>💬 New Messages</div>

              {unreadChats.length === 1 ? (
                /* Single unread chat → go directly to that chat */
                <button
                  style={{ ...styles.item, ...styles.chatItem }}
                  onClick={() => {
                    setOpen(false);
                    navigate(`${chatBase}/${unreadChats[0].otherUid}`, {
                      state: { name: unreadChats[0].otherName }
                    });
                  }}
                >
                  <div style={styles.chatRow}>
                    <div style={styles.chatAvatar}>
                      {(unreadChats[0].otherName || 'S')[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={styles.chatName}>
                        {unreadChats[0].otherName}
                      </div>
                      <div style={styles.chatPreview}>
                        {unreadChats[0].lastMessage === '🎤 Voice message' ? '🎤 Voice message'
                          : unreadChats[0].lastMessage === '📷 Photo' ? '📷 Photo'
                          : unreadChats[0].lastMessage || 'Sent you a message'}
                      </div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
                      <div style={styles.unreadBadge}>
                        {unreadChats[0].unread > 99 ? '99+' : unreadChats[0].unread}
                      </div>
                      <div style={styles.chatTime}>
                        {timeAgo(tsToDate(unreadChats[0].updatedAt))}
                      </div>
                    </div>
                  </div>
                </button>
              ) : (
                /* Multiple unread chats → show each, also offer "View all" */
                <>
                  {unreadChats.slice(0, 3).map(t => (
                    <button
                      key={t.chatId}
                      style={{ ...styles.item, ...styles.chatItem }}
                      onClick={() => {
                        setOpen(false);
                        navigate(`${chatBase}/${t.otherUid}`, {
                          state: { name: t.otherName }
                        });
                      }}
                    >
                      <div style={styles.chatRow}>
                        <div style={styles.chatAvatar}>
                          {(t.otherName || 'S')[0].toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={styles.chatName}>
                            {t.otherName}
                          </div>
                          <div style={styles.chatPreview}>
                            {t.lastMessage === '🎤 Voice message' ? '🎤 Voice message'
                              : t.lastMessage === '📷 Photo' ? '📷 Photo'
                              : t.lastMessage || 'Sent you a message'}
                          </div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5 }}>
                          <div style={styles.unreadBadge}>
                            {t.unread > 99 ? '99+' : t.unread}
                          </div>
                          <div style={styles.chatTime}>
                            {timeAgo(tsToDate(t.updatedAt))}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                  <button
                    style={styles.viewAllBtn}
                    onClick={() => { setOpen(false); navigate(inboxPath); }}
                  >
                    View all messages →
                  </button>
                </>
              )}
            </>
          )}

          {/* No unread chats but has chats → show inbox link */}
          {chatThreads.length > 0 && unreadChats.length === 0 && (
            <button
              style={styles.inboxLink}
              onClick={() => { setOpen(false); navigate(inboxPath); }}
            >
              💬 Open Messages Inbox
            </button>
          )}

          {/* ── GROUP CHAT UNREAD ── */}
          {groupUnread > 0 && (
            <>
              <div style={styles.sectionLabel}>👥 Community Chat</div>
              <button
                style={{ ...styles.item, ...styles.chatItem }}
                onClick={() => {
                  setOpen(false);
                  navigate(mode === 'entrance' ? '/entrance-exam/group-chat' : '/group-chat');
                }}
              >
                <div style={styles.chatRow}>
                  <div style={{ ...styles.chatAvatar, fontSize: 18 }}>👥</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={styles.chatName}>
                      {mode === 'entrance' ? 'Entrance Exam Groups' : 'NMCN Study Groups'}
                    </div>
                    <div style={styles.chatPreview}>
                      You have unread group messages
                    </div>
                  </div>
                  <div style={styles.unreadBadge}>
                    {groupUnread > 99 ? '99+' : groupUnread}
                  </div>
                </div>
              </button>
            </>
          )}

          {/* ── EXAM ANNOUNCEMENTS SECTION ── */}
          {items.length > 0 && (
            <div style={styles.sectionLabel}>📢 Exam Updates</div>
          )}

          {loading ? (
            <div style={styles.empty}>Loading…</div>
          ) : items.length === 0 && chatThreads.length === 0 && groupUnread === 0 ? (
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
  bellPulse: {
    animation: 'bellRing 0.4s ease 0s 3',
    background: 'rgba(13,148,136,0.25)',
    borderColor: 'rgba(13,148,136,0.6)',
  },
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
    position: 'absolute', top: 'calc(100% + 8px)',
    /* left/right/width injected dynamically per render */
    background: 'rgba(11,24,38,0.82)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: 14,
    boxShadow: '0 12px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(13,148,136,0.12)',
    overflow: 'hidden', zIndex: 200,
    animation: 'fadeIn 0.15s ease',
  },
  header: {
    padding: '13px 16px', fontSize: 13, fontWeight: 800,
    color: '#F1F5F9', borderBottom: '1px solid rgba(255,255,255,0.08)',
    textTransform: 'uppercase', letterSpacing: 0.6,
    fontFamily: H,
    background: 'rgba(13,148,136,0.10)',
  },
  sectionLabel: {
    padding: '8px 16px 4px',
    fontSize: 10, fontWeight: 800, letterSpacing: 1,
    color: 'rgba(148,163,184,0.9)',
    textTransform: 'uppercase',
    fontFamily: H,
    borderTop: '1px solid rgba(255,255,255,0.07)',
  },
  list: { maxHeight: 240, overflowY: 'auto' },
  item: {
    display: 'block', width: '100%', textAlign: 'left',
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    transition: 'background 0.15s',
  },
  chatItem: {
    padding: '10px 14px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  chatRow: {
    display: 'flex', alignItems: 'center', gap: 10,
  },
  chatAvatar: {
    width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
    background: 'linear-gradient(135deg,#0D9488,#1E3A8A)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: H, fontWeight: 900, color: '#fff', fontSize: 15,
  },
  chatName: {
    fontFamily: H, fontWeight: 900, fontSize: 13,
    color: '#F1F5F9',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    marginBottom: 3,
  },
  chatPreview: {
    fontSize: 12, fontWeight: 700,
    color: 'rgba(148,163,184,0.9)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    fontFamily: F,
  },
  chatTime: {
    fontSize: 10, fontWeight: 700,
    color: 'rgba(100,116,139,0.9)',
    fontFamily: F,
  },
  unreadBadge: {
    minWidth: 18, height: 18, borderRadius: 9,
    background: '#0D9488', color: '#fff',
    fontSize: 10, fontWeight: 900, fontFamily: H,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 4px',
  },
  viewAllBtn: {
    display: 'block', width: '100%', textAlign: 'center',
    background: 'rgba(13,148,136,0.12)', border: 'none', cursor: 'pointer',
    padding: '10px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontSize: 12, fontWeight: 800, color: '#2dd4bf',
    fontFamily: F, letterSpacing: 0.3,
    transition: 'background 0.15s',
  },
  inboxLink: {
    display: 'block', width: '100%', textAlign: 'left',
    background: 'none', border: 'none', cursor: 'pointer',
    padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    fontSize: 13, fontWeight: 700, color: 'rgba(148,163,184,0.9)',
    fontFamily: F, transition: 'background 0.15s',
  },
  itemTop: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginBottom: 4,
  },
  itemTitle: {
    fontSize: 13, fontWeight: 700, color: '#F1F5F9',
    lineHeight: 1.3, fontFamily: F,
  },
  itemMsg: {
    fontSize: 12, color: 'rgba(148,163,184,0.9)', lineHeight: 1.4,
    marginBottom: 4, fontFamily: F,
  },
  itemTime: {
    fontSize: 11, color: 'rgba(100,116,139,0.8)', fontFamily: F,
  },
  modeBadge: {
    fontSize: 9, fontWeight: 800, letterSpacing: 0.8,
    color: '#fff', padding: '3px 7px', borderRadius: 20,
    textTransform: 'uppercase', flexShrink: 0,
  },
  empty: {
    padding: '20px 16px', textAlign: 'center',
    fontSize: 13, color: 'rgba(148,163,184,0.8)', fontFamily: F,
  },
};
