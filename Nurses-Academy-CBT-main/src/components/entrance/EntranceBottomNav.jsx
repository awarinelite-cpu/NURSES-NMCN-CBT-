// src/components/entrance/EntranceBottomNav.jsx
//
// Draggable FAB with full-circle orbit menu.
// All 9 icons appear at once, evenly spaced on a 360° ring.
// Radius is auto-calculated so icons never overlap.
//
// USAGE (AppLayout.jsx — unchanged):
//   import EntranceBottomNav from '../entrance/EntranceBottomNav';
//   const isEntrance = location.pathname.startsWith('/entrance-exam');
//   {isEntrance && <EntranceBottomNav />}

import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';

/* ── Nav items ───────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { icon: '🏠', label: 'Home',       to: '/entrance-exam'               },
  { icon: '🗓️', label: 'Daily Mock', to: '/entrance-exam/daily-mock'    },
  { icon: '🏫', label: 'Schools',    to: '/entrance-exam/schools'       },
  { icon: '📚', label: 'Drill',      to: '/entrance-exam/subject-drill' },
  { icon: '📋', label: 'Exams',      to: '/entrance-exam/exams-taken'   },
  { icon: '🔖', label: 'Bookmarks',  to: '/entrance-exam/bookmarks'     },
  { icon: '📊', label: 'Results',    to: '/entrance-exam/my-results'    },
  { icon: '📈', label: 'Analysis',   to: '/entrance-exam/analysis'      },
  { icon: '🏆', label: 'Top',        to: '/entrance-exam/leaderboard'   },
];

const N         = NAV_ITEMS.length;
const FAB_SIZE  = 62;   // FAB diameter px
const ICON_SIZE = 58;   // icon button diameter px
const MIN_GAP   = 10;   // min px gap between icon edges on the ring

// Minimum radius so no two adjacent icons ever overlap:
//   chord = 2R·sin(π/N) ≥ ICON_SIZE + MIN_GAP
const ARC_RADIUS = Math.ceil((ICON_SIZE + MIN_GAP) / (2 * Math.sin(Math.PI / N))) + 4;

const DRAG_THRESHOLD = 5;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ── Component ──────────────────────────────────────────────────────────── */
export default function EntranceBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const [fabPos, setFabPos]   = useState({ fx: 0.88, fy: 0.84 });
  const [open, setOpen]       = useState(false);
  const [openPct, setOpenPct] = useState(0);

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

  const vw = typeof window !== 'undefined' ? window.innerWidth  : 400;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const fabX = fabPos.fx * vw;
  const fabY = fabPos.fy * vh;
  const p    = openPct;

  const isActive = (to) =>
    to === '/entrance-exam'
      ? location.pathname === to
      : location.pathname.startsWith(to);

  return (
    <>
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
        const angleDeg = (360 / N) * i - 90; // 0° = top, clockwise
        const rad  = angleDeg * Math.PI / 180;
        const dist = ARC_RADIUS * p;
        const left = fabX + Math.cos(rad) * dist - ICON_SIZE / 2;
        const top  = fabY + Math.sin(rad) * dist - ICON_SIZE / 2;
        const active = isActive(item.to);
        const sc = 0.4 + 0.6 * p;

        return (
          <button
            key={item.to}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              navigate(item.to);
            }}
            style={{
              position: 'fixed', left, top,
              width: ICON_SIZE, height: ICON_SIZE,
              zIndex: 8100,
              borderRadius: '50%',
              background: active ? 'rgba(13,148,136,0.25)' : 'rgba(4,18,36,0.88)',
              border: active ? '2px solid #2dd4bf' : '1.5px solid rgba(13,148,136,0.35)',
              boxShadow: active
                ? '0 0 14px rgba(13,148,136,0.5)'
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
              color: active ? '#2dd4bf' : 'rgba(255,255,255,0.65)',
              letterSpacing: 0.2,
            }}>
              {item.label}
            </span>
          </button>
        );
      })}

      {/* Draggable FAB */}
      <div
        ref={fabRef}
        onPointerDown={onPointerDown}
        style={{
          position: 'fixed',
          left: fabX - FAB_SIZE / 2,
          top:  fabY - FAB_SIZE / 2,
          width: FAB_SIZE, height: FAB_SIZE,
          zIndex: 8200,
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
          style={{ transform: `rotate(${45 * p}deg)` }}
        >
          <line x1="12" y1="4"  x2="12" y2="20"
            stroke="#2dd4bf" strokeWidth="2.4" strokeLinecap="round"/>
          <line x1="4"  y1="12" x2="20" y2="12"
            stroke="#2dd4bf" strokeWidth="2.4" strokeLinecap="round"/>
        </svg>
      </div>
    </>
  );
}
