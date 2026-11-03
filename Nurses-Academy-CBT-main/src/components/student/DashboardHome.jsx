// src/components/student/DashboardHome.jsx
// Mobile-first student home — header, progress card, quick tiles, continue/scheduled
// exam cards, "Practice and exams" + "Progress and community" grids, entrance banner.
// Presentational only: all data comes from StudentDashboard via props.

import { useState } from 'react';
import { Link } from 'react-router-dom';
import DailyChallenge from '../shared/DailyChallenge';

const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

// ── Line icons (24x24, stroke) ────────────────────────────────────────────────
const PATHS = {
  bell: <><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></>,
  book: <><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" /></>,
  bookmarkBox: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3v8l3-2 3 2V3" /></>,
  check: <><path d="M20 6 9 17l-5-5" /></>,
  play: <><path d="m7 4 13 8-13 8z" /></>,
  bars: <><path d="M6 20V10M12 20V4M18 20v-6" /></>,
  calendar: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M16 3v4M8 3v4M4 11h16" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v3H9zM9 13l2 2 4-4" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  bookmark: <><path d="M6 3h12v18l-6-4-6 4z" /></>,
  list: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  notes: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 12h6M9 16h6" /></>,
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
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  close: <><path d="M18 6 6 18M6 6l12 12" /></>,
};

function Icon({ name, size = 22, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

// ── Palette (tile tints: bg, icon colour) ─────────────────────────────────────
const T = {
  blue:   { bg: '#E0EAFF', fg: '#2F4DD0' },
  green:  { bg: '#DCF5E3', fg: '#1F7A3D' },
  orange: { bg: '#FFE7D3', fg: '#C2501A' },
  purple: { bg: '#EAE4FF', fg: '#6B3FD4' },
  yellow: { bg: '#FFF1C9', fg: '#C27A06' },
  pink:   { bg: '#FFE0EC', fg: '#C2336B' },
  red:    { bg: '#FFE4DA', fg: '#D1432A' },
};
const DARK = '#2F6B3A';

// ── Data ──────────────────────────────────────────────────────────────────────
const QUICK = [
  { to: '/lecture-notes', label: 'Study Materials',   icon: 'bookmarkBox', tint: 'blue',   text: '#2F4DD0' },
  { to: '/quick-actions', label: 'Practice Questions', icon: 'check',       tint: 'green',  text: '#1F7A3D' },
  { to: '/exams',         label: 'Take CBT Exam',      icon: 'play',        tint: 'orange', text: '#B8450F' },
  { to: '/results',       label: 'My Results',         icon: 'bars',        tint: 'purple', text: '#6B3FD4' },
];

const PRACTICE = [
  { to: '/course-drill',    label: 'Course Drill',        icon: 'book',      tint: 'blue'   },
  { to: '/topic-drill',     label: 'Topic Drill',         icon: 'target',    tint: 'green'  },
  { to: '/mock-exams',      label: 'Hospital Final Prep', icon: 'clipboard', tint: 'orange' },
  { to: '/daily-mock-exam', label: 'Daily Mock Exam',     icon: 'calendar',  tint: 'purple' },
  { to: '/past-questions',  label: 'Past Questions',      icon: 'doc',       tint: 'yellow' },
  { to: '/bookmarks',       label: 'Bookmarks',           icon: 'bookmark',  tint: 'pink'   },
  { to: '/study-plan',      label: 'Study Plan',          icon: 'list',      tint: 'blue'   },
  { to: '/lecture-notes',   label: 'Lecture Notes',       icon: 'notes',     tint: 'green'  },
  { to: '/caosce',          label: 'CAOSCE Prep',         icon: 'cross',     tint: 'orange' },
  { to: '/essay-questions', label: 'Essay Questions',     icon: 'pencil',    tint: 'purple' },
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
function TileIcon({ name, tint, size = 38 }) {
  const t = T[tint];
  return (
    <span style={{
      width: size, height: size, borderRadius: 12, flexShrink: 0,
      background: t.bg, color: t.fg, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Icon name={name} size={Math.round(size * 0.5)} />
    </span>
  );
}

function ListTile({ item, onAction }) {
  const inner = (
    <>
      <TileIcon name={item.icon} tint={item.tint} />
      <span style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.25, color: '#14301C', textAlign: 'left' }}>
        {item.label}
      </span>
    </>
  );
  const style = {
    display: 'flex', alignItems: 'center', gap: 10, minWidth: 0,
    padding: '10px 11px', background: '#fff', borderRadius: 16,
    boxShadow: '0 1px 4px rgba(20,83,45,0.07)', border: '1px solid #EAF3EC',
    textDecoration: 'none', cursor: 'pointer', fontFamily: FONT,
    WebkitTapHighlightColor: 'transparent',
  };
  return item.action
    ? <button type="button" className="dh-press" style={style} onClick={() => onAction?.(item.action)}>{inner}</button>
    : <Link to={item.to} className="dh-press" style={style}>{inner}</Link>;
}

function SectionHead({ title, seeAllTo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '22px 0 10px' }}>
      <h3 style={{ margin: 0, fontFamily: FONT, fontSize: 16.5, fontWeight: 800, color: '#14301C' }}>{title}</h3>
      {seeAllTo && (
        <Link to={seeAllTo} style={{ fontSize: 13, fontWeight: 700, color: DARK, textDecoration: 'none' }}>See all</Link>
      )}
    </div>
  );
}

function Ring({ fraction, days, loading }) {
  const size = 84, stroke = 8, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#DCF5E3" strokeWidth={stroke} />
        {days !== null && (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F0A92E" strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - f)}
            style={{ transition: 'stroke-dashoffset .9s ease' }} />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        {days === null ? (
          <Link to="/study-plan" style={{ fontSize: 12, fontWeight: 800, color: DARK, textDecoration: 'none', lineHeight: 1.15 }}>
            {loading ? '…' : <>Set exam<br />date</>}
          </Link>
        ) : (
          <>
            <span style={{ fontSize: 24, fontWeight: 800, color: '#14301C', lineHeight: 1 }}>{Math.max(0, days)}</span>
            <span style={{ fontSize: 9.5, color: '#4B5F51', marginTop: 2, lineHeight: 1.1 }}>days to exam</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function DashboardHome({
  firstName, progressPct, examsCount, avgScore, streak, savedCount,
  daysToExam, examDateLoading, pausedExam, onResume, onNotifications,
}) {
  const [showDaily, setShowDaily] = useState(false);

  const examFrac = daysToExam === null ? 0 : 1 - Math.min(daysToExam, 180) / 180;
  const pausedPct = pausedExam && pausedExam.totalQuestions
    ? Math.max(4, Math.min(100, Math.round(((pausedExam.currentQuestion || 0) / pausedExam.totalQuestions) * 100)))
    : 0;

  const stats = [
    { v: examsCount,      l: 'Exams',      c: '#2F4DD0' },
    { v: `${avgScore}%`,  l: 'Avg score',  c: DARK },
    { v: streak,          l: 'Day streak', c: '#D1432A' },
    { v: savedCount,      l: 'Saved',      c: '#6B3FD4' },
  ];

  return (
    <div className="dh-root" style={{ fontFamily: FONT }}>
      <style>{`
        .dh-root { background: #F1FAF3; padding: 0 0 28px; min-height: 100%; width: 100%; }
        .dh-wrap { max-width: 560px; margin: 0 auto; padding: 0 14px; box-sizing: border-box; }
        .dh-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .dh-press { transition: transform .12s ease; }
        .dh-press:active { transform: scale(0.97); }
      `}</style>

      {/* Header */}
      <div style={{ background: DARK, borderRadius: '0 0 28px 28px', padding: '18px 0 74px' }}>
        <div className="dh-wrap" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, color: '#fff', fontSize: 23, fontWeight: 800, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Hello, {firstName}!
            </h1>
            <p style={{ margin: '4px 0 0', color: 'rgba(255,255,255,0.9)', fontSize: 13 }}>
              Keep going, you are doing great!
            </p>
          </div>
          <button type="button" onClick={onNotifications} aria-label="Notifications"
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: '#fff', color: DARK, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="bell" size={19} />
          </button>
        </div>
      </div>

      <div className="dh-wrap" style={{ marginTop: -56 }}>
        {/* Progress card */}
        <div style={{ background: '#fff', borderRadius: 20, padding: '16px 16px 14px', boxShadow: '0 4px 18px rgba(20,83,45,0.10)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: '#4B5F51' }}>Your progress</div>
              <div style={{ fontSize: 38, fontWeight: 800, color: '#0E2414', lineHeight: 1.15, margin: '2px 0 8px' }}>{progressPct}%</div>
              <div style={{ height: 7, borderRadius: 4, background: '#E4EFE7', overflow: 'hidden' }}>
                <div style={{ width: `${progressPct}%`, height: '100%', borderRadius: 4, background: DARK, transition: 'width .8s ease' }} />
              </div>
            </div>
            <Ring fraction={examFrac} days={daysToExam} loading={examDateLoading} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', marginTop: 14, textAlign: 'center' }}>
            {stats.map(s => (
              <div key={s.l}>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.c, lineHeight: 1.2 }}>{s.v}</div>
                <div style={{ fontSize: 12, color: '#4B5F51', marginTop: 1 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Four main tiles */}
        <div className="dh-grid" style={{ marginTop: 14 }}>
          {QUICK.map(q => (
            <Link key={q.label} to={q.to} className="dh-press" style={{
              background: T[q.tint].bg, borderRadius: 18, height: 84, textDecoration: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              color: q.text, WebkitTapHighlightColor: 'transparent',
            }}>
              <Icon name={q.icon} size={24} />
              <span style={{ fontSize: 13, fontWeight: 800 }}>{q.label}</span>
            </Link>
          ))}
        </div>

        {/* Continue an exam */}
        {pausedExam && (
          <div style={{ marginTop: 14, background: DARK, borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.3 }}>CONTINUE AN EXAM</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1.25, margin: '3px 0 10px' }}>
                {pausedExam.examName || pausedExam.courseLabel || 'Exam in progress'}
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.22)', overflow: 'hidden' }}>
                <div style={{ width: `${pausedPct}%`, height: '100%', background: '#F0A92E', borderRadius: 3 }} />
              </div>
            </div>
            <button type="button" onClick={onResume} className="dh-press"
              style={{ border: 'none', cursor: 'pointer', background: '#fff', color: '#14301C', fontWeight: 800, fontSize: 14, fontFamily: FONT, padding: '12px 22px', borderRadius: 24, flexShrink: 0 }}>
              Resume
            </button>
          </div>
        )}

        {/* Upcoming scheduled exam */}
        <div style={{ marginTop: 14, background: '#fff', borderRadius: 18, padding: '14px 14px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 6px rgba(20,83,45,0.07)' }}>
          <span style={{ width: 38, height: 38, borderRadius: 12, background: T.blue.bg, color: T.blue.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="calendar" size={19} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: '#14301C', lineHeight: 1.25 }}>Upcoming scheduled exam</div>
            <div style={{ fontSize: 12.5, color: '#4B5F51', marginTop: 2, lineHeight: 1.3 }}>Ready for your next practice?</div>
          </div>
          <Link to="/mock-exams" className="dh-press"
            style={{ background: DARK, color: '#fff', fontWeight: 800, fontSize: 14, padding: '11px 18px', borderRadius: 24, textDecoration: 'none', flexShrink: 0 }}>
            Start now
          </Link>
        </div>

        {/* Practice and exams */}
        <SectionHead title="Practice and exams" seeAllTo="/quick-actions" />
        <div className="dh-grid">
          {PRACTICE.map(p => <ListTile key={p.label} item={p} />)}
        </div>

        {/* Progress and community */}
        <SectionHead title="Progress and community" />
        <div className="dh-grid">
          {COMMUNITY.map(p => <ListTile key={p.label} item={p} onAction={a => a === 'daily' && setShowDaily(true)} />)}
        </div>

        {/* Entrance exam mode */}
        <Link to="/entrance-exam" className="dh-press" style={{
          marginTop: 18, background: DARK, borderRadius: 18, padding: '14px 16px', textDecoration: 'none',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: '#F0A92E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="cap" size={22} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800, color: '#fff' }}>Entrance Exam mode</div>
            <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.85)', marginTop: 1 }}>Its own drills, results and chats</div>
          </div>
          <span style={{ color: '#fff', display: 'flex' }}><Icon name="chevron" size={20} /></span>
        </Link>
      </div>

      {/* Daily challenge sheet */}
      {showDaily && (
        <div onClick={() => setShowDaily(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto', background: '#F1FAF3', borderRadius: '24px 24px 0 0', padding: '14px 14px 24px', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#14301C' }}>Daily Challenge</h3>
              <button type="button" onClick={() => setShowDaily(false)} aria-label="Close"
                style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#fff', color: '#14301C', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
