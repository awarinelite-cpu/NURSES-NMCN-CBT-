// src/components/shared/DashMenuSheet.jsx
// Bottom-sheet opened by the "Menu" button on the navy bottom nav.
// Holds what used to sit at the bottom of the dashboard:
//   Track Your Progress · Progress and Community · Entrance Exam mode
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import DailyChallenge from './DailyChallenge';

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
const INK = '#10301d';
const DEEP = '#04472b';
const DEEPER = '#02341f';

const PATHS = {
  bars: <path d="M6 20V11M11 20V6M16 20V9M21 20V14" />,
  community: <><circle cx="12" cy="8" r="3" /><circle cx="5.5" cy="10" r="2.2" /><circle cx="18.5" cy="10" r="2.2" /><path d="M6.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M1.5 18c0-2.2 1.5-3.7 3.5-4M22.5 18c0-2.2-1.5-3.7-3.5-4" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5c2 .7 3.5 2.6 3.5 5.5" /></>,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>,
  chat: <path d="M21 12a8 8 0 0 1-11.7 7L3 21l2-5.3A8 8 0 1 1 21 12z" />,
  inbox: <><path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M3 13h5l1 3h6l1-3h5" /></>,
  star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />,
  flame: <path d="M12 22c4 0 7-2.8 7-7 0-3-2-5.5-3.5-7-.3 1.8-1.3 3-2.5 3 .5-3-1-6-4-8 0 4-4.5 6.5-4.5 12 0 4.2 3 7 7 7z" />,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></>,
  cap: <><path d="m2 9 10-5 10 5-10 5z" /><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v6" /></>,
};

function Icon({ name, size = 22, stroke = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{PATHS[name]}</svg>
  );
}

const T = {
  blue:   { bg: '#E0EAFF', fg: '#2F4DD0' },
  green:  { bg: '#DCF5E3', fg: '#1F7A3D' },
  orange: { bg: '#FFE7D3', fg: '#C2501A' },
  purple: { bg: '#EAE4FF', fg: '#6B3FD4' },
  yellow: { bg: '#FFF1C9', fg: '#C27A06' },
  pink:   { bg: '#FFE0EC', fg: '#C2336B' },
  red:    { bg: '#FFE4DA', fg: '#D1432A' },
};

const COMMUNITY = [
  { to: '/progress-wall', label: 'Progress Wall',   icon: 'map',    tint: 'green'  },
  { to: '/study-buddy',   label: 'Study Buddy',     icon: 'users',  tint: 'orange' },
  { to: '/leaderboard',   label: 'Leaderboard',     icon: 'trophy', tint: 'purple' },
  { to: '/group-chat',    label: 'Group Chat',      icon: 'chat',   tint: 'yellow' },
  { to: '/chat-inbox',    label: 'Chat Inbox',      icon: 'inbox',  tint: 'pink'   },
  { to: '/badges',        label: 'Badges',          icon: 'star',   tint: 'blue'   },
  { action: 'daily',      label: 'Daily Challenge', icon: 'flame',  tint: 'green'  },
  { to: '/group-chat',    label: 'Group Study',     icon: 'video',  tint: 'red'    },
];

function Tile({ item, onNavigate, onAction }) {
  const t = T[item.tint];
  const inner = (
    <>
      <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={item.icon} size={19} />
      </span>
      <span style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.25, color: INK, textAlign: 'left' }}>{item.label}</span>
    </>
  );
  const style = {
    display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, padding: '10px 11px',
    background: '#fff', borderRadius: 16, boxShadow: '0 1px 4px rgba(20,83,45,0.07)',
    border: '1px solid #E3F0E6', textDecoration: 'none', cursor: 'pointer', fontFamily: FONT,
    WebkitTapHighlightColor: 'transparent',
  };
  return item.action
    ? <button type="button" style={style} onClick={() => onAction(item.action)}>{inner}</button>
    : <Link to={item.to} style={style} onClick={onNavigate}>{inner}</Link>;
}

function Head({ icon, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '18px 2px 10px' }}>
      <span style={{ color: '#1c8a3a', display: 'flex' }}><Icon name={icon} size={24} stroke={2.4} /></span>
      <h3 style={{ margin: 0, fontFamily: FONT, fontSize: 18, fontWeight: 800, color: INK }}>{title}</h3>
    </div>
  );
}

export default function DashMenuSheet({ open, onClose }) {
  const [showDaily, setShowDaily] = useState(false);
  const { pathname } = useLocation();

  // Close whenever the route changes
  useEffect(() => { onClose(); setShowDaily(false); /* eslint-disable-next-line */ }, [pathname]);

  // Lock page scroll while the sheet is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontFamily: FONT }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', boxSizing: 'border-box',
        background: '#F1FAF3', borderRadius: '24px 24px 0 0',
        padding: '14px 14px calc(24px + env(safe-area-inset-bottom, 0px))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: INK }}>{showDaily ? 'Daily Challenge' : 'Menu'}</h2>
          <button type="button" onClick={showDaily ? () => setShowDaily(false) : onClose} aria-label="Close"
            style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#fff', color: INK, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={16} />
          </button>
        </div>

        {showDaily ? (
          <div style={{ marginTop: 10 }}><DailyChallenge /></div>
        ) : (
          <>
            <Head icon="bars" title="Track Your Progress" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(120deg,#e4f7df,#cdeec8)', border: '1px solid #bfe3b8', borderRadius: 22, padding: '14px 14px', boxShadow: '0 3px 8px rgba(20,90,40,.10)' }}>
              <svg width="46" height="40" viewBox="0 0 46 40" aria-hidden="true" style={{ flexShrink: 0 }}>
                <rect x="2" y="26" width="8" height="12" rx="2" fill="#2fa84a" />
                <rect x="14" y="18" width="8" height="20" rx="2" fill="#1f8f3b" />
                <rect x="26" y="8" width="8" height="30" rx="2" fill="#177a31" />
                <rect x="38" y="2" width="6" height="36" rx="2" fill="#0f6428" />
              </svg>
              <div style={{ width: 1, alignSelf: 'stretch', background: 'rgba(20,90,40,.2)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: INK }}>Your Performance</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginTop: 4 }}>See your overall progress</div>
              </div>
              <Link to="/performance" onClick={onClose} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1.5px solid #1c8a3a', color: INK, fontWeight: 700, fontSize: 13.5, padding: '9px 12px', borderRadius: 22, textDecoration: 'none', background: 'rgba(255,255,255,.55)', flexShrink: 0 }}>
                View Details <Icon name="arrow" size={16} stroke={2.4} />
              </Link>
            </div>

            <Head icon="community" title="Progress and Community" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {COMMUNITY.map(p => <Tile key={p.label} item={p} onNavigate={onClose} onAction={a => a === 'daily' && setShowDaily(true)} />)}
            </div>

            <Link to="/entrance-exam" onClick={onClose} style={{
              marginTop: 18, background: `linear-gradient(120deg,#0b5a31,${DEEPER})`, borderRadius: 20, padding: '14px 16px', textDecoration: 'none',
              display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 12px rgba(2,52,31,.25)',
            }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: '#f2b01e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="cap" size={22} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16.5, fontWeight: 800, color: '#fff' }}>Entrance Exam mode</div>
                <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 1 }}>Its own drills, results and chats</div>
              </div>
              <span style={{ color: '#fff', display: 'flex' }}><Icon name="chevron" size={20} /></span>
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
