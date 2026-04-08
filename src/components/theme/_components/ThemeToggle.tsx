// components/theme/_components/ThemeToggle.tsx
'use client';

import React from 'react';
import './button.scss';

interface ThemeToggleProps {
  onClick: () => void;
}

/**
 * ThemeToggle - The floating accessibility icon button
 */
const ThemeToggle: React.FC<ThemeToggleProps> = ({ onClick }) => {
  return (
    <button 
      onClick={onClick}
      className="accessibility-toggle-btn"
      aria-label="Open accessibility and theme settings"
    >
      <img
        src="/images/icon/asesablity.svg"
        alt="Accessibility settings"
        className="accessibility-toggle-btn__icon"
      />
    </button>
  );
};

export default ThemeToggle;