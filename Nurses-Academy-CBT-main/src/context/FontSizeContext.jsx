// src/context/FontSizeContext.jsx
// App-wide text size control, available to every user (not admin-only).
// Range: 14px (default/normal) up to 20px, in 2px steps.
// Implemented with CSS `zoom` on <body> rather than a transform — zoom makes
// the browser actually reflow the layout at the new size (text wraps, cards
// resize, containers re-fit) instead of just visually stretching content, so
// increasing it doesn't push anything off-screen or cause overlap.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const FontSizeContext = createContext(null);

const KEY = 'nmcn_app_font_size';
const MIN = 14;
const MAX = 20;
const STEP = 2;
const BASE = 14; // the size everything was designed/tested at → zoom 1.0

function clamp(n) {
  return Math.min(MAX, Math.max(MIN, n));
}

export function FontSizeProvider({ children }) {
  const [fontSize, setFontSizeState] = useState(() => {
    const stored = parseInt(localStorage.getItem(KEY), 10);
    return Number.isFinite(stored) ? clamp(stored) : BASE;
  });

  useEffect(() => {
    const zoom = fontSize / BASE;
    // `zoom` is supported in all Chromium browsers, Safari, and Firefox 126+.
    document.body.style.zoom = zoom;
    document.documentElement.style.setProperty('--app-font-size', `${fontSize}px`);
  }, [fontSize]);

  const setFontSize = useCallback((n) => {
    const next = clamp(n);
    localStorage.setItem(KEY, String(next));
    setFontSizeState(next);
  }, []);

  const increaseFontSize = useCallback(() => {
    setFontSize(fontSize + STEP);
  }, [fontSize, setFontSize]);

  const decreaseFontSize = useCallback(() => {
    setFontSize(fontSize - STEP);
  }, [fontSize, setFontSize]);

  const resetFontSize = useCallback(() => setFontSize(BASE), [setFontSize]);

  return (
    <FontSizeContext.Provider value={{
      fontSize, setFontSize, increaseFontSize, decreaseFontSize, resetFontSize,
      min: MIN, max: MAX, step: STEP, base: BASE,
    }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export const useFontSize = () => useContext(FontSizeContext);
