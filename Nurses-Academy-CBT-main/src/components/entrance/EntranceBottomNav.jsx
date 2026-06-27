// src/components/entrance/EntranceBottomNav.jsx
//
// Draggable FAB with full-circle orbit menu.
// All icons appear at once, evenly spaced on a 360° ring.
// Radius is auto-calculated so icons never overlap.
// FAB shows a red message-notification badge when unread DMs arrive.
// • 1 unread conversation  → tap badge → open that chat directly
// • 2+ unread conversations → tap badge → open ChatInbox (threads list)

import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  collection, query, where, onSnapshot, doc,
} from 'firebase/firestore';
import { ENTRANCE_GROUP_SUBJECTS } from './EntranceGroupChatHub';
import { db } from '../../firebase/config';

/* ── Base nav items (all users) ─────────────────────────────────────────── */
const BASE_NAV = [
  { icon: '🏠', label: 'Home',       to: '/entrance-exam'               },
  { icon: '🗓️', label: 'Daily Mock', to: '/entrance-exam/daily-mock'    },
  { icon: '🏫', label: 'Schools',    to: '/entrance-exam/schools'       },
  { icon: '📚', label: 'Drill',      to: '/entrance-exam/subject-drill' },
  { icon: '📋', label: 'Exams',      to: '/entrance-exam/exams-taken'   },
  { icon: '🔖', label: 'Bookmarks',  to: '/entrance-exam/bookmarks'     },
  { icon: '📊', label: 'Results',    to: '/entrance-exam/my-results'    },
  { icon: '📈', label: 'Analysis',   to: '/entrance-exam/analysis'      },
  { icon: '🏆', label: 'Top',        to: '/entrance-exam/leaderboard'   },
  { icon: '🤝', label: 'Buddy',      to: '/entrance-exam/study-buddy'   },
  { icon: '👥', label: 'Group Chat', to: '/entrance-exam/group-chat'    },
  { icon: '💬', label: 'Messages',   to: '/entrance-exam/chat-inbox'    },
];

/* ── Admin-only extra item ──────────────────────────────────────────────── */
const ADMIN_ITEM = { icon: '🛡️', label: 'Control', to: '/admin' };

const FAB_SIZE  = 62;
const ICON_SIZE = 58;
const MIN_GAP   = 10;

const DRAG_THRESHOLD = 5;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function calcRadius(n) {
  return Math.ceil((ICON_SIZE + MIN_GAP) / (2 * Math.sin(Math.PI / n))) + 4;
}

/* ── Hook: listen to unread DM counts ──────────────────────────────────── */
function useUnreadMessages(myUid) {
  // Returns: { totalUnread, unreadThreads: [{chatId, otherUid, otherName, unread}] }
  const [state, setState] = useState({ totalUnread: 0, unreadThreads: [] });

  useEffect(() => {
    if (!myUid) return;
    const q = query(
      collection(db, 'directChats'),
      where('participants', 'array-contains', myUid),
    );
    const unsub = onSnapshot(q, (snap) => {
      const threads = [];
      let total = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        const unread = data.unreadCounts?.[myUid] || 0;
        if (unread > 0) {
          const otherUid = data.participants?.find(p => p !== myUid) || '';
          threads.push({
            chatId: d.id,
            otherUid,
            // participantNames is an optional map {uid: name} some apps store;
            // lastSenderName is written by some ChatPage versions.
            // Fall back to 'Student' gracefully.
            otherName:
              data.participantNames?.[otherUid] ||
              data.lastSenderName ||
              'Student',
            unread,
          });
          total += unread;
        }
      });
      setState({ totalUnread: total, unreadThreads: threads });
    }, () => {});
    return unsub;
  }, [myUid]);

  return state;
}

/* ── Hook: listen to unread entrance group chat counts ─────────────────── */
// Uses a single unreadMap ref to accumulate per-group counts correctly.
// Also handles fallback for non-members: if no explicit unreadCounts entry,
// checks lastMessageAt vs entranceGroupLastReadAt on the user doc.
function useEntranceGroupUnread(myUid) {
  const [total, setTotal] = useState(0);
  const unreadMap = useRef({});
  const myLastReadAt = useRef(null);

  // Load user's entranceGroupLastReadAt once on mount
  useEffect(() => {
    if (!myUid) return;
    import('firebase/firestore').then(({ getDoc, doc: fsDoc }) => {
      getDoc(fsDoc(db, 'users', myUid))
        .then(snap => {
          if (snap.exists()) {
            const ts = snap.data().entranceGroupLastReadAt;
            myLastReadAt.current = ts?.toDate?.() || null;
          }
        })
        .catch(() => {});
    });
  }, [myUid]);

  useEffect(() => {
    if (!myUid) return;
    const unsubs = ENTRANCE_GROUP_SUBJECTS.map(grp => {
      return onSnapshot(doc(db, 'entranceGroupChats', grp.id), snap => {
        if (!snap.exists()) {
          unreadMap.current[grp.id] = 0;
        } else {
          const data = snap.data();
          const explicitUnread = data.unreadCounts?.[myUid] || 0;
          if (explicitUnread > 0) {
            unreadMap.current[grp.id] = explicitUnread;
          } else if (data.lastMessageBy && data.lastMessageBy !== myUid) {
            // Fallback for non-members: check lastMessageAt vs user's last read
            const lastMsgAt = data.lastMessageAt?.toDate?.() || null;
            if (lastMsgAt && myLastReadAt.current && lastMsgAt > myLastReadAt.current) {
              unreadMap.current[grp.id] = 1;
            } else if (lastMsgAt && !myLastReadAt.current) {
              unreadMap.current[grp.id] = 1;
            } else {
              unreadMap.current[grp.id] = 0;
            }
          } else {
            unreadMap.current[grp.id] = 0;
          }
        }
        setTotal(Object.values(unreadMap.current).reduce((a, b) => a + b, 0));
      }, () => { unreadMap.current[grp.id] = 0; });
    });
    return () => unsubs.forEach(u => u());
  }, [myUid]);

  return total;
}

/* ── Component ──────────────────────────────────────────────────────────── */
export default function EntranceBottomNav() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { isAdmin, user } = useAuth();
  const myUid = user?.uid;

  // Unread message state
  const { totalUnread, unreadThreads } = useUnreadMessages(myUid);
  const groupUnread = useEntranceGroupUnread(myUid);

  // Build nav items — admin gets Control Panel appended
  const NAV_ITEMS = isAdmin ? [...BASE_NAV, ADMIN_ITEM] : BASE_NAV;
  const N          = NAV_ITEMS.length;
  const ARC_RADIUS = calcRadius(N);

  const [fabPos, setFabPos]   = useState({ fx: 0.88, fy: 0.84 });
  const [open, setOpen]       = useState(false);
  const [openPct, setOpenPct] = useState(0);

  // Badge pulse animation
  const [badgePulse, setBadgePulse] = useState(false);
  const prevUnread = useRef(0);

  useEffect(() => {
    if (combinedUnread > prevUnread.current) {
      // New message arrived — pulse the badge
      setBadgePulse(true);
      const t = setTimeout(() => setBadgePulse(false), 1200);
      prevUnread.current = combinedUnread;
      return () => clearTimeout(t);
    }
    prevUnread.current = combinedUnread;
  }, [combinedUnread]);

  const openPctRef   = useRef(0);
  const animFrameRef = useRef(null);
  const dragRef      = useRef({ on: false, sx: 0, sy: 0, ofx: 0, ofy: 0, moved: false });
  const fabRef       = useRef(null);

  useEffect(() => { setOpen(false); }, [location.pathname]);

  useEffect(() => {
    const target = open ? 1 : 0;
    const step = () => {
      const diff = target - openPctRef.current;
      if (Math.abs(diff) < 0.008) {
        openPctRef.current = target;
        setOpenPct(target);
        return;
      }
      openPctRef.current += diff * 0.17;
      setOpenPct(openPctRef.current);
      animFrameRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [open]);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    dragRef.current = {
      on: true, moved: false,
      sx: e.clientX, sy: e.clientY,
      ofx: fabPos.fx, ofy: fabPos.fy,
    };
    fabRef.current?.setPointerCapture?.(e.pointerId);
  }, [fabPos]);

  const onPointerMove = useCallback((e) => {
    if (!dragRef.current.on) return;
    const dx = e.clientX - dragRef.current.sx;
    const dy = e.clientY - dragRef.current.sy;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) dragRef.current.moved = true;
    if (!dragRef.current.moved) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const pad = FAB_SIZE / 2;
    setFabPos({
      fx: clamp((dragRef.current.ofx * vw + dx) / vw,  pad / vw,  1 - pad / vw),
      fy: clamp((dragRef.current.ofy * vh + dy) / vh, pad / vh, 1 - pad / vh),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragRef.current.on) return;
    dragRef.current.on = false;
    if (!dragRef.current.moved) setOpen(v => !v);
  }, []);

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup',   onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup',   onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  /* ── Badge tap handler ── */
  const handleBadgeTap = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    if (unreadThreads.length === 1) {
      // Only one conversation with unread — go directly to it
      const t = unreadThreads[0];
      navigate(`/entrance-exam/chat/${t.otherUid}`, {
        state: { name: t.otherName, school: t.otherSchool || '', from: 'entrance' },
      });
    } else {
      // Multiple conversations — go to inbox with unread highlights
      navigate('/entrance-exam/chat-inbox', { state: { from: 'entrance' } });
    }
  }, [unreadThreads, navigate]);

  const vw = typeof window !== 'undefined' ? window.innerWidth  : 400;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const fabX = fabPos.fx * vw;
  const fabY = fabPos.fy * vh;
  const p    = openPct;

  const isActive = (to) =>
    to === '/entrance-exam'
      ? location.pathname === to
      : location.pathname.startsWith(to);

  const combinedUnread = totalUnread + groupUnread;
  const badgeCount = combinedUnread > 99 ? '99+' : combinedUnread > 0 ? String(combinedUnread) : null;

  return (
    <>
      {/* ── Pulse keyframes injected once ────────────────────────────────── */}
      <style>{`
        @keyframes fabBadgePop {
          0%   { transform: scale(1); }
          30%  { transform: scale(1.45); }
          60%  { transform: scale(0.9); }
          100% { transform: scale(1); }
        }
        @keyframes fabBadgePulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
          50%     { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
        }
        .fab-badge-btn {
          position: absolute;
          top: -6px;
          right: -6px;
          min-width: 20px;
          height: 20px;
          border-radius: 10px;
          background: #EF4444;
          border: 2px solid #020B18;
          color: #fff;
          font-size: 10px;
          font-weight: 900;
          font-family: 'Arial Black', Arial, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
          cursor: pointer;
          z-index: 8300;
          line-height: 1;
          animation: fabBadgePulse 2s ease-in-out infinite;
          transition: transform 0.15s;
          pointer-events: all;
          -webkit-tap-highlight-color: transparent;
        }
        .fab-badge-btn:hover  { transform: scale(1.15); }
        .fab-badge-btn:active { transform: scale(0.92); }
        .fab-badge-btn.popped { animation: fabBadgePop 0.45s ease, fabBadgePulse 2s 0.45s ease-in-out infinite; }
      `}</style>

      {/* Backdrop */}
      {p > 0.02 && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 8000,
            background: `rgba(0,0,0,${0.48 * p})`,
            backdropFilter: `blur(${4 * p}px)`,
            WebkitBackdropFilter: `blur(${4 * p}px)`,
          }}
        />
      )}

      {/* Dashed orbit ring */}
      {p > 0.1 && (
        <svg style={{
          position: 'fixed', inset: 0,
          width: '100vw', height: '100vh',
          pointerEvents: 'none', zIndex: 8050,
          overflow: 'visible',
        }}>
          <circle
            cx={fabX} cy={fabY}
            r={ARC_RADIUS * p}
            fill="none"
            stroke={`rgba(13,148,136,${0.22 * p})`}
            strokeWidth="1"
            strokeDasharray="4 7"
          />
        </svg>
      )}

      {/* Icon buttons — full circle */}
      {p > 0.02 && NAV_ITEMS.map((item, i) => {
        const angleDeg = (360 / N) * i - 90;
        const rad  = angleDeg * Math.PI / 180;
        const dist = ARC_RADIUS * p;
        const left = fabX + Math.cos(rad) * dist - ICON_SIZE / 2;
        const top  = fabY + Math.sin(rad) * dist - ICON_SIZE / 2;
        const active  = isActive(item.to);
        const isAdmin_ = item.to === '/admin';
        const sc = 0.4 + 0.6 * p;

        return (
          <button
            key={item.to}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              if (item.to === '/entrance-exam/chat-inbox') {
                navigate('/entrance-exam/chat-inbox', { state: { from: 'entrance' } });
              } else {
                navigate(item.to);
              }
            }}
            style={{
              position: 'fixed', left, top,
              width: ICON_SIZE, height: ICON_SIZE,
              zIndex: 8100,
              borderRadius: '50%',
              background: active
                ? 'rgba(13,148,136,0.25)'
                : isAdmin_
                  ? 'rgba(124,58,237,0.18)'
                  : 'rgba(4,18,36,0.88)',
              border: active
                ? '2px solid #2dd4bf'
                : isAdmin_
                  ? '1.5px solid rgba(124,58,237,0.6)'
                  : '1.5px solid rgba(13,148,136,0.35)',
              boxShadow: active
                ? '0 0 14px rgba(13,148,136,0.5)'
                : isAdmin_
                  ? '0 3px 14px rgba(124,58,237,0.3)'
                  : '0 3px 14px rgba(0,0,0,0.55)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 2, padding: 0,
              opacity: p,
              transform: `scale(${sc})`,
              cursor: 'pointer', outline: 'none',
              WebkitTapHighlightColor: 'transparent',
              transition: 'border-color 0.15s, background 0.15s',
              fontFamily: "'Arial Black', Arial, sans-serif",
            }}
          >
            <span style={{ fontSize: 22, lineHeight: 1 }}>{item.icon}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, lineHeight: 1,
              color: active ? '#2dd4bf' : isAdmin_ ? '#A855F7' : 'rgba(255,255,255,0.65)',
              letterSpacing: 0.2,
            }}>
              {item.label}
            </span>
          </button>
        );
      })}

      {/* ── Draggable FAB + notification badge ──────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          left: fabX - FAB_SIZE / 2,
          top:  fabY - FAB_SIZE / 2,
          width: FAB_SIZE, height: FAB_SIZE,
          zIndex: 8200,
          /* relative so the badge positions against it */
          position: 'fixed',
        }}
      >
        {/* The actual draggable circle */}
        <div
          ref={fabRef}
          onPointerDown={onPointerDown}
          style={{
            position: 'absolute',
            left: 0, top: 0,
            width: FAB_SIZE, height: FAB_SIZE,
            borderRadius: '50%',
            background: open ? 'linear-gradient(135deg,#0f766e,#0d9488)' : '#020B18',
            border: `2.5px solid ${open ? '#2dd4bf' : 'rgba(13,148,136,0.65)'}`,
            boxShadow: open
              ? `0 0 0 ${Math.round(5 * p)}px rgba(13,148,136,0.18), 0 8px 28px rgba(13,148,136,0.35)`
              : '0 4px 20px rgba(0,0,0,0.7), 0 0 0 1px rgba(13,148,136,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'grab',
            touchAction: 'none',
            userSelect: 'none', WebkitUserSelect: 'none',
            transform: `scale(${1 + 0.1 * p})`,
            transition: 'background 0.25s, border-color 0.25s, box-shadow 0.25s',
          }}
        >
          <svg
            width="24" height="24" viewBox="0 0 24 24" fill="none"
            style={{ transform: `rotate(${45 * p}deg)`, pointerEvents: 'none' }}
          >
            <line x1="12" y1="4"  x2="12" y2="20"
              stroke="#2dd4bf" strokeWidth="2.4" strokeLinecap="round"/>
            <line x1="4"  y1="12" x2="20" y2="12"
              stroke="#2dd4bf" strokeWidth="2.4" strokeLinecap="round"/>
          </svg>
        </div>

        {/* ── Message notification badge ── */}
        {badgeCount && (
          <button
            className={`fab-badge-btn${badgePulse ? ' popped' : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleBadgeTap}
            aria-label={`${totalUnread} unread message${totalUnread > 1 ? 's' : ''}`}
            title={
              unreadThreads.length === 1
                ? `New message from ${unreadThreads[0].otherName}`
                : `${unreadThreads.length} conversations with new messages`
            }
          >
            {badgeCount}
          </button>
        )}
      </div>
    </>
  );
}
