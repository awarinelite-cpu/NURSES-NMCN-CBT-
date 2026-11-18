// src/components/shared/PullToRefresh.jsx
// Pull the screen down from the top to reload the app (the browser's own
// pull-to-refresh is disabled globally via overscroll-behavior: none).
import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 70;   // px of pull needed to trigger a reload
const MAX_PULL  = 110;

export default function PullToRefresh({ disabled = false }) {
  const [pull, setPull] = useState(0);
  const [loading, setLoading] = useState(false);
  const startY = useRef(null);
  const pulling = useRef(false);
  const pullRef = useRef(0);

  useEffect(() => {
    if (disabled) return;

    // True if the touch began inside the page scroller with nothing scrolled
    const atTop = (target) => {
      const scroller = document.querySelector('.main-content');
      if (!scroller || !scroller.contains(target)) return false;
      if (scroller.scrollTop > 0) return false;
      for (let el = target; el && el !== scroller; el = el.parentElement) {
        if (el.scrollTop > 0) return false; // an inner list is scrolled
      }
      return true;
    };

    const onStart = (e) => {
      if (loading || e.touches.length !== 1 || !atTop(e.target)) { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
      pulling.current = false;
    };
    const onMove = (e) => {
      if (startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { if (pulling.current) { pulling.current = false; pullRef.current = 0; setPull(0); } return; }
      pulling.current = true;
      const d = Math.min(MAX_PULL, dy * 0.5);
      pullRef.current = d;
      setPull(d);
    };
    const onEnd = () => {
      if (startY.current == null) return;
      startY.current = null;
      if (pulling.current && pullRef.current >= THRESHOLD) {
        setLoading(true);
        setPull(THRESHOLD);
        setTimeout(() => window.location.reload(), 250);
      } else {
        setPull(0);
      }
      pulling.current = false;
      pullRef.current = 0;
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [disabled, loading]);

  if (disabled || (pull === 0 && !loading)) return null;
  const ready = pull >= THRESHOLD;
  return (
    <div aria-hidden="true" style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 900, display: 'flex', justifyContent: 'center',
      pointerEvents: 'none', transform: `translateY(${pull - 44}px)`, transition: pulling.current ? 'none' : 'transform .2s',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%', background: '#fff', boxShadow: '0 3px 12px rgba(0,0,0,.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 'env(safe-area-inset-top, 0px)',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0b5a31" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: loading ? undefined : `rotate(${Math.min(pull / THRESHOLD, 1) * 270}deg)`, animation: loading ? 'ptr-spin .7s linear infinite' : 'none', opacity: ready || loading ? 1 : 0.6 }}>
          <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
        </svg>
        <style>{`@keyframes ptr-spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );
}
