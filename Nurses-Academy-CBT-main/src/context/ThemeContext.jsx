// src/context/ThemeContext.jsx
// Per-section theme memory: NMCN and Entrance each remember their own preference.
// Three themes cycle: 'dark' → 'light' → 'reading' → 'dark'
//   reading = warm sepia background, larger base text, reduced blue light
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

const ThemeContext = createContext(null);

const KEY_NMCN     = 'nmcn_theme';
const KEY_ENTRANCE = 'entrance_theme';

// Ordered cycle — toggleTheme advances one step at a time
const THEME_CYCLE = ['dark', 'light', 'reading'];

function sectionKey(pathname) {
  return pathname?.startsWith('/entrance') ? KEY_ENTRANCE : KEY_NMCN;
}

export function ThemeProvider({ children }) {
  const [themes, setThemes] = useState(() => {
    // Respect system preference on first visit, then remember user choice
    const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const fallback   = systemDark ? 'dark' : 'light';
    return {
      [KEY_NMCN]:     localStorage.getItem(KEY_NMCN)     || fallback,
      [KEY_ENTRANCE]: localStorage.getItem(KEY_ENTRANCE) || fallback,
    };
  });

  // Try to read location; fall back gracefully if called outside Router
  let pathname = '/';
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    pathname = useLocation().pathname;
  } catch {}

  const key   = sectionKey(pathname);
  const theme = themes[key] || 'dark';

  // Apply theme to <html> whenever active section's theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Cycle: dark → light → reading → dark
  const toggleTheme = useCallback(() => {
    setThemes(prev => {
      const cur  = prev[key] || 'dark';
      const idx  = THEME_CYCLE.indexOf(cur);
      const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
      localStorage.setItem(key, next);
      return { ...prev, [key]: next };
    });
  }, [key]);

  const setTheme = useCallback((t) => {
    setThemes(prev => {
      localStorage.setItem(key, t);
      return { ...prev, [key]: t };
    });
  }, [key]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
