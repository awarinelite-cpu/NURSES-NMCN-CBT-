// src/hooks/useContentProtection.js
// NOTE: Copy/paste blocking (context menu, keyboard shortcuts, drag-block,
// Screen Capture API denial) has been removed — it was interfering with
// normal use (e.g. pasting into inputs). Only the unrelated tab-switch
// blur (screen-recording deterrent) remains.

import { useEffect } from 'react';

export function useContentProtection(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    /* -- Visibility API — blur sensitive content on tab switch -- */
    const applyBlur    = () => { document.body.style.filter = 'blur(20px)'; };
    const clearBlur     = () => { document.body.style.filter = ''; };

    const handleVisibility = () => {
      if (document.hidden) applyBlur();
      else clearBlur();
    };

    const handleFocus     = () => clearBlur();
    const handlePageShow  = () => clearBlur();
    const handleBlurEvent = () => {
      if (window.__paymentModalOpen) return;
      applyBlur();
    };

    const failsafeClear = () => {
      setTimeout(() => { if (!document.hidden) clearBlur(); }, 300);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('visibilitychange', failsafeClear);
    window.addEventListener('focus',              handleFocus);
    window.addEventListener('blur',               handleBlurEvent);
    window.addEventListener('pageshow',           handlePageShow);

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
