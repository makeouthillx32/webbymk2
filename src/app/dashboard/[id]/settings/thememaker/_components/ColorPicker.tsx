// app/dashboard/[id]/settings/thememaker/_components/ColorPicker.tsx

"use client";

import React from 'react';
import { ChevronDown } from 'lucide-react';

interface ColorItem {
  key: string;
  label: string;
  value: string;
}

interface ColorGroup {
  title: string;
  id: string;
  colors: ColorItem[];
}

interface ColorPickerProps {
  mode: 'light' | 'dark';
  currentTheme: {
    light: Record<string, string>;
    dark: Record<string, string>;
    [key: string]: any;
  };
  expandedSections: Set<string>;
  onToggleSection: (sectionId: string) => void;
  onUpdateColor: (key: string, value: string) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({
  mode,
  currentTheme,
  expandedSections,
  onToggleSection,
  onUpdateColor
}) => {
  // Helper function to convert HSL to HEX for color input
  const hslToHex = (hsl: string): string => {
    const values = hsl.split(' ').map(v => parseFloat(v.replace('%', '')));
    if (values.length !== 3) return '#3b82f6';
    
    const [h, s, l] = values;
    const c = (1 - Math.abs(2 * l/100 - 1)) * s/100;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l/100 - c/2;
    
    let r = 0, g = 0, b = 0;
    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  // Helper function to convert HEX to HSL
  const hexToHsl = (hex: string): string => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }

    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  const handleColorClick = (colorKey: string, currentValue: string) => {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = hslToHex(currentValue);
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const newHsl = hexToHsl(target.value);
      onUpdateColor(colorKey, newHsl);
    };
    input.click();
  };

  // Color groups configuration
  const colorGroups: ColorGroup[] = [
    {
      title: 'Primary Colors',
      id: 'primary-colors',
      colors: [
        { key: '--primary', label: 'Primary', value: currentTheme[mode]['--primary'] || '220 14.3% 95.9%' },
        { key: '--primary-foreground', label: 'Primary Foreground', value: currentTheme[mode]['--primary-foreground'] || '220.9 39.3% 11%' }
      ]
    },
    {
      title: 'Secondary Colors', 
      id: 'secondary-colors',
      colors: [
        { key: '--secondary', label: 'Secondary', value: currentTheme[mode]['--secondary'] || '220 14.3% 95.9%' },
        { key: '--secondary-foreground', label: 'Secondary Foreground', value: currentTheme[mode]['--secondary-foreground'] || '220.9 39.3% 11%' }
      ]
    },
    {
      title: 'Accent Colors',
      id: 'accent-colors', 
      colors: [
        { key: '--accent', label: 'Accent', value: currentTheme[mode]['--accent'] || '220 14.3% 95.9%' },
        { key: '--accent-foreground', label: 'Accent Foreground', value: currentTheme[mode]['--accent-foreground'] || '220.9 39.3% 11%' }
      ]
    },
    {
      title: 'Background Colors',
      id: 'background-colors',
      colors: [
        { key: '--background', label: 'Background', value: currentTheme[mode]['--background'] || '0 0% 100%' },
        { key: '--foreground', label: 'Foreground', value: currentTheme[mode]['--foreground'] || '222.2 84% 4.9%' },
        { key: '--muted', label: 'Muted', value: currentTheme[mode]['--muted'] || '210 40% 96%' },
        { key: '--muted-foreground', label: 'Muted Foreground', value: currentTheme[mode]['--muted-foreground'] || '215.4 16.3% 46.9%' }
      ]
    },
    {
      title: 'Card Colors',
      id: 'card-colors',
      colors: [
        { key: '--card', label: 'Card', value: currentTheme[mode]['--card'] || '0 0% 100%' },
        { key: '--card-foreground', label: 'Card Foreground', value: currentTheme[mode]['--card-foreground'] || '222.2 84% 4.9%' },
        { key: '--popover', label: 'Popover', value: currentTheme[mode]['--popover'] || '0 0% 100%' },
        { key: '--popover-foreground', label: 'Popover Foreground', value: currentTheme[mode]['--popover-foreground'] || '222.2 84% 4.9%' }
      ]
    },
    {
      title: 'State Colors',
      id: 'state-colors',
      colors: [
        { key: '--destructive', label: 'Destructive', value: currentTheme[mode]['--destructive'] || '0 84.2% 60.2%' },
        { key: '--destructive-foreground', label: 'Destructive Foreground', value: currentTheme[mode]['--destructive-foreground'] || '210 40% 98%' }
      ]
    },
    {
      title: 'Border Colors',
      id: 'border-colors',
      colors: [
        { key: '--border', label: 'Border', value: currentTheme[mode]['--border'] || '214.3 31.8% 91.4%' },
        { key: '--input', label: 'Input', value: currentTheme[mode]['--input'] || '214.3 31.8% 91.4%' },
        { key: '--ring', label: 'Ring', value: currentTheme[mode]['--ring'] || '222.2 84% 4.9%' }
      ]
    },
    {
      title: 'Chart Colors',
      id: 'chart-colors',
      colors: [
        { key: '--chart-1', label: 'Chart 1', value: currentTheme[mode]['--chart-1'] || '12 76% 61%' },
        { key: '--chart-2', label: 'Chart 2', value: currentTheme[mode]['--chart-2'] || '173 58% 39%' },
        { key: '--chart-3', label: 'Chart 3', value: currentTheme[mode]['--chart-3'] || '197 37% 24%' },
        { key: '--chart-4', label: 'Chart 4', value: currentTheme[mode]['--chart-4'] || '43 74% 66%' },
        { key: '--chart-5', label: 'Chart 5', value: currentTheme[mode]['--chart-5'] || '27 87% 67%' }
      ]
    },
    {
      title: 'Sidebar Colors',
      id: 'sidebar-colors',
      colors: [
        { key: '--sidebar', label: 'Sidebar', value: currentTheme[mode]['--sidebar'] || '0 0% 98%' },
        { key: '--sidebar-foreground', label: 'Sidebar Foreground', value: currentTheme[mode]['--sidebar-foreground'] || '240 5.3% 26.1%' },
        { key: '--sidebar-primary', label: 'Sidebar Primary', value: currentTheme[mode]['--sidebar-primary'] || '240 5.9% 10%' },
        { key: '--sidebar-primary-foreground', label: 'Sidebar Primary Foreground', value: currentTheme[mode]['--sidebar-primary-foreground'] || '0 0% 98%' },
        { key: '--sidebar-accent', label: 'Sidebar Accent', value: currentTheme[mode]['--sidebar-accent'] || '240 4.8% 95.9%' },
        { key: '--sidebar-accent-foreground', label: 'Sidebar Accent Foreground', value: currentTheme[mode]['--sidebar-accent-foreground'] || '240 5.9% 10%' },
        { key: '--sidebar-border', label: 'Sidebar Border', value: currentTheme[mode]['--sidebar-border'] || '220 13% 91%' },
        { key: '--sidebar-ring', label: 'Sidebar Ring', value: currentTheme[mode]['--sidebar-ring'] || '217.2 32.6% 17.5%' }
      ]
    }
  ];

  return (
    <div className="space-y-2">
      {colorGroups.map((group) => (
        <div key={group.id} className="border border-border rounded-md overflow-hidden">
          <button
            onClick={() => onToggleSection(group.id)}
            className="w-full p-3 text-left bg-muted/50 hover:bg-muted transition-colors flex items-center justify-between"
          >
            <span className="text-sm font-medium">{group.title}</span>
            <ChevronDown 
              className={`w-4 h-4 transition-transform ${
                expandedSections.has(group.id) ? 'rotate-180' : ''
              }`} 
            />
          </button>
          
          {expandedSections.has(group.id) && (
            <div className="p-4 space-y-3 bg-card">
              {group.colors.map((color) => (
                <div key={color.key} className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {color.label}
                  </label>
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-8 h-8 rounded border border-border cursor-pointer hover:scale-105 transition-transform"
                      style={{ backgroundColor: hslToHex(color.value) }}
                      onClick={() => handleColorClick(color.key, color.value)}
                      title={`Click to change ${color.label}`}
                    />
                    <input
                      type="text"
                      value={color.value}
                      onChange={(e) => onUpdateColor(color.key, e.target.value)}
                      className="flex-1 px-2 py-1 text-xs border border-input rounded bg-background font-mono"
                      placeholder="HSL values (e.g., 220 14.3% 95.9%)"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};