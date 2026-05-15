// src/components/entrance/EntranceBottomNav.jsx
//
// Draggable FAB with scrollable arc menu — replaces the fixed bottom tab bar.
//
// USAGE (same as before in AppLayout.jsx):
//   import EntranceBottomNav from '../entrance/EntranceBottomNav';
//   ...
//   const isEntrance = location.pathname.startsWith('/entrance-exam');
//   {isEntrance && <EntranceBottomNav />}
//
// Behaviour:
//  • A single circular FAB floats on screen (default: bottom-right).
//  • TAP FAB  → arc of icons fans out in a quarter-circle toward top-left.
//  • DRAG FAB → move it anywhere; the arc always fans away from the nearest corner.
//  • TOO MANY ICONS → only ARC_VISIBLE items are shown at once; drag/swipe
//    along the arc to scroll the remaining icons into view.
//  • Tap any icon to navigate; tap FAB or backdrop to close.

import { useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';

/* ── Nav items ───────────────────────────────────────────────────────────── */
const NAV_ITEMS = [
  { icon: '🏠', label: 'Home',       to: '/entrance-exam'                },
  { icon: '🗓️', label: 'Daily Mock', to: '/entrance-exam/daily-mock'     },
  { icon: '🏫', label: 'Schools',    to: '/entrance-exam/schools'        },
  { icon: '📚', label: 'Drill',      to: '/entrance-exam/subject-drill'  },
  { icon: '📋', label: 'Exams',      to: '/entrance-exam/exams-taken'    },
  { icon: '🔖', label: 'Bookmarks',  to: '/entrance-exam/bookmarks'      },
  { icon: '📊', label: 'Results',    to: '/entrance-exam/my-results'     },
  { icon: '📈', label: 'Analysis',   to: '/entrance-exam/analysis'       },
  { icon: '🏆', label: 'Top',        to: '/entrance-exam/leaderboard'    },
];

const ARC_RADIUS   = 90;   // px — distance of icons from FAB centre
const ICON_SIZE    = 48;   // px — diameter of each icon button
const ARC_VISIBLE  = 5;    // max icons visible in arc at once
const ARC_SPAN_DEG = 80;   // total arc angle when all visible items shown
const FAB_SIZE     = 56;   // px — FAB diameter
const DRAG_THRESHOLD = 6;  // px — minimum move to count as a drag not a tap

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Given FAB position as fraction of viewport, decide which quadrant it's in
// and return the arc's centre angle (degrees) so icons fan away from the wall.
function arcCentreAngle(fx, fy) {
  const left  = fx < 0.5;
  const top   = fy < 0.5;
  if (!left && !top)  return 225; // bottom-right → fan toward top-left
  if ( left && !top)  return 315; // bottom-left  → fan toward top-right
  if (!left &&  top)  return 135; // top-right    → fan toward bottom-left
  return 45;                       // top-left     → fan toward bottom-right
}

// Convert polar (origin = FAB centre, angle in degrees) to Cartesian offset
function polar(angleDeg, r) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad) * r, y: Math.sin(rad) * r };
}

/* ── Component ──────────────────────────────────────────────────────────── */
export default function EntranceBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  // FAB position as fraction of viewport (0–1)
  const [fabPos, setFabPos]   = useState({ fx: 0.93, fy: 0.88 });
  const [open, setOpen]       = useState(false);
  // Arc scroll offset — index of the first visible item in the arc
  const [arcOffset, setArcOffset] = useState(0);
  // "Is menu open" animation progress (0→1)
  const [openPct, setOpenPct] = useState(0);

  const fabRef        = useRef(null);
  const dragRef       = useRef({ dragging: false, startX: 0, startY: 0,
                                 origFx: 0, origFy: 0, moved: false });
  const arcDragRef    = useRef({ active: false, startAngle: 0, startOffset: 0 });
  const animFrameRef  = useRef(null);
  const openPctRef    = useRef(0);

  // Close arc on route change
  useEffect(() => {
    setOpen(false);
    setArcOffset(0);
  }, [location.pathname]);

  // Animate openPct
  useEffect(() => {
    const target = open ? 1 : 0;
    const step = () => {
      const diff = target - openPctRef.current;
      if (Math.abs(diff) < 0.01) {
        openPctRef.current = target;
        setOpenPct(target);
        return;
      }
      openPctRef.current += diff * 0.18;
      setOpenPct(openPctRef.current);
      animFrameRef.current = requestAnimationFrame(step);
    };
    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [open]);

  // ── FAB drag ─────────────────────────────────────────────────────────────
  const onFabPointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragRef.current = {
      dragging: true,
      startX: clientX,
      startY: clientY,
      origFx: fabPos.fx,
      origFy: fabPos.fy,
      moved: false,
    };
    fabRef.current?.setPointerCapture?.(e.pointerId);
  }, [fabPos]);

  const onFabPointerMove = useCallback((e) => {
    if (!dragRef.current.dragging) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) dragRef.current.moved = true;
    if (!dragRef.current.moved) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = FAB_SIZE / 2;
    const newFx = clamp((dragRef.current.origFx * vw + dx) / vw,
                        pad / vw, 1 - pad / vw);
    const newFy = clamp((dragRef.current.origFy * vh + dy) / vh,
                        pad / vh, 1 - pad / vh);
    setFabPos({ fx: newFx, fy: newFy });
  }, []);

  const onFabPointerUp = useCallback((e) => {
    if (!dragRef.current.dragging) return;
    dragRef.current.dragging = false;
    if (!dragRef.current.moved) {
      // It was a tap → toggle arc
      setOpen(v => !v);
      if (open) setArcOffset(0);
    }
  }, [open]);

  // Global pointer listeners for drag
  useEffect(() => {
    const move = (e) => onFabPointerMove(e);
    const up   = (e) => onFabPointerUp(e);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup',   up);
    window.addEventListener('touchmove',   move, { passive: false });
    window.addEventListener('touchend',    up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup',   up);
      window.removeEventListener('touchmove',   move);
      window.removeEventListener('touchend',    up);
    };
  }, [onFabPointerMove, onFabPointerUp]);

  // ── Arc swipe ─────────────────────────────────────────────────────────────
  // Drag tangentially around the arc to scroll icons
  const onArcPointerDown = useCallback((e) => {
    e.stopPropagation();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fabX = fabPos.fx * vw;
    const fabY = fabPos.fy * vh;
    const angle = Math.atan2(clientY - fabY, clientX - fabX) * 180 / Math.PI;
    arcDragRef.current = { active: true, startAngle: angle, startOffset: arcOffset };
  }, [fabPos, arcOffset]);

  const onArcPointerMove = useCallback((e) => {
    if (!arcDragRef.current.active) return;
    e.preventDefault();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const fabX = fabPos.fx * vw;
    const fabY = fabPos.fy * vh;
    const angle = Math.atan2(clientY - fabY, clientX - fabX) * 180 / Math.PI;
    const delta = angle - arcDragRef.current.startAngle;
    // 15 degrees per step
    const step = Math.round(delta / 15);
    const maxOffset = Math.max(0, NAV_ITEMS.length - ARC_VISIBLE);
    const newOffset = clamp(arcDragRef.current.startOffset - step, 0, maxOffset);
    setArcOffset(newOffset);
  }, [fabPos]);

  const onArcPointerUp = useCallback(() => {
    arcDragRef.current.active = false;
  }, []);

  useEffect(() => {
    if (!open) return;
    const move = (e) => onArcPointerMove(e);
    const up   = () => onArcPointerUp();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup',   up);
    window.addEventListener('touchmove',   move, { passive: false });
    window.addEventListener('touchend',    up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup',   up);
      window.removeEventListener('touchmove',   move);
      window.removeEventListener('touchend',    up);
    };
  }, [open, onArcPointerMove, onArcPointerUp]);

  // ── Derived arc geometry ──────────────────────────────────────────────────
  const vw = typeof window !== 'undefined' ? window.innerWidth  : 400;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const fabX = fabPos.fx * vw;
  const fabY = fabPos.fy * vh;
  const centreDeg = arcCentreAngle(fabPos.fx, fabPos.fy);

  const visibleItems = NAV_ITEMS.slice(arcOffset, arcOffset + ARC_VISIBLE);
  const hasMore      = NAV_ITEMS.length > ARC_VISIBLE;
  const canScrollPrev = arcOffset > 0;
  const canScrollNext = arcOffset + ARC_VISIBLE < NAV_ITEMS.length;

  // Spread angles for visible items
  const angleStep = visibleItems.length > 1
    ? ARC_SPAN_DEG / (visibleItems.length - 1)
    : 0;
  const startAngle = centreDeg - ARC_SPAN_DEG / 2;

  const isActive = (to) =>
    to === '/entrance-exam'
      ? location.pathname === to
      : location.pathname.startsWith(to);

  return (
    <>
      {/* ── Backdrop ── */}
      {openPct > 0.05 && (
        <div
          onClick={() => { setOpen(false); setArcOffset(0); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 8000,
            background: `rgba(0,0,0,${0.4 * openPct})`,
            backdropFilter: `blur(${3 * openPct}px)`,
            WebkitBackdropFilter: `blur(${3 * openPct}px)`,
          }}
        />
      )}

      {/* ── Arc Icon Buttons ── */}
      {openPct > 0.01 && visibleItems.map((item, i) => {
        const angleDeg = startAngle + i * angleStep;
        const { x, y } = polar(angleDeg, ARC_RADIUS * openPct);
        const itemFx = fabPos.fx + x / vw;
        const itemFy = fabPos.fy + y / vh;
        const left = itemFx * vw - ICON_SIZE / 2;
        const top  = itemFy * vh - ICON_SIZE / 2;
        const active = isActive(item.to);
        // Stagger delay per item
        const delay = i * 30;

        return (
          <button
            key={item.to}
            onPointerDown={onArcPointerDown}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
              setArcOffset(0);
              navigate(item.to);
            }}
            style={{
              position: 'fixed',
              left, top,
              width: ICON_SIZE, height: ICON_SIZE,
              zIndex: 8100,
              borderRadius: '50%',
              border: active
                ? '2px solid #0d9488'
                : '1.5px solid rgba(255,255,255,0.15)',
              background: active
                ? 'rgba(13,148,136,0.22)'
                : 'rgba(2,11,24,0.82)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 1,
              padding: 0,
              opacity: openPct,
              transform: `scale(${0.6 + 0.4 * openPct})`,
              transition: `border-color 0.15s, background 0.15s`,
              boxShadow: active
                ? '0 0 12px rgba(13,148,136,0.45)'
                : '0 4px 16px rgba(0,0,0,0.5)',
              touchAction: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
            <span style={{
              fontSize: 8, fontWeight: 700,
              fontFamily: "'Arial Black', Arial, sans-serif",
              color: active ? '#2dd4bf' : 'rgba(255,255,255,0.7)',
              letterSpacing: 0.3,
              lineHeight: 1,
            }}>
              {item.label}
            </span>
          </button>
        );
      })}

      {/* ── Arc scroll hint dots ── */}
      {open && hasMore && openPct > 0.8 && (() => {
        // Place dots near the FAB, on the arc direction
        const hintAngle = centreDeg + (canScrollNext ? -ARC_SPAN_DEG / 2 - 20 : ARC_SPAN_DEG / 2 + 20);
        const { x, y } = polar(hintAngle, ARC_RADIUS * 0.6);
        return (
          <div
            style={{
              position: 'fixed',
              left: fabX + x - 24,
              top:  fabY + y - 8,
              zIndex: 8200,
              display: 'flex', gap: 4, alignItems: 'center',
              opacity: openPct,
              pointerEvents: 'none',
            }}
          >
            {NAV_ITEMS.map((_, i) => (
              <div key={i} style={{
                width: i >= arcOffset && i < arcOffset + ARC_VISIBLE ? 6 : 4,
                height: i >= arcOffset && i < arcOffset + ARC_VISIBLE ? 6 : 4,
                borderRadius: '50%',
                background: i >= arcOffset && i < arcOffset + ARC_VISIBLE
                  ? '#0d9488'
                  : 'rgba(255,255,255,0.3)',
                transition: 'all 0.2s',
              }} />
            ))}
          </div>
        );
      })()}

      {/* ── FAB ── */}
      <div
        ref={fabRef}
        onPointerDown={onFabPointerDown}
        onTouchStart={(e) => {
          const t = e.touches[0];
          onFabPointerDown({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation() });
        }}
        style={{
          position: 'fixed',
          left: fabX - FAB_SIZE / 2,
          top:  fabY - FAB_SIZE / 2,
          width: FAB_SIZE, height: FAB_SIZE,
          zIndex: 8300,
          borderRadius: '50%',
          background: open
            ? 'linear-gradient(135deg, #0f766e 0%, #0d9488 100%)'
            : 'linear-gradient(135deg, #020B18 0%, #0f172a 100%)',
          border: `2px solid ${open ? '#2dd4bf' : 'rgba(13,148,136,0.6)'}`,
          boxShadow: open
            ? '0 0 0 4px rgba(13,148,136,0.2), 0 8px 32px rgba(13,148,136,0.4)'
            : '0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px rgba(13,148,136,0.2)',
          cursor: dragRef.current?.moved ? 'grabbing' : 'grab',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          transition: 'background 0.25s, border-color 0.25s, box-shadow 0.25s',
          transform: `scale(${open ? 1.08 : 1}) rotate(${open ? 45 : 0}deg)`,
        }}
      >
        {/* Icon: + when closed, × when open */}
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <line x1="11" y1="3"  x2="11" y2="19" stroke="#2dd4bf" strokeWidth="2.2" strokeLinecap="round"/>
          <line x1="3"  y1="11" x2="19" y2="11" stroke="#2dd4bf" strokeWidth="2.2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* ── Swipe hint label (shown briefly on first open) ── */}
      {open && hasMore && openPct > 0.9 && (
        <SwipeHint fabX={fabX} fabY={fabY} centreDeg={centreDeg} />
      )}
    </>
  );
}

/* ── Swipe hint ──────────────────────────────────────────────────────────── */
function SwipeHint({ fabX, fabY, centreDeg }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  const { x, y } = polar(centreDeg, ARC_RADIUS + 36);
  return (
    <div style={{
      position: 'fixed',
      left: fabX + x - 48,
      top:  fabY + y - 10,
      zIndex: 8400,
      background: 'rgba(13,148,136,0.9)',
      color: '#fff',
      fontSize: 10, fontWeight: 700,
      fontFamily: "'Arial Black', Arial, sans-serif",
      padding: '4px 10px',
      borderRadius: 20,
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      animation: 'fadeInOut 2.8s ease forwards',
    }}>
      ↺ swipe arc to scroll
    </div>
  );
}
