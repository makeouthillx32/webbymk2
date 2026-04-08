'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { useTheme } from '@/app/provider';
import ThemePresetCard from '@/components/theme/_components/ThemePresetCard';
import ThemeToggle from '@/components/theme/_components/ThemeToggle';

// Import Sass styles
import '@/components/theme/_components/theme.scss';

interface ThemePreset {
  id: string;
  name: string;
  description: string;
  previewColor: string;
}

const AccessibilityOverlay = () => {
  const [isOpen, setIsOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { themeType, toggleTheme, themeId, setThemeId, availableThemes, getTheme } = useTheme();
  
  // Generate theme presets from available themes
  const [themePresets, setThemePresets] = useState<ThemePreset[]>([]);
  
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
    const loadedThemes: ThemePreset[] = availableThemes.map(id => {
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
      className="theme-selector bg-black/50"
    >
      <div className="theme-selector__container bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-[var(--shadow-6)]">
        {/* Header */}
        <div className="theme-selector__header bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] border-b border-[hsl(var(--sidebar-primary-foreground))]/15">
          <h2 className="theme-selector__title">Theme Selector</h2>
          <button 
            onClick={() => setIsOpen(false)}
            className="theme-selector__close bg-[hsl(var(--sidebar-primary-foreground))]/20 text-[hsl(var(--sidebar-primary-foreground))] border border-[hsl(var(--sidebar-primary-foreground))]/10 hover:bg-[hsl(var(--sidebar-primary-foreground))]/30"
            aria-label="Close overlay"
          >
            <X size={24} />
          </button>
        </div>
        
        {/* Controls */}
        <div className="theme-selector__controls bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))]">
          <button
            onClick={resetSettings}
            className="theme-selector__control-button bg-[hsl(var(--sidebar-primary-foreground))]/20 text-[hsl(var(--sidebar-primary-foreground))] border border-[hsl(var(--sidebar-primary-foreground))]/10 hover:bg-[hsl(var(--sidebar-primary-foreground))]/30"
            aria-label="Reset all settings"
          >
            <RefreshCw size={18} />
            <span>Reset to Default</span>
          </button>
        </div>
        
        {/* Content Area */}
        <div className="theme-selector__content bg-[hsl(var(--background))]">
          {/* Theme Presets Section */}
          <section className="theme-selector__section border-b border-[hsl(var(--border))]/40">
            <h3 className="theme-selector__section-title text-[hsl(var(--foreground))] after:bg-[hsl(var(--border))]/40">
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
              <div className="theme-presets-placeholder bg-[hsl(var(--muted))]/50 border border-[hsl(var(--border))] border-dashed">
                <p className="theme-presets-placeholder__text text-[hsl(var(--muted-foreground))]">
                  More theme presets coming soon. Check back for updates!
                </p>
              </div>
            </div>
          </section>
        </div>
        
        {/* Footer */}
        <div className="theme-selector__footer bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar-primary-foreground))] border-t border-[hsl(var(--sidebar-primary-foreground))]/15">
          <span> Better accessibility By </span>
          <strong className="theme-selector__brand">unenter</strong>
          <p className="theme-selector__keyboard-hint">Press ESC to close this panel😄</p>
        </div>
      </div>
    </div>
  );
};

export default AccessibilityOverlay;