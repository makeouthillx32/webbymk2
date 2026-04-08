// app/dashboard/[id]/settings/thememaker/_components/Header.tsx

"use client";

import React, { useState } from 'react';
import { Palette, Upload, Download } from 'lucide-react';
import { CSSThemeImporter } from './CSSThemeImporter';

interface ThemeHeaderProps {
  currentTheme: any;
  showPresets: boolean;
  setShowPresets: (show: boolean) => void;
  onImportTheme: (themeData: any) => void;
  onExportTheme: () => void;
  existingThemes: Array<{ id: string; name: string; description?: string }>;
  onLoadTheme: (themeId: string) => void;
}

export const ThemeHeader: React.FC<ThemeHeaderProps> = ({
  currentTheme,
  showPresets,
  setShowPresets,
  onImportTheme,
  onExportTheme,
  existingThemes,
  onLoadTheme
}) => {
  const [showCSSImporter, setShowCSSImporter] = useState(false);

  const handleCSSImport = (themeData: any) => {
    onImportTheme(themeData);
    setShowCSSImporter(false);
  };

  return (
    <div className="p-4 border-b border-border">
      <div className="flex items-center gap-2 mb-4">
        <Palette className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-semibold">Theme Creator</h1>
      </div>
      
      {/* Import/Export/Load Controls */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowCSSImporter(true)}
          className="flex-1 py-2 px-3 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 cursor-pointer flex items-center justify-center gap-2 text-sm"
        >
          <Upload className="w-4 h-4" />
          Import CSS
        </button>
        
        <button
          onClick={onExportTheme}
          disabled={!currentTheme.name}
          className="flex-1 py-2 px-3 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
        
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="flex-1 py-2 px-3 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 flex items-center justify-center gap-2 text-sm"
        >
          <Palette className="w-4 h-4" />
          Load
        </button>
      </div>

      {/* Preset Selector */}
      {showPresets && (
        <div className="mb-4 p-3 border border-border rounded-md bg-muted/20">
          <h3 className="text-sm font-medium mb-2">Load Existing Theme</h3>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {existingThemes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No saved themes found</p>
            ) : (
              existingThemes.map((theme) => (
                <button
                  key={theme.id}
                  onClick={() => onLoadTheme(theme.id)}
                  className="w-full text-left p-2 text-xs rounded border border-border hover:bg-accent/50 transition-colors"
                >
                  <div className="font-medium">{theme.name}</div>
                  {theme.description && (
                    <div className="text-muted-foreground text-xs mt-1">
                      {theme.description}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* CSS Theme Importer - Inline Component */}
      {showCSSImporter && (
        <CSSThemeImporter
          onImportTheme={handleCSSImport}
          onClose={() => setShowCSSImporter(false)}
        />
      )}
    </div>
  );
};