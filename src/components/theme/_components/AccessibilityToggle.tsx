'use client';

import React from 'react';
import './theme.scss';

interface AccessibilityToggleProps {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  onToggle: (id: string) => void;
}

/**
 * AccessibilityToggle - Toggle switch for accessibility presets
 */
const AccessibilityToggle: React.FC<AccessibilityToggleProps> = ({
  id,
  name,
  description,
  enabled,
  onToggle
}) => {
  return (
    <div className="accessibility-toggle">
      <div className="accessibility-toggle__switch">
        <div 
          className={`accessibility-toggle__track ${enabled ? 'accessibility-toggle__track--enabled' : ''}`}
          aria-hidden="true"
        >
          <button
            type="button"
            className={`accessibility-toggle__thumb ${enabled ? 'accessibility-toggle__thumb--enabled' : ''}`}
            onClick={() => onToggle(id)}
            aria-pressed={enabled}
            aria-label={`${name}: ${enabled ? 'Enabled' : 'Disabled'}`}
          />
        </div>
      </div>
      
      <div className="accessibility-toggle__content">
        <h4 className="accessibility-toggle__title">
          {name}
        </h4>
        <p className="accessibility-toggle__description">
          {description}
        </p>
      </div>
    </div>
  );
};

export default AccessibilityToggle;