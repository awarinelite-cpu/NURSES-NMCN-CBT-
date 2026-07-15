// src/components/shared/AdminWhatsAppButton.jsx
// Persistent, small, draggable floating "Contact Admin on WhatsApp" button.
// Always visible (not just on error) so students can reach out anytime —
// on the subject/course lists, the upgrade/payment screens, etc.
// The person can drag it out of the way; its position is remembered
// (per device, via localStorage) across pages and future visits.

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

export default function AdminWhatsAppButton({
  message = 'Hi, I need help with The Elite Nurses app.',
}) {
  const [pos, setPos] = useState(loadPosition);
  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  // Keep the button on-screen if the viewport is resized/rotated
  useEffect(() => {
    const onResize = () => setPos(p => clampPosition(p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const startDrag = useCallback((clientX, clientY) => {
    drag.current.active = true;
    drag.current.moved = false;
    drag.current.startX = clientX;
    drag.current.startY = clientY;
    drag.current.origX = pos.x;
    drag.current.origY = pos.y;
  }, [pos]);

  const handleMouseDown = (e) => startDrag(e.clientX, e.clientY);
  const handleTouchStart = (e) => {
    const t = e.touches[0];
    startDrag(t.clientX, t.clientY);
  };

  useEffect(() => {
    function moveTo(clientX, clientY) {
      const dx = clientX - drag.current.startX;
      const dy = clientY - drag.current.startY;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        drag.current.moved = true;
      }
      setPos(clampPosition({ x: drag.current.origX + dx, y: drag.current.origY + dy }));
    }
    function onMouseMove(e) {
      if (!drag.current.active) return;
      moveTo(e.clientX, e.clientY);
    }
    function onTouchMove(e) {
      if (!drag.current.active) return;
      e.preventDefault(); // stop page scroll while dragging the button
      const t = e.touches[0];
      moveTo(t.clientX, t.clientY);
    }
    function onRelease() {
      if (!drag.current.active) return;
      drag.current.active = false;
      setPos(p => {
        try { localStorage.setItem(POSITION_KEY, JSON.stringify(p)); } catch {}
        return p;
      });
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onRelease);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onRelease);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onRelease);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onRelease);
    };
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
      href={buildLink(message)}
      target="_blank"
      rel="noopener noreferrer"
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onClick={handleClick}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
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
      }}
      aria-label="Contact Admin on WhatsApp"
      title="Contact Admin on WhatsApp — drag to move"
    >
      <span style={{ fontSize: 20, lineHeight: 1 }}>💬</span>
    </a>
  );
}

// Same link builder, exported for inline (non-floating) uses on the
// payment pages, so those keep their existing button styling.
export { buildLink as buildWhatsAppLink, WHATSAPP_NUMBER };
