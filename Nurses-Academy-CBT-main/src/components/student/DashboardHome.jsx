// src/components/student/DashboardHome.jsx
// Mobile-first student home, styled after the "Elite Nurses" design mock:
// wave header with logo + round action buttons, greeting with nurse illustration,
// trophy progress card, four gradient quick tiles, upcoming-exam card,
// "Practice and Exams" / "Progress and Community" 3-column grids, floating bottom nav.
// Presentational only: all data comes from StudentDashboard via props.

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFontSize } from '../../context/FontSizeContext';

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
const INK = '#0B3D1E';
const SUB = '#35523F';
const GREEN = '#0F5F2B';
const ASSET = (f) => `${process.env.PUBLIC_URL || ''}/dashboard/${f}`;

// ── Filled/line icons (24x24) ─────────────────────────────────────────────────
const P = {
  book: <><path d="M3 5.5C5.5 4 8.5 4 12 6v14c-3.5-2-6.5-2-9-.5z" /><path d="M21 5.5C18.5 4 15.5 4 12 6v14c3.5-2 6.5-2 9-.5z" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6M9 9h2" /></>,
  bars: <><path d="M6 20V11M12 20V4M18 20v-6" /></>,
  trend: <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 9.5" /></>,
  play: <><path d="m7 4 13 8-13 8z" /></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M16 3v4M8 3v4M4 11h16M8 15h3M13 15h3" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  medkit: <><rect x="4" y="6" width="16" height="14" rx="3" /><path d="M9 6V4h6v2M12 10v6M9 13h6" /></>,
  bookmark: <><path d="M6 3h12v18l-6-4-6 4z" /></>,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5c2 .7 3.5 2.6 3.5 5.5" /></>,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>,
  chat: <><path d="M21 12a8 8 0 0 1-11.7 7L3 21l2-5.3A8 8 0 1 1 21 12z" /><path d="M8.5 12h.01M12 12h.01M15.5 12h.01" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 8 8 6 8-6" /></>,
  shield: <><path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z" /><path d="m12 8.5 1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z" /></>,
  home: <><path d="M3 11 12 3l9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  cap: <><path d="m2 9 10-5 10 5-10 5z" /><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v6" /></>,
};

function Icon({ name, size = 22, color = 'currentColor', fill = 'none', sw = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color}
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {P[name]}
    </svg>
  );
}

// ── Tints for the small tiles (bg gradient, border, icon bubble, icon colour) ─
const TINT = {
  blue:   { bg: 'linear-gradient(135deg,#E6EEFF,#D5E2FF)', bd: '#C3D5FF', bubble: '#CFDDFF', fg: '#2447D8' },
  green:  { bg: 'linear-gradient(135deg,#E3F7E9,#CDEFD8)', bd: '#B8E3C6', bubble: '#BFE8CC', fg: '#12702F' },
  orange: { bg: 'linear-gradient(135deg,#FFEDE2,#FFDCC8)', bd: '#FFCDB0', bubble: '#FFD3B8', fg: '#E8570F' },
  purple: { bg: 'linear-gradient(135deg,#F0E8FF,#E3D5FF)', bd: '#D6C5FA', bubble: '#E0D2FF', fg: '#6A2FD6' },
  pink:   { bg: 'linear-gradient(135deg,#FFE6F0,#FFD3E5)', bd: '#FFC2DB', bubble: '#FFCBE0', fg: '#E0246B' },
  yellow: { bg: 'linear-gradient(135deg,#FFF4D6,#FFE9B0)', bd: '#FFDD8A', bubble: '#FFE29A', fg: '#F29A00' },
  teal:   { bg: 'linear-gradient(135deg,#DDF4F4,#C6EAEA)', bd: '#B2DFE0', bubble: '#BBE4E5', fg: '#12707A' },
};

const BIG = [
  { to: '/lecture-notes', title: 'Study Materials',    sub: 'Learn & Prepare',        icon: 'book',  c: '#1E40C9', bg: 'linear-gradient(135deg,#E8EFFF,#D3E0FF)', bd: '#BCD0FF', chev: '#2A5BE8', iconBox: false },
  { to: '/quick-actions', title: 'Practice Questions', sub: 'Test Your Knowledge',    icon: 'check', c: '#0F5F2B', bg: 'linear-gradient(135deg,#E4F8EA,#C9EFD6)', bd: '#AEE2BF', chev: '#17803B', iconBox: true },
  { to: '/exams',         title: 'Take CBT Exam',      sub: 'Simulate the Real Exam', icon: 'play',  c: '#7A1F0C', bg: 'linear-gradient(135deg,#FFEEDF,#FFD9BD)', bd: '#FFC59B', chev: '#F5731A', iconBox: false, iconColor: '#EE5A12', iconFill: '#EE5A12' },
  { to: '/results',       title: 'My Results',         sub: 'Track Your Performance', icon: 'bars',  c: '#2A1066', bg: 'linear-gradient(135deg,#F1E9FF,#E0D2FF)', bd: '#CDB8F7', chev: '#7B3FE4', iconBox: true, iconColor: '#6A2FD6' },
];

const PRACTICE = [
  { to: '/course-drill',    label: 'Course\nDrill',         icon: 'doc',      tint: 'blue'   },
  { to: '/topic-drill',     label: 'Topic\nDrill',          icon: 'target',   tint: 'green'  },
  { to: '/mock-exams',      label: 'Hospital\nFinal Prep',  icon: 'medkit',   tint: 'orange' },
  { to: '/daily-mock-exam', label: 'Daily Mock\nExam',      icon: 'calendar', tint: 'purple' },
  { to: '/bookmarks',       label: 'Bookmarks',             icon: 'bookmark', tint: 'green'  },
  { to: '/essay-questions', label: 'Essay\nQuestions',      icon: 'pencil',   tint: 'pink'   },
];

const COMMUNITY = [
  { to: '/progress-wall', label: 'Progress Wall', icon: 'trend',  tint: 'green'  },
  { to: '/study-buddy',   label: 'Study Buddy',   icon: 'users',  tint: 'orange' },
  { to: '/leaderboard',   label: 'Leaderboard',   icon: 'trophy', tint: 'purple' },
  { to: '/group-chat',    label: 'Group Chat',    icon: 'chat',   tint: 'yellow' },
  { to: '/chat-inbox',    label: 'Chat Inbox',    icon: 'mail',   tint: 'pink'   },
  { to: '/badges',        label: 'Badges',        icon: 'shield', tint: 'teal'   },
];

const NAV = [
  { to: '/dashboard', label: 'Home',      icon: 'home'  },
  { to: '/results',   label: 'Progress',  icon: 'bars'  },
  { to: '/group-chat', label: 'Community', icon: 'users' },
  { to: '/profile',   label: 'Settings',  icon: 'gear'  },
];

// ── Small pieces ──────────────────────────────────────────────────────────────
function SmallTile({ item }) {
  const t = TINT[item.tint];
  return (
    <Link to={item.to} className="dh-press" style={{
      display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, minHeight: 56,
      padding: '7px 8px', borderRadius: 18, background: t.bg, border: `1px solid ${t.bd}`,
      boxShadow: '0 3px 10px rgba(20,83,45,0.10), inset 0 1px 0 rgba(255,255,255,0.8)',
      textDecoration: 'none', WebkitTapHighlightColor: 'transparent',
    }}>
      <span style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: t.bubble, color: t.fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.7)',
      }}>
        <Icon name={item.icon} size={21} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 700, color: INK, lineHeight: 1.18, whiteSpace: 'pre-line', textAlign: 'left' }}>
        {item.label}
      </span>
    </Link>
  );
}

function SectionHead({ icon, title, to }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 4px 9px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ color: GREEN, display: 'flex' }}><Icon name={icon} size={26} fill={GREEN} sw={1.2} /></span>
        <h3 style={{ margin: 0, fontFamily: FONT, fontSize: 18.5, fontWeight: 800, color: INK }}>{title}</h3>
      </div>
      {to && (
        <Link to={to} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, fontWeight: 800, color: INK, textDecoration: 'none' }}>
          See all <Icon name="arrow" size={17} sw={2.4} />
        </Link>
      )}
    </div>
  );
}

function RoundBtn({ children, onClick, label, yellow }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="dh-press" style={{
      position: 'relative', width: 46, height: 46, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
      border: '2px solid rgba(255,255,255,0.35)', color: '#fff', padding: 0,
      background: yellow ? 'linear-gradient(160deg,#B6DA2A,#5FA21A)' : 'linear-gradient(160deg,#2E9A44,#146A2D)',
      boxShadow: '0 3px 8px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT,
    }}>
      {children}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardHome({
  firstName, progressPct, examsCount, avgScore, streak, savedCount,
  daysToExam, examDateLoading, pausedExam, onResume, onNotifications, unreadCount = 0,
}) {
  const { pathname } = useLocation();
  const font = useFontSize();
  const [showFont, setShowFont] = useState(false);

  const pausedPct = pausedExam && pausedExam.totalQuestions
    ? Math.max(4, Math.min(100, Math.round(((pausedExam.currentQuestion || 0) / pausedExam.totalQuestions) * 100)))
    : 0;
  const pct = Math.max(0, Math.min(100, Number(progressPct) || 0));

  const stats = [
    { v: examsCount,     l: 'Exams',     icon: 'doc',   c: '#1E40C9' },
    { v: `${avgScore}%`, l: 'Avg Score', icon: 'bars',  c: '#169A3D' },
    { v: streak,         l: 'Day Streak', icon: 'trend', c: '#E03B2B' },
    { v: savedCount,     l: 'Saved',     icon: 'check', c: '#6A2FD6', filled: true },
  ];

  return (
    <div className="dh-root" style={{ fontFamily: FONT }}>
      <style>{`
        .dh-root { position: relative; width: 100%; min-height: 100%; padding-bottom: 110px; box-sizing: border-box;
          background: radial-gradient(120% 40% at 0% 18%, #D5F2E0 0%, transparent 60%),
                      radial-gradient(90% 30% at 100% 55%, #E4F7EA 0%, transparent 65%),
                      linear-gradient(180deg,#E7F7EE 0%,#F3FBF6 40%,#F6FCF8 100%); overflow-x: hidden; }
        .dh-wrap { max-width: 560px; margin: 0 auto; padding: 0 14px; box-sizing: border-box; position: relative; }
        .dh-grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
        .dh-grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .dh-press { transition: transform .12s ease; }
        .dh-press:active { transform: scale(0.97); }
        .dh-nav { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(10px + env(safe-area-inset-bottom, 0px));
          width: calc(100% - 28px); max-width: 540px; z-index: 150; display: flex; align-items: center; justify-content: space-between;
          background: #fff; border-radius: 36px; padding: 8px 10px; box-sizing: border-box;
          box-shadow: 0 8px 28px rgba(15,95,43,0.22), 0 0 0 1px rgba(15,95,43,0.06); }
        .dh-nav a { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 7px 4px 6px;
          text-decoration: none; color: ${INK}; font-size: 13.5px; font-weight: 700; border-radius: 28px; position: relative; }
        .dh-nav a.on { background: linear-gradient(135deg,#E4F6EA,#CFEFDB); color: ${GREEN}; font-weight: 800; flex: 1.35; }
        .dh-nav a.on::after { content: ''; position: absolute; bottom: 3px; width: 34px; height: 3px; border-radius: 2px; background: ${GREEN}; }
        @media (max-width: 900px) {
          #root > div > header { display: none !important; }
          .dashboard-layout { height: 100dvh !important; min-height: 100dvh !important; }
          .main-content { padding: 0 !important; }
        }
        @media (min-width: 901px) { .dh-nav { left: calc(50% + 130px); } }
      `}</style>

      {/* ── Header with wave ── */}
      <div style={{ position: 'relative', height: 150 }}>
        <svg viewBox="0 0 400 150" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
          <defs>
            <linearGradient id="dhHead" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#0A4A22" /><stop offset="0.55" stopColor="#13692E" /><stop offset="1" stopColor="#1F8A3C" />
            </linearGradient>
            <linearGradient id="dhWave" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7CCB3A" /><stop offset="0.5" stopColor="#4DAF3F" /><stop offset="1" stopColor="#B7E36A" />
            </linearGradient>
          </defs>
          <path d="M0 0H400V104C330 126 270 100 205 112C130 126 70 140 0 118Z" fill="url(#dhHead)" />
          <path d="M0 118C70 140 130 126 205 112C270 100 330 126 400 104V110C330 134 270 108 205 120C130 134 70 148 0 126Z" fill="url(#dhWave)" opacity="0.95" />
        </svg>
        <div className="dh-wrap" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 'calc(18px + env(safe-area-inset-top, 0px))' }}>
          <img src={ASSET('logo.png')} alt="Elite Nurses" style={{ width: 74, height: 'auto', flexShrink: 0, marginLeft: -6 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 26, fontWeight: 800, lineHeight: 1.1, whiteSpace: 'nowrap', textShadow: '0 2px 4px rgba(0,0,0,0.25)' }}>The Elite Nurses</div>
            <div style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13.5, fontStyle: 'italic', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Your Path to Nursing Excellence...
            </div>
          </div>
          <div style={{ display: 'flex', gap: 9, flexShrink: 0, position: 'relative' }}>
            <Link to="/lecture-notes" aria-label="Study materials" className="dh-press" style={{ textDecoration: 'none' }}>
              <RoundBtn label="Study materials"><Icon name="book" size={22} sw={1.8} /></RoundBtn>
            </Link>
            <RoundBtn label="Text size" onClick={() => setShowFont(s => !s)}>
              <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: -0.5 }}>A<span style={{ fontSize: 12 }}>A</span></span>
            </RoundBtn>
            <RoundBtn label="Notifications" yellow onClick={onNotifications}>
              <Icon name="bell" size={23} fill="#FFD84A" color="#FFD84A" sw={1.4} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, borderRadius: 10, background: '#F0283C', color: '#fff', fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', border: '1.5px solid #fff' }}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </RoundBtn>
            {showFont && font && (
              <div style={{ position: 'absolute', top: 54, right: 0, zIndex: 20, background: '#fff', borderRadius: 16, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
                <button type="button" onClick={() => font.setFontSize(Math.max(font.min, font.fontSize - font.step))}
                  style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #CFE3D5', background: '#F1FAF3', color: INK, fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>A−</button>
                <span style={{ fontSize: 13, fontWeight: 700, color: INK, minWidth: 32, textAlign: 'center' }}>{font.fontSize}</span>
                <button type="button" onClick={() => font.setFontSize(Math.min(font.max, font.fontSize + font.step))}
                  style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #CFE3D5', background: '#F1FAF3', color: INK, fontWeight: 800, fontSize: 18, cursor: 'pointer' }}>A+</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Greeting + nurse ── */}
      <div className="dh-wrap" style={{ marginTop: -6, minHeight: 130 }}>
        <img src={ASSET('nurse.png')} alt="" aria-hidden="true"
          style={{ position: 'absolute', right: -6, top: -38, width: 'min(46%, 235px)', height: 'auto', pointerEvents: 'none', zIndex: 1 }} />
        <h1 style={{ margin: '14px 0 0', fontSize: 38, fontWeight: 800, color: INK, lineHeight: 1.1, letterSpacing: -0.5, position: 'relative', zIndex: 2, maxWidth: '62%', overflowWrap: 'anywhere' }}>
          Hello, {firstName}!
        </h1>
        <p style={{ margin: '7px 0 0', fontSize: 17, fontStyle: 'italic', fontWeight: 500, color: INK, position: 'relative', zIndex: 2, maxWidth: '62%' }}>
          Keep going, you are doing great!
        </p>
        <svg width="250" height="14" viewBox="0 0 250 14" style={{ display: 'block', marginTop: 2, position: 'relative', zIndex: 2 }} aria-hidden="true">
          <path d="M2 10C40 3 90 8 130 7" stroke="#E6A817" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M120 9C150 4 190 5 240 3" stroke="#F2C230" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </svg>
      </div>

      <div className="dh-wrap" style={{ marginTop: 4 }}>
        {/* ── Progress card with trophy ── */}
        <div style={{ position: 'relative', paddingLeft: 78 }}>
          <img src={ASSET('trophy.png')} alt="" aria-hidden="true"
            style={{ position: 'absolute', left: -22, top: -4, width: 150, height: 'auto', zIndex: 2, pointerEvents: 'none' }} />
          <div style={{ marginLeft: 12, background: '#fff', borderRadius: 28, padding: '14px 16px 12px 70px', boxShadow: '0 8px 24px rgba(15,95,43,0.16)', position: 'relative', zIndex: 1, minHeight: 168, boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: INK }}>Your Progress</div>
                <div style={{ fontSize: 50, fontWeight: 800, color: INK, lineHeight: 1.05, marginTop: 2 }}>{pct}%</div>
              </div>
              <Link to="/study-plan" className="dh-press" style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 22, textDecoration: 'none', flexShrink: 0,
                background: 'linear-gradient(135deg,#E3F7E9,#C7EDD4)', boxShadow: '0 3px 8px rgba(15,95,43,0.15)',
              }}>
                <span style={{ color: GREEN, display: 'flex' }}><Icon name="calendar" size={24} fill="rgba(15,95,43,0.15)" /></span>
                <span style={{ fontSize: 14.5, fontWeight: 800, color: INK, lineHeight: 1.15 }}>
                  {daysToExam === null
                    ? (examDateLoading ? '…' : <>Set Exam<br />Date ›</>)
                    : <>{Math.max(0, daysToExam)} days<br />to exam ›</>}
                </span>
              </Link>
            </div>
            <div style={{ height: 11, borderRadius: 6, background: '#E3EBE6', margin: '6px 0 12px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.max(pct, 4)}%`, height: '100%', borderRadius: 6, background: 'linear-gradient(90deg,#1F8A3C,#6FC46A)', transition: 'width .8s ease' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', textAlign: 'center' }}>
              {stats.map((s, i) => (
                <div key={s.l} style={{ borderLeft: i ? '1px solid #DCE6DF' : 'none', padding: '0 2px' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', color: s.c }}>
                    <Icon name={s.icon} size={24} fill={s.filled ? s.c : 'none'} color={s.filled ? '#fff' : s.c} sw={2} />
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: INK, lineHeight: 1.2, marginTop: 1 }}>{s.v}</div>
                  <div style={{ fontSize: 12, color: SUB, whiteSpace: 'nowrap' }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Four big tiles ── */}
        <div className="dh-grid2" style={{ marginTop: 16 }}>
          {BIG.map(b => (
            <Link key={b.title} to={b.to} className="dh-press" style={{
              display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, minHeight: 74, padding: '8px 9px 8px 10px',
              borderRadius: 22, background: b.bg, border: `1.5px solid ${b.bd}`, textDecoration: 'none',
              boxShadow: '0 5px 14px rgba(20,83,45,0.14), inset 0 1px 0 rgba(255,255,255,0.8)', WebkitTapHighlightColor: 'transparent',
            }}>
              <span style={{
                width: 46, height: 46, borderRadius: b.iconBox ? '50%' : 12, flexShrink: 0,
                background: b.iconBox ? 'rgba(255,255,255,0.55)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: b.iconColor || b.c,
              }}>
                {b.title === 'Practice Questions'
                  ? <span style={{ width: 36, height: 36, borderRadius: 7, background: '#14803A', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7" /></svg></span>
                  : <Icon name={b.icon} size={b.icon === 'book' ? 38 : 32} fill={b.iconFill || (b.icon === 'book' ? '#2A5BE8' : 'none')} color={b.iconColor || b.c} sw={b.icon === 'book' ? 1.2 : 2} />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, color: b.c, lineHeight: 1.15 }}>{b.title}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: SUB, marginTop: 3, lineHeight: 1.2 }}>{b.sub}</span>
              </span>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: b.chev, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 5px rgba(0,0,0,0.25)' }}>
                <Icon name="chevron" size={16} sw={3} />
              </span>
            </Link>
          ))}
        </div>

        {/* ── Continue an exam (only when one is paused) ── */}
        {pausedExam && (
          <div style={{ marginTop: 14, background: 'linear-gradient(135deg,#0F5F2B,#1F8A3C)', borderRadius: 22, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 5px 14px rgba(15,95,43,0.3)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>Continue your exam</div>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '3px 0 9px' }}>
                {pausedExam.examName || pausedExam.courseLabel || 'Exam in progress'}
              </div>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
                <div style={{ width: `${pausedPct}%`, height: '100%', background: '#F2C230', borderRadius: 3 }} />
              </div>
            </div>
            <button type="button" onClick={onResume} className="dh-press"
              style={{ border: 'none', cursor: 'pointer', background: '#fff', color: INK, fontWeight: 800, fontSize: 14, fontFamily: FONT, padding: '12px 20px', borderRadius: 24, flexShrink: 0 }}>
              Resume
            </button>
          </div>
        )}

        {/* ── Upcoming scheduled exam ── */}
        <div style={{ position: 'relative', overflow: 'hidden', marginTop: 14, background: '#fff', borderRadius: 26, padding: '12px 12px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 5px 16px rgba(15,95,43,0.13)', border: '1px solid #E3F1E7' }}>
          <svg viewBox="0 0 200 80" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', right: 0, top: 0, width: '58%', height: '100%' }}>
            <path d="M200 0V80H40C90 62 80 30 130 22C160 17 175 6 185 0Z" fill="#DDF3E4" />
            <path d="M200 0V80H90C120 66 130 44 160 36C180 30 192 14 200 0Z" fill="#C3E9CF" opacity="0.8" />
          </svg>
          <span style={{ width: 56, height: 56, borderRadius: '50%', background: '#EEF4F0', color: GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)', position: 'relative' }}>
            <Icon name="calendar" size={30} fill="rgba(15,95,43,0.18)" />
          </span>
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: INK, lineHeight: 1.2 }}>Upcoming Scheduled Exam</div>
            <div style={{ fontSize: 13, color: SUB, marginTop: 3, lineHeight: 1.25 }}>Ready for your next practice?</div>
          </div>
          <Link to="/mock-exams" className="dh-press" style={{
            position: 'relative', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, textDecoration: 'none',
            background: 'linear-gradient(135deg,#0F5F2B,#0A4A22)', color: '#fff', fontWeight: 800, fontSize: 15, padding: '13px 16px', borderRadius: 24,
            boxShadow: '0 4px 10px rgba(10,74,34,0.35)',
          }}>
            Start Now <Icon name="arrow" size={17} sw={2.6} />
          </Link>
        </div>

        {/* ── Practice and Exams ── */}
        <SectionHead icon="cap" title="Practice and Exams" to="/quick-actions" />
        <div className="dh-grid3">
          {PRACTICE.map(p => <SmallTile key={p.label} item={p} />)}
        </div>

        {/* ── Progress and Community ── */}
        <SectionHead icon="users" title="Progress and Community" to="/progress-wall" />
        <div className="dh-grid3">
          {COMMUNITY.map(p => <SmallTile key={p.label} item={p} />)}
        </div>

        {/* Entrance exam mode (kept so the mode stays reachable now the header menu is hidden on phones) */}
        <Link to="/entrance-exam" className="dh-press" style={{
          marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none',
          background: 'linear-gradient(135deg,#0F5F2B,#1F8A3C)', borderRadius: 20, padding: '11px 14px',
        }}>
          <span style={{ color: '#F2C230', display: 'flex' }}><Icon name="cap" size={24} /></span>
          <span style={{ flex: 1, fontSize: 14.5, fontWeight: 800, color: '#fff' }}>Entrance Exam mode</span>
          <span style={{ color: '#fff', display: 'flex' }}><Icon name="chevron" size={18} sw={2.6} /></span>
        </Link>
      </div>

      {/* ── Floating bottom nav ── */}
      <nav className="dh-nav" aria-label="Main navigation">
        {NAV.map(n => (
          <Link key={n.label} to={n.to} className={pathname === n.to ? 'on' : ''}>
            <Icon name={n.icon} size={26} fill={n.label === 'Home' || n.label === 'Settings' ? 'currentColor' : 'none'} sw={n.label === 'Home' ? 1.4 : 2} />
            <span>{n.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
