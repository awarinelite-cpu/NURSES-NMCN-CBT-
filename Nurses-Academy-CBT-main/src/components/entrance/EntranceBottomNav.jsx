// src/components/entrance/EntranceBottomNav.jsx
//
// Mobile-only bottom tab bar for all /entrance-exam/* pages.
// Hidden on desktop (screens wider than 768px).

import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect }      from 'react';

const F = "'Times New Roman', Times, serif";
const H = "'Arial Black', Arial, sans-serif";

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

const MAIN_ITEMS   = NAV_ITEMS.slice(0, 4);
const DRAWER_ITEMS = NAV_ITEMS.slice(4);

export default function EntranceBottomNav() {
  const location                    = useLocation();
  const navigate                    = useNavigate();
  const [isMobile,   setIsMobile]   = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  if (!isMobile) return null;

  const currentPath = location.pathname;

  const isActive = (to) =>
    to === '/entrance-exam'
      ? currentPath === to
      : currentPath.startsWith(to);

  const anyDrawerActive = DRAWER_ITEMS.some(item => isActive(item.to));

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
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(4px)',
          }}
        />
      )}

      {/* ── More drawer ── */}
      <div style={{
        position: 'fixed',
        bottom: drawerOpen ? 68 : -320,
        left: 0, right: 0,
        zIndex: 9001,
        background: 'linear-gradient(180deg, #0D1F3C 0%, #0A1628 100%)',
        borderTop: '1.5px solid rgba(13,148,136,0.5)',
        borderRadius: '24px 24px 0 0',
        padding: '20px 12px 12px',
        transition: 'bottom 0.35s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: '0 -12px 48px rgba(13,148,136,0.2), 0 -4px 20px rgba(0,0,0,0.6)',
      }}>
        {/* Drag handle */}
        <div style={{
          width: 44, height: 5, borderRadius: 3,
          background: 'rgba(13,148,136,0.5)',
          margin: '-12px auto 18px',
          boxShadow: '0 0 8px rgba(13,148,136,0.6)',
        }} />

        <div style={{
          fontSize: 11, fontWeight: 700, fontFamily: H,
          color: 'rgba(13,148,136,0.9)',
          textTransform: 'uppercase', letterSpacing: 1.5,
          paddingLeft: 8, marginBottom: 12,
        }}>
          More Features
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
        }}>
          {DRAWER_ITEMS.map(item => {
            const active = isActive(item.to);
            return (
              <button
                key={item.to}
                onClick={() => handleNav(item.to)}
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 7, padding: '14px 8px',
                  background: active
                    ? 'linear-gradient(135deg, rgba(13,148,136,0.25), rgba(13,148,136,0.1))'
                    : 'rgba(255,255,255,0.04)',
                  border: active
                    ? '1.5px solid rgba(13,148,136,0.6)'
                    : '1.5px solid rgba(255,255,255,0.08)',
                  borderRadius: 16, cursor: 'pointer',
                  boxShadow: active ? '0 0 14px rgba(13,148,136,0.35)' : 'none',
                  transition: 'all 0.2s',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ fontSize: 26, lineHeight: 1 }}>{item.icon}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, fontFamily: F,
                  color: active ? '#14B8A6' : 'rgba(255,255,255,0.55)',
                  lineHeight: 1,
                  textShadow: active ? '0 0 8px rgba(13,148,136,0.8)' : 'none',
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
        height: 68,
        background: 'linear-gradient(180deg, #0D1F3C 0%, #060E1A 100%)',
        borderTop: '2px solid rgba(13,148,136,0.7)',
        display: 'flex', alignItems: 'stretch',
        boxShadow: [
          '0 -2px 0 rgba(13,148,136,0.5)',
          '0 -6px 30px rgba(13,148,136,0.2)',
          '0 -1px 60px rgba(0,0,0,0.8)',
        ].join(', '),
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>

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

      <style>{`
        @media (max-width: 768px) {
          .entrance-page-content {
            padding-bottom: 84px !important;
          }
        }
      `}</style>
    </>
  );
}

/* ── Tab Button ─────────────────────────────────────────────────────────── */
function TabButton({ icon, label, active, onClick, isMore = false }) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => { setTimeout(() => setPressed(false), 150); }}
      style={{
        flex: 1,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 4,
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '6px 2px 10px',
        transform: pressed ? 'scale(0.82)' : 'scale(1)',
        transition: 'transform 0.1s ease',
        position: 'relative',
        outline: 'none',
        WebkitTapHighlightColor: 'transparent',
        overflow: 'visible',
      }}
    >
      {/* Top glow bar on active */}
      {active && (
        <div style={{
          position: 'absolute',
          top: 0, left: '50%',
          transform: 'translateX(-50%)',
          width: 44, height: 3,
          borderRadius: '0 0 6px 6px',
          background: 'linear-gradient(90deg, #0D9488, #14B8A6, #0D9488)',
          boxShadow: '0 0 14px rgba(13,148,136,1), 0 0 28px rgba(13,148,136,0.6)',
        }} />
      )}

      {/* Icon pill */}
      <div style={{
        width: 44, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 12,
        background: active
          ? 'linear-gradient(135deg, rgba(13,148,136,0.35), rgba(13,148,136,0.12))'
          : 'transparent',
        border: active
          ? '1.5px solid rgba(13,148,136,0.55)'
          : '1.5px solid transparent',
        boxShadow: active
          ? '0 0 16px rgba(13,148,136,0.5), inset 0 1px 0 rgba(255,255,255,0.1)'
          : 'none',
        transition: 'all 0.2s',
      }}>
        <span style={{
          fontSize: isMore ? 17 : 23,
          lineHeight: 1,
          filter: active
            ? 'drop-shadow(0 0 6px rgba(13,148,136,0.9)) brightness(1.15)'
            : 'grayscale(0.15) opacity(0.5)',
          transition: 'filter 0.2s',
          fontFamily: isMore ? H : 'inherit',
          fontWeight: isMore ? 900 : 'normal',
          color: isMore ? (active ? '#14B8A6' : 'rgba(255,255,255,0.45)') : 'inherit',
          letterSpacing: isMore ? 2 : 'normal',
        }}>
          {icon}
        </span>
      </div>

      {/* Label */}
      <span style={{
        fontSize: 10, fontWeight: 800, fontFamily: H,
        color: active ? '#14B8A6' : 'rgba(255,255,255,0.38)',
        lineHeight: 1,
        transition: 'color 0.2s',
        whiteSpace: 'nowrap',
        textShadow: active ? '0 0 12px rgba(13,148,136,0.8)' : 'none',
        letterSpacing: 0.4,
      }}>
        {label}
      </span>
    </button>
  );
}
