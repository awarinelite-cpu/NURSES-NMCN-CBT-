// src/context/AccessibilityContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';

const AccessibilityContext = createContext(null);

const FONT_SIZES = [
  { id: 'small',   label: 'A',  scale: 0.875 },
  { id: 'medium',  label: 'A',  scale: 1     },
  { id: 'large',   label: 'A',  scale: 1.175 },
];

export function AccessibilityProvider({ children }) {
  const [fontSize,     setFontSize]     = useState(() => localStorage.getItem('nmcn_font_size')     || 'medium');
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem('nmcn_high_contrast') === 'true');

  /* ── Apply font scale to <html> ── */
  useEffect(() => {
    const size  = FONT_SIZES.find(f => f.id === fontSize) || FONT_SIZES[1];
    document.documentElement.style.fontSize = `${size.scale * 16}px`;
    localStorage.setItem('nmcn_font_size', fontSize);
  }, [fontSize]);

  /* ── Apply high contrast attribute to <html> ── */
  useEffect(() => {
    if (highContrast) {
      document.documentElement.setAttribute('data-contrast', 'high');
    } else {
      document.documentElement.removeAttribute('data-contrast');
    }
    localStorage.setItem('nmcn_high_contrast', highContrast);
  }, [highContrast]);

  const cycleFontSize = () => {
    const idx  = FONT_SIZES.findIndex(f => f.id === fontSize);
    const next = FONT_SIZES[(idx + 1) % FONT_SIZES.length];
    setFontSize(next.id);
  };

  return (
    <AccessibilityContext.Provider value={{
      fontSize, setFontSize, cycleFontSize,
      highContrast, setHighContrast,
      fontSizes: FONT_SIZES,
    }}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export const useAccessibility = () => useContext(AccessibilityContext);
