// src/components/shared/AdminWhatsAppButton.jsx
// Persistent, small, draggable floating "Contact Admin on WhatsApp" button.
// Always visible (not just on error) so students can reach out anytime —
// on the subject/course lists, the upgrade/payment screens, etc.
// The person can drag it out of the way; its position is remembered
// (per device, via localStorage) across pages and future visits.
//
// Drag implementation notes (for smoothness):
// - Uses the Pointer Events API (one code path for mouse/touch/pen) with
//   setPointerCapture, so the element keeps receiving move events even if
//   the pointer moves faster than the element itself, or off the element.
// - Position is applied via `transform: translate3d(...)`, not left/top,
//   so dragging is GPU-composited and never triggers layout reflow.
// - The DOM node's style is mutated directly through a ref on every
//   pointermove — no React re-render while dragging — so it tracks the
//   pointer 1:1. React state (and localStorage) is only written once,
//   on release.
// - Native browser drag-and-drop on the <a> is fully disabled
//   (draggable={false} + preventDefault on dragstart + -webkit-user-drag:
//   none). Without this, the browser's own native drag machinery
//   (ghost-image negotiation) competes with our pointer handling and is
//   the main cause of perceived lag on anchor/image elements.

import { useState, useRef, useEffect, useCallback } from 'react';

const WHATSAPP_NUMBER = '2348134106745';
const POSITION_KEY = 'elite_nurses_whatsapp_btn_pos';
const SIZE = 48;   // button diameter, px
const MARGIN = 8;  // min gap from screen edge, px
const DRAG_THRESHOLD = 6; // px of movement before a tap counts as a drag

function buildLink(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function clampPosition(pos) {
  if (typeof window === 'undefined') return pos;
  const maxX = Math.max(MARGIN, window.innerWidth - SIZE - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - SIZE - MARGIN);
  return {
    x: Math.min(Math.max(pos.x, MARGIN), maxX),
    y: Math.min(Math.max(pos.y, MARGIN), maxY),
  };
}

function defaultPosition() {
  if (typeof window === 'undefined') return { x: MARGIN, y: MARGIN };
  return clampPosition({
    x: window.innerWidth - SIZE - 16,
    y: window.innerHeight - SIZE - 16,
  });
}

function loadPosition() {
  try {
    const saved = localStorage.getItem(POSITION_KEY);
    if (saved) return clampPosition(JSON.parse(saved));
  } catch {
    // ignore malformed/unavailable storage
  }
  return defaultPosition();
}

function applyTransform(el, x, y) {
  if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

export default function AdminWhatsAppButton({
  message = 'Hi, I need help with The Elite Nurses app.',
}) {
  const [pos, setPos] = useState(loadPosition);
  const elRef = useRef(null);
  const drag = useRef({
    active: false, moved: false, pointerId: null,
    startX: 0, startY: 0, origX: 0, origY: 0,
    curX: 0, curY: 0,
  });

  // Sync the DOM transform whenever committed React state changes
  // (initial mount, and after a resize-driven clamp).
  useEffect(() => {
    applyTransform(elRef.current, pos.x, pos.y);
  }, [pos]);

  // Keep the button on-screen if the viewport is resized/rotated
  useEffect(() => {
    const onResize = () => setPos(p => clampPosition(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handlePointerDown = useCallback((e) => {
    drag.current.active = true;
    drag.current.moved = false;
    drag.current.pointerId = e.pointerId;
    drag.current.startX = e.clientX;
    drag.current.startY = e.clientY;
    drag.current.origX = pos.x;
    drag.current.origY = pos.y;
    drag.current.curX = pos.x;
    drag.current.curY = pos.y;
    // Keep receiving pointermove on this element even if the pointer
    // moves fast, or drifts outside the element's bounds mid-drag.
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [pos]);

  const handlePointerMove = useCallback((e) => {
    if (!drag.current.active || e.pointerId !== drag.current.pointerId) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      drag.current.moved = true;
    }
    const next = clampPosition({ x: drag.current.origX + dx, y: drag.current.origY + dy });
    drag.current.curX = next.x;
    drag.current.curY = next.y;
    // Direct DOM write, no React state, no rAF queueing delay —
    // paints on this same event, tracking the pointer 1:1.
    applyTransform(elRef.current, next.x, next.y);
  }, []);

  const endDrag = useCallback((e) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (elRef.current && drag.current.pointerId != null) {
      try { elRef.current.releasePointerCapture(drag.current.pointerId); } catch {}
    }
    const final = { x: drag.current.curX, y: drag.current.curY };
    setPos(final);
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(final)); } catch {}
  }, []);

  // If the button was dragged, swallow the click so it doesn't also open WhatsApp
  const handleClick = (e) => {
    if (drag.current.moved) {
      e.preventDefault();
      drag.current.moved = false;
    }
  };

  return (
    <a
      ref={elRef}
      href={buildLink(message)}
      target="_blank"
      rel="noopener noreferrer"
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={handleClick}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`,
        zIndex: 999,
        width: SIZE,
        height: SIZE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        background: '#25D366',
        color: '#0B1220',
        textDecoration: 'none',
        boxShadow: '0 4px 12px rgba(37,211,102,0.45)',
        border: '1px solid rgba(255,255,255,0.25)',
        touchAction: 'none',
        cursor: 'grab',
        userSelect: 'none',
        WebkitUserDrag: 'none',
        WebkitTapHighlightColor: 'transparent',
        willChange: 'transform',
      }}
      aria-label="Contact Admin on WhatsApp"
      title="Contact Admin on WhatsApp — drag to move"
    >
      <span style={{ fontSize: 20, lineHeight: 1, pointerEvents: 'none' }}>💬</span>
    </a>
  );
}

// Same link builder, exported for inline (non-floating) uses on the
// payment pages, so those keep their existing button styling.
export { buildLink as buildWhatsAppLink, WHATSAPP_NUMBER };
