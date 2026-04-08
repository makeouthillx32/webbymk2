'use client';

import React from 'react';
import { Moon, Sun } from 'lucide-react';
import './theme.scss';

interface ThemeColorModeProps {
  mode: 'light' | 'dark';
  onToggle: () => void;
}

/**
 * ThemeColorMode - Toggle between light and dark modes
 */
const ThemeColorMode: React.FC<ThemeColorModeProps> = ({
  mode,
  onToggle
}) => {
  return (
    <button
      onClick={onToggle}
      className="theme-selector__control-button"
      aria-pressed={mode === 'dark'}
      aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
    >
      {mode === 'dark' ? (
        <>
          <Sun size={18} />
          <span>Light Mode</span>
        </>
      ) : (
        <>
          <Moon size={18} />
          <span>Dark Mode</span>
        </>
      )}
    </button>
  );
};

export default ThemeColorMode;