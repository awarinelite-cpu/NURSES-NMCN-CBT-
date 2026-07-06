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
    const applyBlur    = () => { document.body.style.filter = 'blur(20px)'; };
    const clearBlur     = () => { document.body.style.filter = ''; };

    const handleVisibility = () => {
      if (document.hidden) applyBlur();
      else clearBlur();
    };

    // Android WebViews (esp. Capacitor) can fire 'visibilitychange' late or
    // not at all on resume, leaving the blur stuck and the app looking blank.
    // 'focus'/'pageshow' are redundant safety nets that fire more reliably
    // when the app actually becomes interactive again.
    const handleFocus     = () => clearBlur();
    const handlePageShow  = () => clearBlur();
    const handleBlurEvent = () => applyBlur();

    // Belt-and-suspenders: force-clear shortly after any resume signal, in
    // case the blur got stuck. One retry, not a polling loop.
    const failsafeClear = () => {
      setTimeout(() => { if (!document.hidden) clearBlur(); }, 300);
    };

    document.addEventListener('contextmenu',     blockContextMenu, true);
    document.addEventListener('keydown',          blockKeys,        true);
    document.addEventListener('dragstart',        blockDrag,        true);
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('visibilitychange', failsafeClear);
    window.addEventListener('focus',              handleFocus);
    window.addEventListener('blur',               handleBlurEvent);
    window.addEventListener('pageshow',           handlePageShow);

    // Capacitor native lifecycle — fires reliably even when the WebView's
    // own visibilitychange doesn't.
    let capListenerHandle = null;
    (async () => {
      try {
        if (window.Capacitor?.isNativePlatform?.()) {
          const { App: CapApp } = await import('@capacitor/app');
          capListenerHandle = await CapApp.addListener('appStateChange', ({ isActive }) => {
            if (isActive) clearBlur();
            else applyBlur();
          });
        }
      } catch (e) { console.warn('Capacitor appStateChange listener failed:', e); }
    })();

    return () => {
      document.removeEventListener('contextmenu',     blockContextMenu, true);
      document.removeEventListener('keydown',          blockKeys,        true);
      document.removeEventListener('dragstart',        blockDrag,        true);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('visibilitychange', failsafeClear);
      window.removeEventListener('focus',              handleFocus);
      window.removeEventListener('blur',               handleBlurEvent);
      window.removeEventListener('pageshow',           handlePageShow);
      if (capListenerHandle?.remove) capListenerHandle.remove();
      document.body.style.filter = '';
    };
  }, [enabled]);
}
