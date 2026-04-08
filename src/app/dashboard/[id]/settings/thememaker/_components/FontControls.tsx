// app/dashboard/[id]/settings/thememaker/_components/FontControls.tsx

"use client";

import React from 'react';
import { Type, CornerUpRight, Palette, Move } from 'lucide-react';

interface FontControlsProps {
  currentTheme: {
    fonts: {
      sans: string;
      serif: string;
      mono: string;
    };
    radii: {
      radius: string;
    };
    shadows: {
      shadow2xs: string;
      shadowXs: string;
      shadowSm: string;
      shadow: string;
      shadowMd: string;
      shadowLg: string;
      shadowXl: string;
      shadow2xl: string;
    };
    typography: {
      trackingNormal: string;
    };
    [key: string]: any;
  };
  onFontChange: (fontType: 'sans' | 'serif' | 'mono', value: string) => void;
  onRadiusChange: (value: string) => void;
  onShadowChange: (shadowType: string, value: string) => void;
  onTypographyChange: (property: string, value: string) => void;
}

export const FontControls: React.FC<FontControlsProps> = ({
  currentTheme,
  onFontChange,
  onRadiusChange,
  onShadowChange,
  onTypographyChange
}) => {
  // Popular font stacks
  const fontOptions = {
    sans: [
      'Inter, sans-serif',
      'Plus Jakarta Sans, sans-serif',
      'Roboto, sans-serif',
      'Open Sans, sans-serif',
      'Lato, sans-serif',
      'Montserrat, sans-serif',
      'Poppins, sans-serif',
      'Source Sans Pro, sans-serif',
      'Nunito, sans-serif',
      'Rubik, sans-serif',
      'Work Sans, sans-serif',
      'Architects Daughter, sans-serif',
      'Oxanium, sans-serif',
      'system-ui, sans-serif'
    ],
    serif: [
      'Source Serif 4, serif',
      'Georgia, serif',
      'Times New Roman, serif',
      'Lora, serif',
      'Playfair Display, serif',
      'Merriweather, serif',
      'Libre Baskerville, serif',
      'Crimson Text, serif',
      'ui-serif, serif'
    ],
    mono: [
      'JetBrains Mono, monospace',
      'Fira Code, monospace',
      'Source Code Pro, monospace',
      'Monaco, monospace',
      'Consolas, monospace',
      'IBM Plex Mono, monospace',
      'Inconsolata, monospace',
      'Courier New, monospace',
      'ui-monospace, monospace'
    ]
  };

  // Border radius presets
  const radiusPresets = [
    { label: 'None', value: '0px' },
    { label: 'Small', value: '0.125rem' },
    { label: 'Default', value: '0.25rem' },
    { label: 'Medium', value: '0.375rem' },
    { label: 'Large', value: '0.5rem' },
    { label: 'Extra Large', value: '0.75rem' },
    { label: 'Full', value: '9999px' }
  ];

  // Shadow presets
  const shadowOptions = [
    { key: 'shadow2xs', label: '2XS Shadow' },
    { key: 'shadowXs', label: 'XS Shadow' },
    { key: 'shadowSm', label: 'SM Shadow' },
    { key: 'shadow', label: 'Default Shadow' },
    { key: 'shadowMd', label: 'MD Shadow' },
    { key: 'shadowLg', label: 'LG Shadow' },
    { key: 'shadowXl', label: 'XL Shadow' },
    { key: 'shadow2xl', label: '2XL Shadow' }
  ];

  return (
    <div className="space-y-6">
      {/* Font Families */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Font Families</h3>
        </div>
        
        <div className="space-y-3">
          {/* Sans-serif Font */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Sans-serif Font
            </label>
            <select
              value={currentTheme.fonts.sans}
              onChange={(e) => onFontChange('sans', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
            >
              {fontOptions.sans.map((font) => (
                <option key={font} value={font}>
                  {font.split(',')[0]}
                </option>
              ))}
            </select>
            <div 
              className="text-sm p-2 bg-muted rounded border"
              style={{ fontFamily: currentTheme.fonts.sans }}
            >
              Sample text in {currentTheme.fonts.sans.split(',')[0]}
            </div>
          </div>

          {/* Serif Font */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Serif Font
            </label>
            <select
              value={currentTheme.fonts.serif}
              onChange={(e) => onFontChange('serif', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
            >
              {fontOptions.serif.map((font) => (
                <option key={font} value={font}>
                  {font.split(',')[0]}
                </option>
              ))}
            </select>
            <div 
              className="text-sm p-2 bg-muted rounded border"
              style={{ fontFamily: currentTheme.fonts.serif }}
            >
              Sample text in {currentTheme.fonts.serif.split(',')[0]}
            </div>
          </div>

          {/* Monospace Font */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Monospace Font
            </label>
            <select
              value={currentTheme.fonts.mono}
              onChange={(e) => onFontChange('mono', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
            >
              {fontOptions.mono.map((font) => (
                <option key={font} value={font}>
                  {font.split(',')[0]}
                </option>
              ))}
            </select>
            <div 
              className="text-sm p-2 bg-muted rounded border font-mono"
              style={{ fontFamily: currentTheme.fonts.mono }}
            >
              const example = "Sample code text";
            </div>
          </div>
        </div>
      </div>

      {/* Border Radius */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <CornerUpRight className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Border Radius</h3>
        </div>
        
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Default Radius
            </label>
            <div className="flex gap-2">
              <select
                value={currentTheme.radii.radius}
                onChange={(e) => onRadiusChange(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-input rounded-md bg-background"
              >
                {radiusPresets.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label} ({preset.value})
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={currentTheme.radii.radius}
                onChange={(e) => onRadiusChange(e.target.value)}
                className="w-24 px-2 py-2 text-xs border border-input rounded bg-background font-mono"
                placeholder="0.5rem"
              />
            </div>
            <div className="flex gap-2">
              <div 
                className="w-8 h-8 bg-primary border border-border"
                style={{ borderRadius: currentTheme.radii.radius }}
              ></div>
              <div 
                className="w-8 h-8 bg-secondary border border-border"
                style={{ borderRadius: `calc(${currentTheme.radii.radius} + 4px)` }}
              ></div>
              <div 
                className="w-8 h-8 bg-accent border border-border"
                style={{ borderRadius: `calc(${currentTheme.radii.radius} + 8px)` }}
              ></div>
              <div className="text-xs text-muted-foreground self-center">
                Radius variations
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Typography */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Move className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Typography</h3>
        </div>
        
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Letter Spacing (Tracking)
            </label>
            <div className="flex gap-2">
              <select
                value={currentTheme.typography.trackingNormal}
                onChange={(e) => onTypographyChange('trackingNormal', e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-input rounded-md bg-background"
              >
                <option value="-0.05em">Tighter (-0.05em)</option>
                <option value="-0.025em">Tight (-0.025em)</option>
                <option value="0em">Normal (0em)</option>
                <option value="0px">Zero (0px)</option>
                <option value="0.025em">Wide (0.025em)</option>
                <option value="0.05em">Wider (0.05em)</option>
                <option value="0.1em">Widest (0.1em)</option>
                <option value="0.5px">0.5px</option>
                <option value="1px">1px</option>
              </select>
              <input
                type="text"
                value={currentTheme.typography.trackingNormal}
                onChange={(e) => onTypographyChange('trackingNormal', e.target.value)}
                className="w-24 px-2 py-2 text-xs border border-input rounded bg-background font-mono"
                placeholder="0px"
              />
            </div>
            <div 
              className="text-sm p-3 bg-muted rounded border"
              style={{ letterSpacing: currentTheme.typography.trackingNormal }}
            >
              Sample text with letter spacing: {currentTheme.typography.trackingNormal}
            </div>
          </div>
        </div>
      </div>

      {/* Shadows */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Box Shadows</h3>
        </div>
        
        <div className="space-y-3">
          {shadowOptions.map((shadow) => (
            <div key={shadow.key} className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                {shadow.label}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={currentTheme.shadows[shadow.key as keyof typeof currentTheme.shadows]}
                  onChange={(e) => onShadowChange(shadow.key, e.target.value)}
                  className="flex-1 px-2 py-1 text-xs border border-input rounded bg-background font-mono"
                  placeholder="box-shadow value"
                />
                <div 
                  className="w-8 h-8 bg-card border border-border rounded"
                  style={{ 
                    boxShadow: currentTheme.shadows[shadow.key as keyof typeof currentTheme.shadows] 
                  }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Properties */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Type className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Custom Font Input</h3>
        </div>
        
        <div className="space-y-3">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Custom Sans-serif
            </label>
            <input
              type="text"
              value={currentTheme.fonts.sans}
              onChange={(e) => onFontChange('sans', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background font-mono"
              placeholder="Custom font family, fallback, sans-serif"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Custom Serif
            </label>
            <input
              type="text"
              value={currentTheme.fonts.serif}
              onChange={(e) => onFontChange('serif', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background font-mono"
              placeholder="Custom serif font, fallback, serif"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              Custom Monospace
            </label>
            <input
              type="text"
              value={currentTheme.fonts.mono}
              onChange={(e) => onFontChange('mono', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background font-mono"
              placeholder="Custom mono font, fallback, monospace"
            />
          </div>
        </div>
      </div>
    </div>
  );
};