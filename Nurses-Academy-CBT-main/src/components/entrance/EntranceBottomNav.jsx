// src/components/entrance/EntranceBottomNav.jsx
//
// Mobile-only bottom tab bar for all /entrance-exam/* pages.
// Hidden on desktop (screens wider than 768px) via inline media query trick.
//
// USAGE — add to AppLayout.jsx (or wherever the entrance exam section
// is wrapped), rendering it only on entrance-exam routes:
//
//   import EntranceBottomNav from '../entrance/EntranceBottomNav';
//   ...
//   const location = useLocation();
//   const isEntrance = location.pathname.startsWith('/entrance-exam');
//   ...
//   {isEntrance && <EntranceBottomNav />}
//
// The bar adds 64px of padding to the page bottom automatically via
// the CSS class it injects, so content is never hidden behind it.

import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect }      from 'react';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

// ── All nav items (matches sidebar + feature cards in EntranceExamHub) ──────
const NAV_ITEMS = [
  { icon: '🏠', label: 'Home',       to: '/entrance-exam'                },
  { icon: '🗓️', label: 'Daily Mock', to: '/entrance-exam/daily-mock'     },
  { icon: '🏫', label: 'Schools',    to: '/entrance-exam/schools'         },
  { icon: '📚', label: 'Drill',      to: '/entrance-exam/subject-drill'   },
  { icon: '📋', label: 'Exams',      to: '/entrance-exam/exams-taken'     },
  { icon: '🔖', label: 'Bookmarks',  to: '/entrance-exam/bookmarks'       },
  { icon: '📊', label: 'Results',    to: '/entrance-exam/my-results'      },
  { icon: '📈', label: 'Analysis',   to: '/entrance-exam/analysis'        },
  { icon: '🏆', label: 'Top',        to: '/entrance-exam/leaderboard'     },
];

// Items shown directly in the bar (first 5). The rest go in a "More" drawer.
const VISIBLE_COUNT = 5;
const MAIN_ITEMS    = NAV_ITEMS.slice(0, VISIBLE_COUNT - 1); // first 4
// "More" button is the 5th slot; drawer shows the remaining items

export default function EntranceBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobile,     setIsMobile]     = useState(false);
  const [drawerOpen,   setDrawerOpen]   = useState(false);

  // ── Detect mobile ────────────────────────────────────────────────────────
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  if (!isMobile) return null;

  const currentPath  = location.pathname;
  const drawerItems  = NAV_ITEMS.slice(VISIBLE_COUNT - 1); // items 5–9
  const anyDrawerActive = drawerItems.some(item =>
    item.to === '/entrance-exam'
      ? currentPath === item.to
      : currentPath.startsWith(item.to)
  );

  const isActive = (to) =>
    to === '/entrance-exam'
      ? currentPath === to
      : currentPath.startsWith(to);

  const handleNav = (to) => {
    setDrawerOpen(false);
    navigate(to);
  };

  return (
    <>
      {/* ── Drawer backdrop ── */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
          }}
        />
      )}

      {/* ── More drawer (slides up) ── */}
      <div style={{
        position: 'fixed',
        bottom: drawerOpen ? 64 : -300,
        left: 0, right: 0,
        zIndex: 9001,
        background: 'var(--bg-card)',
        borderTop: '1.5px solid var(--border)',
        borderRadius: '20px 20px 0 0',
        padding: '16px 8px 8px',
        transition: 'bottom 0.3s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.4)',
      }}>
        {/* Drag handle */}
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          background: 'var(--border)',
          margin: '-8px auto 16px',
        }} />

        <div style={{
          fontSize: 11, fontWeight: 700, fontFamily: F,
          color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: 0.8,
          paddingLeft: 12, marginBottom: 10,
        }}>
          More
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 4,
          padding: '0 4px',
        }}>
          {drawerItems.map(item => {
            const active = isActive(item.to);
            return (
              <button
                key={item.to}
                onClick={() => handleNav(item.to)}
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 6, padding: '12px 8px',
                  background: active ? 'rgba(13,148,136,0.12)' : 'transparent',
                  border: active ? '1.5px solid rgba(13,148,136,0.3)' : '1.5px solid transparent',
                  borderRadius: 14, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1 }}>{item.icon}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, fontFamily: F,
                  color: active ? 'var(--teal)' : 'var(--text-muted)',
                  lineHeight: 1,
                }}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Bottom Tab Bar ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        zIndex: 9002,
        height: 64,
        background: 'var(--bg-card)',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'stretch',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.25)',
        // Safe area for notched phones
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {/* Main nav items */}
        {MAIN_ITEMS.map(item => {
          const active = isActive(item.to);
          return (
            <TabButton
              key={item.to}
              icon={item.icon}
              label={item.label}
              active={active}
              onClick={() => handleNav(item.to)}
            />
          );
        })}

        {/* More button */}
        <TabButton
          icon="⋯"
          label="More"
          active={drawerOpen || anyDrawerActive}
          onClick={() => setDrawerOpen(v => !v)}
          isMore
        />
      </div>

      {/* ── Bottom padding so page content isn't hidden behind the bar ── */}
      <style>{`
        @media (max-width: 768px) {
          .entrance-page-content {
            padding-bottom: 80px !important;
          }
        }
      `}</style>
    </>
  );
}

/* ── Tab Button ──────────────────────────────────────────────────────────── */
function TabButton({ icon, label, active, onClick, isMore = false }) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 3,
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '8px 4px',
        transform: pressed ? 'scale(0.88)' : 'scale(1)',
        transition: 'transform 0.1s ease',
        position: 'relative',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Active indicator dot */}
      {active && (
        <div style={{
          position: 'absolute', top: 6,
          width: 4, height: 4, borderRadius: '50%',
          background: 'var(--teal)',
        }} />
      )}

      {/* Icon */}
      <span style={{
        fontSize: isMore ? 20 : 22,
        lineHeight: 1,
        filter: active ? 'none' : 'grayscale(0.3) opacity(0.65)',
        transition: 'filter 0.15s',
        fontFamily: isMore ? H : 'inherit',
        fontWeight: isMore ? 900 : 'normal',
        color: active ? 'var(--teal)' : 'var(--text-muted)',
        letterSpacing: isMore ? 1 : 'normal',
      }}>
        {icon}
      </span>

      {/* Label */}
      <span style={{
        fontSize: 10, fontWeight: 700, fontFamily: F,
        color: active ? 'var(--teal)' : 'var(--text-muted)',
        lineHeight: 1,
        transition: 'color 0.15s',
        whiteSpace: 'nowrap',
      }}>
        {label}
      </span>
    </button>
  );
}
