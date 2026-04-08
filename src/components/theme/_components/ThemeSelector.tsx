
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { useTheme } from '@/app/provider';
import ThemeToggle from './ThemeToggle';
import ThemePresetCard from './ThemePresetCard';
import AccessibilityToggle from './AccessibilityToggle';
import ThemeColorMode from './ThemeColorMode';
import './theme.scss';

interface AccessibilityPreset {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

/**
 * ThemeSelector - Main component for theme and accessibility settings
 */
const ThemeSelector: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { themeType, toggleTheme, themeId, setThemeId, availableThemes, getTheme } = useTheme();
  
  const [accessibilityPresets, setAccessibilityPresets] = useState<AccessibilityPreset[]>([
    {
      id: 'seizure',
      name: 'Seizure Safe Preset',
      description: 'Clear flashes & reduces color',
      enabled: false
    },
    {
      id: 'vision',
      name: 'Vision Impaired Preset',
      description: 'Enhances website\'s visuals',
      enabled: false
    },
    {
      id: 'adhd',
      name: 'ADHD Friendly Preset',
      description: 'More focus & fewer distractions',
      enabled: false
    }
  ]);
  
  // Generate theme presets from available themes
  const [themePresets, setThemePresets] = useState<any[]>([]);
  
  // Effect for ESC key to close overlay
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);
  
  // Lock body scroll when overlay is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);
  
  useEffect(() => {
    // Load theme presets when component mounts
    const loadedThemes = availableThemes.map(id => {
      const theme = getTheme();
      return {
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1), // Capitalize first letter
        description: theme.description || `${id} theme preset`,
        previewColor: theme.previewColor
      };
    });
    setThemePresets(loadedThemes);
  }, [availableThemes, getTheme]);

  const resetSettings = () => {
    // Reset theme to default preset
    setThemeId('default');
    
    // Reset dark/light mode based on system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      if (themeType !== 'dark') toggleTheme();
    } else {
      if (themeType !== 'light') toggleTheme();
    }
    
    // Reset accessibility presets
    setAccessibilityPresets(accessibilityPresets.map(preset => ({ ...preset, enabled: false })));
  };

  const togglePreset = (id: string) => {
    setAccessibilityPresets(accessibilityPresets.map(preset => 
      preset.id === id ? { ...preset, enabled: !preset.enabled } : preset
    ));
  };

  const toggleOverlay = () => {
    setIsOpen(!isOpen);
  };

  // Click outside to close
  const handleOutsideClick = (e: React.MouseEvent) => {
    if (overlayRef.current && e.target === overlayRef.current) {
      setIsOpen(false);
    }
  };

  if (!isOpen) {
    return <ThemeToggle onClick={toggleOverlay} />;
  }

  return (
    <div 
      ref={overlayRef}
      onClick={handleOutsideClick}
      className="theme-selector"
    >
      <div className="theme-selector__container">
        {/* Header */}
        <div className="theme-selector__header">
          <h2 className="theme-selector__title">Accessibility & Theme</h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="theme-selector__close"
            aria-label="Close settings"
          >
            <X size={24} />
          </button>
        </div>
        
        {/* Controls */}
        <div className="theme-selector__controls">
          <ThemeColorMode 
            mode={themeType as 'light' | 'dark'} 
            onToggle={toggleTheme} 
          />
          
          <button
            onClick={resetSettings}
            className="theme-selector__control-button"
            aria-label="Reset all settings"
          >
            <RefreshCw size={18} />
            <span>Reset All</span>
          </button>
        </div>
        
        {/* Content Area */}
        <div className="theme-selector__content">
          {/* Theme Presets Section */}
          <section className="theme-selector__section">
            <h3 className="theme-selector__section-title">
              Theme Presets
            </h3>
            
            <div>
              {themePresets.map(preset => (
                <ThemePresetCard
                  key={preset.id}
                  id={preset.id}
                  name={preset.name}
                  description={preset.description}
                  previewColor={preset.previewColor}
                  isActive={themeId === preset.id}
                  onApply={setThemeId}
                />
              ))}
              
              {/* Placeholder for more themes */}
              <div className="theme-presets-placeholder">
                <p className="theme-presets-placeholder__text">
                  More theme presets coming soon. Check back for updates!
                </p>
              </div>
            </div>
          </section>
          
          {/* Accessibility Presets Section */}
          <section className="theme-selector__section">
            <h3 className="theme-selector__section-title">
              Accessibility Presets
            </h3>
            
            <div>
              {accessibilityPresets.map(preset => (
                <AccessibilityToggle
                  key={preset.id}
                  id={preset.id}
                  name={preset.name}
                  description={preset.description}
                  enabled={preset.enabled}
                  onToggle={togglePreset}
                />
              ))}
            </div>
          </section>
        </div>
        
        {/* Footer */}
        <div className="theme-selector__footer">
          <span>Theme System By </span>
          <strong className="theme-selector__brand">Your Brand Name</strong>
          <p className="theme-selector__keyboard-hint">Press ESC to close this panel</p>
        </div>
      </div>
    </div>
  );
};

export default ThemeSelector;