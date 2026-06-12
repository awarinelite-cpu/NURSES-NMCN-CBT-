// src/hooks/useContentProtection.js
// Blocks text selection, long-press copy, context menu, keyboard copy shortcuts,
// and screen capture (best-effort via Screen Capture API).

import { useEffect } from 'react';

export function useContentProtection(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    /* ── Block context menu ─────────────────────────────── */
    const blockContextMenu = (e) => e.preventDefault();

    /* ── Block keyboard shortcuts (Ctrl+C, Ctrl+A, Ctrl+S, PrintScreen) ── */
    const blockKeys = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (
        (ctrl && ['c', 'a', 's', 'u', 'p'].includes(e.key.toLowerCase())) ||
        e.key === 'PrintScreen' ||
        e.key === 'F12'
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };

    /* ── Block drag-start (another copy vector) ─────────── */
    const blockDrag = (e) => e.preventDefault();

    /* ── Screen Capture API — deny getDisplayMedia ──────── */
    if (navigator.mediaDevices) {
      const _orig = navigator.mediaDevices.getDisplayMedia?.bind(navigator.mediaDevices);
      navigator.mediaDevices.getDisplayMedia = () =>
        Promise.reject(new DOMException('Screen capture is disabled on this platform.', 'NotAllowedError'));
    }

    /* ── Visibility API — blur sensitive content on tab switch ── */
    const handleVisibility = () => {
      if (document.hidden) {
        document.body.style.filter = 'blur(20px)';
      } else {
        document.body.style.filter = '';
      }
    };

    document.addEventListener('contextmenu',     blockContextMenu, true);
    document.addEventListener('keydown',          blockKeys,        true);
    document.addEventListener('dragstart',        blockDrag,        true);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('contextmenu',     blockContextMenu, true);
      document.removeEventListener('keydown',          blockKeys,        true);
      document.removeEventListener('dragstart',        blockDrag,        true);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.body.style.filter = '';
    };
  }, [enabled]);
}
