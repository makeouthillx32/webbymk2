'use client';

import React from 'react';
import './theme.scss';

interface ThemePresetCardProps {
  id: string;
  name: string;
  description: string;
  previewColor: string;
  isActive: boolean;
  onApply: (id: string) => void;
}

/**
 * ThemePresetCard - Displays a single theme preset with options to apply it
 */
const ThemePresetCard: React.FC<ThemePresetCardProps> = ({
  id,
  name,
  description,
  previewColor,
  isActive,
  onApply
}) => {
  return (
    <div className="theme-preset-card">
      <div className="theme-preset-card__color-preview">
        <div 
          className={`theme-preset-card__swatch ${isActive ? 'theme-preset-card__swatch--active' : ''}`}
          style={{ backgroundColor: previewColor }}
          aria-hidden="true"
        />
      </div>
      
      <div className="theme-preset-card__content">
        <h4 className="theme-preset-card__title">
          {name} Preset
        </h4>
        <p className="theme-preset-card__description">
          {description}
        </p>
      </div>
      
      <div className="theme-preset-card__actions">
        <button
          className={`theme-preset-card__button ${isActive ? 'theme-preset-card__button--active' : ''}`}
          onClick={() => onApply(id)}
          disabled={isActive}
          aria-pressed={isActive}
        >
          {isActive ? 'Active' : 'Apply'}
        </button>
      </div>
    </div>
  );
};

export default ThemePresetCard;
