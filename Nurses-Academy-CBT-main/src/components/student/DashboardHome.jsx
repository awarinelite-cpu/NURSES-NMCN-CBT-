// src/components/student/DashboardHome.jsx
// Mobile-first student home, styled after the "Elite Nurses" home mock:
// green wave header · greeting + nurse hero · progress card · 4 quick tiles ·
// scheduled exam · Practice and Exams row · Track Your Progress · floating nav.
// Presentational only: all data comes from StudentDashboard via props.

import { useState, useId } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import DailyChallenge from '../shared/DailyChallenge';
import { AppHeader, DashBottomNav } from '../shared/DashChrome';

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";
const INK = '#10301d';
const MUTED = '#4a5d51';
const DEEP = '#04472b';
const DEEPER = '#02341f';
const LIME = '#8be04e';

// ── Line icons (24x24, stroke) ────────────────────────────────────────────────
const PATHS = {
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  book: <><path d="M12 6.5C10.3 5.2 8 4.7 3.5 5v13c4.5-.3 6.8.2 8.5 1.5 1.7-1.3 4-1.8 8.5-1.5V5c-4.5-.3-6.8.2-8.5 1.5zM12 6.5v13" /></>,
  bars: <><path d="M6 20V11M11 20V6M16 20V9M21 20V14" /></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M16 3v4M8 3v4M4 11h16M8 15h2M12 15h4" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  home: <><path d="M3.5 11 12 3.5 20.5 11M6 9.5V20h12V9.5M10 20v-5h4v5" /></>,
  community: <><circle cx="12" cy="8" r="3" /><circle cx="5.5" cy="10" r="2.2" /><circle cx="18.5" cy="10" r="2.2" /><path d="M6.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M1.5 18c0-2.2 1.5-3.7 3.5-4M22.5 18c0-2.2-1.5-3.7-3.5-4" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>,
  close: <><path d="M18 6 6 18M6 6l12 12" /></>,
  // extra glyphs for the lower grids
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v3H9zM9 13l2 2 4-4" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  bookmark: <><path d="M6 3h12v18l-6-4-6 4z" /></>,
  list: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  cross: <><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" /></>,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5c2 .7 3.5 2.6 3.5 5.5" /></>,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></>,
  chat: <><path d="M21 12a8 8 0 0 1-11.7 7L3 21l2-5.3A8 8 0 1 1 21 12z" /></>,
  inbox: <><path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M3 13h5l1 3h6l1-3h5" /></>,
  star: <><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></>,
  flame: <><path d="M12 22c4 0 7-2.8 7-7 0-3-2-5.5-3.5-7-.3 1.8-1.3 3-2.5 3 .5-3-1-6-4-8 0 4-4.5 6.5-4.5 12 0 4.2 3 7 7 7z" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3z" /></>,
  cap: <><path d="m2 9 10-5 10 5-10 5z" /><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v6" /></>,
  notes: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></>,
};

function Icon({ name, size = 22, color = 'currentColor', stroke = 1.9 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

// ── Glossy tile art (SVG, gradient filled) ────────────────────────────────────
function Art({ kind, size = 44 }) {
  const id = useId().replace(/:/g, '');
  const g = (a, b, n = 'g') => (
    <linearGradient id={`${id}${n}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} />
    </linearGradient>
  );
  const wrap = (children, defs) => (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>{defs}</defs>{children}
    </svg>
  );
  switch (kind) {
    case 'study': // blue open book
      return wrap(<>
        <path d="M24 12c-4-3-10-3.5-18-3v26c8-.5 14 0 18 3 4-3 10-3.5 18-3V9c-8-.5-14 0-18 3z" fill={`url(#${id}g)`} />
        <path d="M24 12v26" stroke="#fff" strokeOpacity=".55" strokeWidth="1.6" />
        <path d="M10 16h10M10 21h10M10 26h10M28 16h10M28 21h10M28 26h10" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeOpacity=".9" />
      </>, g('#3c8cff', '#1646d8'));
    case 'practice': // green check tile
      return wrap(<>
        <rect x="6" y="6" width="36" height="36" rx="9" fill={`url(#${id}g)`} />
        <rect x="6" y="6" width="36" height="36" rx="9" fill="none" stroke="#bff5b3" strokeWidth="1.6" />
        <path d="m14 25 7 7 14-15" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </>, g('#3fd04f', '#0d8a2e'));
    case 'cbt': // orange play
      return wrap(<>
        <circle cx="24" cy="24" r="21" fill="#ffd9bd" />
        <path d="M17 11.5v25c0 1.4 1.5 2.2 2.7 1.5l19-12.5c1.1-.7 1.1-2.3 0-3L19.7 10c-1.2-.7-2.7.1-2.7 1.5z" fill={`url(#${id}g)`} />
      </>, g('#ff9a3d', '#e2420b'));
    case 'results': // purple bars
      return wrap(<>
        <circle cx="24" cy="24" r="21" fill="#e2d6ff" />
        <rect x="11" y="24" width="7" height="13" rx="2.2" fill={`url(#${id}g)`} />
        <rect x="20.5" y="12" width="7" height="25" rx="2.2" fill={`url(#${id}g)`} />
        <rect x="30" y="19" width="7" height="18" rx="2.2" fill={`url(#${id}g)`} />
      </>, g('#9b6bff', '#5a22c9'));
    case 'course': // blue document
      return wrap(<>
        <circle cx="24" cy="24" r="21" fill="#d6e4ff" />
        <path d="M15 8h13l8 8v22a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3z" fill={`url(#${id}g)`} />
        <path d="M28 8v8h8" fill="#a8c6ff" />
        <path d="M17 24h14M17 29h14M17 34h9" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      </>, g('#3c8cff', '#1646d8'));
    case 'topic': // green target
      return wrap(<>
        <circle cx="24" cy="24" r="21" fill="#d3f3da" />
        <circle cx="24" cy="24" r="14" fill="none" stroke={`url(#${id}g)`} strokeWidth="4.5" />
        <circle cx="24" cy="24" r="7" fill="none" stroke={`url(#${id}g)`} strokeWidth="4.5" />
        <circle cx="24" cy="24" r="2.4" fill="#0d8a2e" />
        <path d="m25 23 12-12" stroke="#0d8a2e" strokeWidth="2.6" strokeLinecap="round" />
      </>, g('#3fd04f', '#0d8a2e'));
    case 'hospital': // orange medical kit
      return wrap(<>
        <circle cx="24" cy="24" r="21" fill="#ffe0cc" />
        <path d="M18 14v-2a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v2" fill="none" stroke="#c4380a" strokeWidth="3" />
        <rect x="8" y="14" width="32" height="25" rx="5" fill={`url(#${id}g)`} />
        <path d="M24 20v13M17.5 26.5h13" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" />
      </>, g('#ff8a3d', '#e2420b'));
    case 'daily': // purple calendar
      return wrap(<>
        <circle cx="24" cy="24" r="21" fill="#e5dcff" />
        <rect x="10" y="12" width="28" height="26" rx="5" fill={`url(#${id}g)`} />
        <path d="M17 8v7M31 8v7" stroke="#5a22c9" strokeWidth="3" strokeLinecap="round" />
        <path d="M10 21h28" stroke="#fff" strokeOpacity=".7" strokeWidth="2" />
        <path d="M16 27h5M24 27h8M16 33h8" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      </>, g('#a27bff', '#5a22c9'));
    default:
      return null;
  }
}

// ── Palette ───────────────────────────────────────────────────────────────────
const T = {
  blue:   { bg: '#E0EAFF', fg: '#2F4DD0' },
  green:  { bg: '#DCF5E3', fg: '#1F7A3D' },
  orange: { bg: '#FFE7D3', fg: '#C2501A' },
  purple: { bg: '#EAE4FF', fg: '#6B3FD4' },
  yellow: { bg: '#FFF1C9', fg: '#C27A06' },
  pink:   { bg: '#FFE0EC', fg: '#C2336B' },
  red:    { bg: '#FFE4DA', fg: '#D1432A' },
};

// ── Data ──────────────────────────────────────────────────────────────────────
const QUICK = [
  { to: '/lecture-notes', title: ['Study', 'Materials'],    sub: 'Learn & Prepare',        art: 'study',    grad: ['#e3edff', '#c7dafd'], edge: '#7ea6f5', btn: '#2563eb' },
  { to: '/quick-actions', title: ['Practice', 'Questions'], sub: 'Test Your Knowledge',    art: 'practice', grad: ['#dff7e4', '#c4eecf'], edge: '#8ad79c', btn: '#16803a' },
  { to: '/exams',         title: ['Take CBT', 'Exam'],      sub: 'Simulate the Real Exam', art: 'cbt',      grad: ['#ffe9d6', '#ffd3b0'], edge: '#f5a977', btn: '#f26a1b' },
  { to: '/results',       title: ['My Results'],            sub: 'Track Your Performance', art: 'results',  grad: ['#ece4ff', '#d9ccfc'], edge: '#b199f2', btn: '#6d3fd6' },
];

const PRACTICE_ROW = [
  { to: '/course-drill',    label: 'Course Drill',        art: 'course',   grad: ['#e8f0ff', '#d3e2ff'] },
  { to: '/topic-drill',     label: 'Topic Drill',         art: 'topic',    grad: ['#e4f7e8', '#d0eed7'] },
  { to: '/mock-exams',      label: 'Hospital Final Prep', art: 'hospital', grad: ['#fff0e6', '#ffe0cc'] },
  { to: '/daily-mock-exam', label: 'Daily Mock Exam',     art: 'daily',    grad: ['#f0eaff', '#e1d8fd'] },
];

const MORE_PRACTICE = [
  { to: '/past-questions',  label: 'Past Questions',  icon: 'doc',      tint: 'yellow' },
  { to: '/bookmarks',       label: 'Bookmarks',       icon: 'bookmark', tint: 'pink'   },
  { to: '/study-plan',      label: 'Study Plan',      icon: 'list',     tint: 'blue'   },
  { to: '/lecture-notes',   label: 'Lecture Notes',   icon: 'notes',    tint: 'green'  },
  { to: '/caosce',          label: 'CAOSCE Prep',     icon: 'cross',    tint: 'orange' },
  { to: '/essay-questions', label: 'Essay Questions', icon: 'pencil',   tint: 'purple' },
];

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

// ── Small pieces ──────────────────────────────────────────────────────────────
function ListTile({ item, onAction }) {
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
    ? <button type="button" className="dh-press" style={style} onClick={() => onAction?.(item.action)}>{inner}</button>
    : <Link to={item.to} className="dh-press" style={style}>{inner}</Link>;
}

function SectionHead({ title, badge, seeAllTo, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '20px 2px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        {badge ? (
          <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(160deg,#4fbf3c,#12722f)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(10,80,30,.35)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.6 6.2 20.7l1.1-6.5L2.6 9.6l6.5-.9z" fill="#ffd54a" /></svg>
          </span>
        ) : (
          <span style={{ color: '#1c8a3a', display: 'flex' }}><Icon name={icon || 'bars'} size={26} stroke={2.4} /></span>
        )}
        <h3 style={{ margin: 0, fontFamily: FONT, fontSize: 19, fontWeight: 800, color: INK, letterSpacing: -0.2 }}>{title}</h3>
      </div>
      {seeAllTo && (
        <Link to={seeAllTo} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 700, color: DEEP, textDecoration: 'none' }}>
          See All <Icon name="arrow" size={17} stroke={2.4} />
        </Link>
      )}
    </div>
  );
}

function Ring({ pct }) {
  const size = 106, stroke = 9, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const f = Math.max(0.02, Math.min(1, pct / 100));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.20)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={LIME} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - f)}
          style={{ transition: 'stroke-dashoffset .9s ease' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontSize: 30, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{pct}%</span>
        <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,.85)', marginTop: 4 }}>Your Progress</span>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardHome({
  firstName, progressPct, examsCount, avgScore, streak, savedCount,
  daysToExam, pausedExam, onResume,
}) {
  const [showDaily, setShowDaily] = useState(false);
  const outlet = useOutletContext() || {};

  const pausedPct = pausedExam && pausedExam.totalQuestions
    ? Math.max(4, Math.min(100, Math.round(((pausedExam.currentQuestion || 0) / pausedExam.totalQuestions) * 100)))
    : 0;

  const stats = [
    { v: examsCount,     l: 'Exams',      icon: 'book' },
    { v: `${avgScore}%`, l: 'Avg Score',  icon: 'bars' },
    { v: streak,         l: 'Day Streak', icon: 'calendar' },
    { v: savedCount,     l: 'Saved',      icon: 'checkCircle' },
  ];

  return (
    <div className="dh-root" style={{ fontFamily: FONT }}>
      <style>{`
        .dh-root { background: linear-gradient(180deg,#e9f1ef 0%,#f3f8f5 38%,#eef6f0 100%); min-height: 100%; width: 100%; position: relative; padding-bottom: 8px; }
        .dh-wrap { max-width: 560px; margin: 0 auto; padding: 0 11px; box-sizing: border-box; position: relative; }
        .dh-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .dh-press { transition: transform .12s ease; -webkit-tap-highlight-color: transparent; }
        .dh-press:active { transform: scale(0.97); }
        .dh-head { display: none; }
        @media (max-width: 900px) {
          .dh-head { display: block; position: relative; z-index: 3; }
          .dh-root { padding-bottom: 104px; }
        }
        .dh-hero-img { mask-image: linear-gradient(to right, transparent 0%, #000 30%); -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 30%); }
        .dh-row4 > a + a { border-left: 1px solid rgba(20,70,40,.14); }
      `}</style>

      {/* ── Header (mobile) ── */}
      <div className="dh-head">
        <AppHeader onMenu={outlet.openMenu} compact={false} waveFill="#e9f1ef" />
      </div>

      {/* ── Greeting + hero ── */}
      <div className="dh-wrap" style={{ minHeight: 168 }}>
        <img className="dh-hero-img" src="/dash-nurse.png" alt="" aria-hidden="true"
          style={{ position: 'absolute', right: 0, top: -30, height: 176, width: 'auto', zIndex: 2, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 3, paddingTop: 14, maxWidth: '62%' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(24px,7vw,30px)', fontWeight: 800, color: INK, lineHeight: 1.15, letterSpacing: -0.4 }}>
            Hello, {firstName}! <span role="img" aria-label="wave">👋</span>
          </h1>
          <p style={{ margin: '5px 0 0', fontSize: 'clamp(13px,3.9vw,15.5px)', fontStyle: 'italic', color: INK }}>Keep going, you are doing great!</p>
          <svg width="112" height="8" viewBox="0 0 112 8" aria-hidden="true" style={{ display: 'block', marginTop: 3 }}>
            <path d="M2 5C25 1 60 1 110 4" fill="none" stroke="#2f9a45" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, background: `linear-gradient(90deg,${DEEPER},#0a5a31)`, color: '#fff', borderRadius: 22, padding: '8px 16px 8px 10px', fontSize: 13.5, fontStyle: 'italic', fontWeight: 500, boxShadow: '0 3px 8px rgba(2,52,31,.3)', maxWidth: '100%' }}>
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>🏆</span>
            <span style={{ whiteSpace: 'nowrap' }}>“Dream it. Study it. Pass it.”</span>
          </div>
        </div>
      </div>

      <div className="dh-wrap" style={{ marginTop: 2 }}>
        {/* ── Progress card ── */}
        <div style={{ position: 'relative', zIndex: 3, background: `linear-gradient(140deg,#0b5a31 0%,${DEEP} 45%,${DEEPER} 100%)`, borderRadius: '30px 30px 26px 26px', padding: '40px 8px 14px 14px', boxShadow: '0 8px 20px rgba(2,52,31,.35)' }}>
          <Link to="/study-plan" className="dh-press" style={{ position: 'absolute', top: 14, right: 14, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'linear-gradient(180deg,#f4fcd9,#dff3a8)', color: INK, fontWeight: 700, fontSize: 13, padding: '7px 11px', borderRadius: 14, textDecoration: 'none', boxShadow: '0 2px 6px rgba(0,0,0,.25)' }}>
            <Icon name="calendar" size={17} />
            {daysToExam === null ? 'Set Exam Date' : daysToExam === 0 ? 'Exam day!' : `${daysToExam} day${daysToExam === 1 ? '' : 's'} to exam`}
            <Icon name="chevron" size={14} stroke={2.6} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Ring pct={progressPct} />
            <div style={{ alignSelf: 'stretch', width: 1, background: 'rgba(255,255,255,.2)', margin: '2px 10px 2px 12px' }} />
            <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', paddingTop: 14 }}>
              {stats.map((s, i) => (
                <div key={s.l} style={{ textAlign: 'center', color: '#fff', borderLeft: i ? '1px solid rgba(255,255,255,.2)' : 'none', padding: '0 2px' }}>
                  <Icon name={s.icon} size={24} stroke={1.8} />
                  <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.15, marginTop: 4 }}>{s.v}</div>
                  <div style={{ fontSize: 10.5, opacity: .9, marginTop: 2, whiteSpace: 'nowrap' }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Four main tiles ── */}
        <div className="dh-grid" style={{ marginTop: 14 }}>
          {QUICK.map(q => (
            <Link key={q.to} to={q.to} className="dh-press" style={{
              position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
              height: 68, padding: '0 10px 0 8px', borderRadius: 18, textDecoration: 'none',
              background: `linear-gradient(135deg,${q.grad[0]},${q.grad[1]})`, border: `1.5px solid ${q.edge}`,
              boxShadow: `0 3px 0 ${q.edge}66, 0 6px 10px rgba(20,60,40,.10)`,
            }}>
              <span style={{ flexShrink: 0, display: 'flex' }}><Art kind={q.art} size={46} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 800, fontSize: 15, lineHeight: 1.12, color: INK }}>
                  {q.title.map((t, i) => <span key={i} style={{ display: 'block' }}>{t}</span>)}
                </span>
                <span style={{ display: 'block', fontSize: 10.5, color: INK, marginTop: 3, lineHeight: 1.2 }}>{q.sub}</span>
              </span>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: q.btn, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="chevron" size={14} stroke={3} />
              </span>
            </Link>
          ))}
        </div>

        {/* ── Continue an exam (only when one is paused) ── */}
        {pausedExam && (
          <div style={{ marginTop: 14, background: `linear-gradient(120deg,#0b5a31,${DEEPER})`, borderRadius: 20, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 12px rgba(2,52,31,.25)' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.3 }}>CONTINUE AN EXAM</div>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '3px 0 10px' }}>
                {pausedExam.examName || pausedExam.courseLabel || 'Exam in progress'}
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
                <div style={{ width: `${pausedPct}%`, height: '100%', background: LIME, borderRadius: 3 }} />
              </div>
            </div>
            <button type="button" onClick={onResume} className="dh-press"
              style={{ border: 'none', cursor: 'pointer', background: '#fff', color: INK, fontWeight: 800, fontSize: 14, fontFamily: FONT, padding: '12px 22px', borderRadius: 24, flexShrink: 0 }}>
              Resume
            </button>
          </div>
        )}

        {/* ── Upcoming scheduled exam ── */}
        <div style={{ marginTop: 14, position: 'relative', background: 'linear-gradient(120deg,#fff9e8,#fdeec9)', border: '1.5px solid #f3dca4', borderRadius: 20, padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 3px 8px rgba(180,130,20,.12)' }}>
          <span style={{ width: 44, height: 44, flexShrink: 0, color: DEEP, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="calendar" size={40} stroke={1.6} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: INK, lineHeight: 1.2 }}>Upcoming Scheduled Exam</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 3, lineHeight: 1.3 }}>Ready for your next practice?</div>
          </div>
          <Link to="/mock-exams" className="dh-press"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: `linear-gradient(180deg,#0b5a31,${DEEPER})`, color: '#fff', fontWeight: 800, fontSize: 15, padding: '12px 16px', borderRadius: 24, textDecoration: 'none', flexShrink: 0, boxShadow: '0 3px 8px rgba(2,52,31,.35)' }}>
            Start Now <Icon name="arrow" size={17} stroke={2.6} />
          </Link>
          <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden="true" style={{ position: 'absolute', top: -9, right: 8 }}>
            <path d="M4 18 9 6M14 20l4-14M24 17l-2-9" stroke="#f2b01e" strokeWidth="3.4" strokeLinecap="round" />
          </svg>
        </div>

        {/* ── Practice and Exams ── */}
        <SectionHead title="Practice and Exams" badge seeAllTo="/quick-actions" />
        <div className="dh-row4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 6 }}>
          {PRACTICE_ROW.map(p => (
            <Link key={p.to} to={p.to} className="dh-press" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
              minHeight: 84, padding: '8px 4px', borderRadius: 16, textDecoration: 'none', textAlign: 'center',
              background: `linear-gradient(180deg,${p.grad[0]},${p.grad[1]})`, border: '1px solid rgba(255,255,255,.9)',
              boxShadow: '0 3px 8px rgba(20,60,40,.10)',
            }}>
              <Art kind={p.art} size={40} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: INK, lineHeight: 1.2 }}>{p.label}</span>
            </Link>
          ))}
        </div>
        <div className="dh-grid" style={{ marginTop: 10 }}>
          {MORE_PRACTICE.map(p => <ListTile key={p.label} item={p} />)}
        </div>

        {/* ── Track Your Progress ── */}
        <SectionHead title="Track Your Progress" icon="bars" />
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
            <div style={{ fontSize: 15.5, fontWeight: 600, color: INK, marginTop: 4 }}>{progressPct}% Overall Progress</div>
          </div>
          <Link to="/performance" className="dh-press" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1.5px solid #1c8a3a', color: INK, fontWeight: 700, fontSize: 13.5, padding: '9px 12px', borderRadius: 22, textDecoration: 'none', background: 'rgba(255,255,255,.55)', flexShrink: 0 }}>
            View Details <Icon name="arrow" size={16} stroke={2.4} />
          </Link>
        </div>

        {/* ── Progress and community ── */}
        <SectionHead title="Progress and Community" icon="community" />
        <div className="dh-grid">
          {COMMUNITY.map(p => <ListTile key={p.label} item={p} onAction={a => a === 'daily' && setShowDaily(true)} />)}
        </div>

        {/* ── Entrance exam mode ── */}
        <Link to="/entrance-exam" className="dh-press" style={{
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
      </div>

      <DashBottomNav />

      {/* Daily challenge sheet */}
      {showDaily && (
        <div onClick={() => setShowDaily(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: '#F1FAF3', borderRadius: '24px 24px 0 0', padding: '14px 14px 24px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: INK }}>Daily Challenge</h3>
              <button type="button" onClick={() => setShowDaily(false)} aria-label="Close"
                style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#fff', color: INK, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <DailyChallenge />
          </div>
        </div>
      )}
    </div>
  );
}
