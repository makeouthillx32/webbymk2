"use client";

import React from 'react';
import { Save } from 'lucide-react';

interface ThemeFormProps {
  currentTheme: {
    name: string;
    description: string;
    previewColor: string;
    [key: string]: any;
  };
  onThemeChange: (updates: Partial<typeof currentTheme>) => void;
  mode: 'light' | 'dark';
  onModeChange: (mode: 'light' | 'dark') => void;
  onSaveTheme: () => void;
  saving: boolean;
}

export const ThemeForm: React.FC<ThemeFormProps> = ({
  currentTheme,
  onThemeChange,
  mode,
  onModeChange,
  onSaveTheme,
  saving
}) => {
  const handleInputChange = (field: string, value: string) => {
    onThemeChange({ [field]: value });
  };

  return (
    <div className="space-y-4">
      {/* Theme Name and Description */}
      <div className="space-y-3">
        <input
          type="text"
          placeholder="Theme Name"
          value={currentTheme.name}
          onChange={(e) => handleInputChange('name', e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md bg-background"
        />
        <input
          type="text"
          placeholder="Description"
          value={currentTheme.description}
          onChange={(e) => handleInputChange('description', e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-md bg-background"
        />
        
        {/* Preview Color Picker */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">
            Preview Color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={currentTheme.previewColor}
              onChange={(e) => handleInputChange('previewColor', e.target.value)}
              className="w-8 h-8 rounded border border-border cursor-pointer"
            />
            <input
              type="text"
              value={currentTheme.previewColor}
              onChange={(e) => handleInputChange('previewColor', e.target.value)}
              className="flex-1 px-2 py-1 text-xs border border-input rounded bg-background font-mono"
              placeholder="#000000"
            />
          </div>
        </div>
      </div>
      
      {/* Mode Toggle */}
      <div className="flex rounded-lg bg-muted p-1">
        <button
          onClick={() => onModeChange('light')}
          className={`flex-1 py-1 px-3 text-sm rounded-md transition-colors ${
            mode === 'light' ? 'bg-background shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Light
        </button>
        <button
          onClick={() => onModeChange('dark')}
          className={`flex-1 py-1 px-3 text-sm rounded-md transition-colors ${
            mode === 'dark' ? 'bg-background shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Dark
        </button>
      </div>
      
      {/* Save Button */}
      <div className="pt-4 border-t border-border">
        <button
          onClick={onSaveTheme}
          disabled={saving || !currentTheme.name.trim()}
          className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Theme'}
        </button>
      </div>
    </div>
  );
};