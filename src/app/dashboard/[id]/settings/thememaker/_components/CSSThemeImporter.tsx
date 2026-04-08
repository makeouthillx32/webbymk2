"use client";

import React, { useState } from 'react';
import { Upload, FileText, X } from 'lucide-react';

interface CSSThemeImporterProps {
  onImportTheme: (themeData: any) => void;
  onClose: () => void;
}

export const CSSThemeImporter: React.FC<CSSThemeImporterProps> = ({
  onImportTheme,
  onClose
}) => {
  const [cssInput, setCssInput] = useState('');
  const [themeName, setThemeName] = useState('');
  const [themeDescription, setThemeDescription] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');

  // Parse CSS custom properties
  const parseCSSTheme = (cssText: string) => {
    const lightVars: Record<string, string> = {};
    const darkVars: Record<string, string> = {};
    const fonts = { sans: 'Inter, sans-serif', serif: 'Georgia, serif', mono: 'Monaco, monospace' };
    const radii = { radius: '0.5rem' };
    const shadows = {
      shadow2xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      shadowXs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      shadowSm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
      shadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
      shadowMd: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      shadowLg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      shadowXl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      shadow2xl: '0 25px 50px -12px rgb(0 0 0 / 0.25)'
    };
    const typography = { trackingNormal: '0px' };

    // Split CSS into sections
    const rootMatch = cssText.match(/:root\s*\{([^}]+)\}/);
    const darkMatch = cssText.match(/\.dark\s*\{([^}]+)\}/);

    // Parse :root (light mode) variables
    if (rootMatch) {
      const rootContent = rootMatch[1];
      const variables = rootContent.match(/--[\w-]+:\s*[^;]+/g);
      
      if (variables) {
        variables.forEach(variable => {
          const [key, value] = variable.split(':').map(s => s.trim());
          const cleanKey = key.startsWith('--') ? key : `--${key}`;
          const cleanValue = value.replace(/;$/, '').trim();

          // Handle different variable types
          if (cleanKey === '--font-sans') {
            fonts.sans = cleanValue;
          } else if (cleanKey === '--font-serif') {
            fonts.serif = cleanValue;
          } else if (cleanKey === '--font-mono') {
            fonts.mono = cleanValue;
          } else if (cleanKey === '--radius') {
            radii.radius = cleanValue;
          } else if (cleanKey === '--tracking-normal') {
            typography.trackingNormal = cleanValue;
          } else if (cleanKey.startsWith('--shadow')) {
            const shadowKey = cleanKey.replace('--shadow-', '').replace('--shadow', 'shadow');
            const shadowMapKey = shadowKey === 'shadow' ? 'shadow' : 
                               shadowKey === '2xs' ? 'shadow2xs' :
                               shadowKey === 'xs' ? 'shadowXs' :
                               shadowKey === 'sm' ? 'shadowSm' :
                               shadowKey === 'md' ? 'shadowMd' :
                               shadowKey === 'lg' ? 'shadowLg' :
                               shadowKey === 'xl' ? 'shadowXl' :
                               shadowKey === '2xl' ? 'shadow2xl' : shadowKey;
            if (shadowMapKey in shadows) {
              shadows[shadowMapKey as keyof typeof shadows] = cleanValue;
            }
          } else if (cleanKey.startsWith('--') && !cleanKey.startsWith('--spacing')) {
            // Store color and other CSS variables
            lightVars[cleanKey] = cleanValue;
          }
        });
      }
    }

    // Parse .dark variables
    if (darkMatch) {
      const darkContent = darkMatch[1];
      const variables = darkContent.match(/--[\w-]+:\s*[^;]+/g);
      
      if (variables) {
        variables.forEach(variable => {
          const [key, value] = variable.split(':').map(s => s.trim());
          const cleanKey = key.startsWith('--') ? key : `--${key}`;
          const cleanValue = value.replace(/;$/, '').trim();

          // Only store color variables for dark mode (fonts, radius, etc. are same as light)
          if (cleanKey.startsWith('--') && 
              !cleanKey.startsWith('--font') && 
              !cleanKey.startsWith('--radius') && 
              !cleanKey.startsWith('--shadow') && 
              !cleanKey.startsWith('--tracking') &&
              !cleanKey.startsWith('--spacing')) {
            darkVars[cleanKey] = cleanValue;
          }
        });
      }
    }

    return {
      light: lightVars,
      dark: Object.keys(darkVars).length > 0 ? darkVars : lightVars, // Fallback to light if no dark
      fonts,
      radii,
      shadows,
      typography
    };
  };

  const handleImport = () => {
    if (!cssInput.trim()) {
      setError('Please paste your CSS theme variables');
      return;
    }

    if (!themeName.trim()) {
      setError('Please enter a theme name');
      return;
    }

    setParsing(true);
    setError('');

    try {
      const parsed = parseCSSTheme(cssInput);
      
      // Validate that we got some variables
      if (Object.keys(parsed.light).length === 0) {
        throw new Error('No valid CSS custom properties found. Make sure your CSS includes :root { --variable: value; } format.');
      }

      // Create theme object
      const themeData = {
        id: themeName.toLowerCase().replace(/\s+/g, '-'),
        name: themeName,
        description: themeDescription || `Imported theme: ${themeName}`,
        previewColor: '#3b82f6', // Default preview color
        ...parsed
      };

      onImportTheme(themeData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse CSS theme');
    } finally {
      setParsing(false);
    }
  };

  const handleClear = () => {
    setCssInput('');
    setThemeName('');
    setThemeDescription('');
    setError('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 pt-[70px]">
      <div className="w-full max-w-2xl max-h-[calc(100vh-70px-2rem)] mx-auto bg-card border border-border rounded-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Import CSS Theme</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md hover:bg-muted transition-colors flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Theme Info */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Theme Name *
              </label>
              <input
                type="text"
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
                placeholder="My Custom Theme"
                className="w-full px-3 py-2 border border-input rounded-md bg-background mt-1"
              />
            </div>
            
            <div>
              <label className="text-sm font-medium text-muted-foreground">
                Description (Optional)
              </label>
              <input
                type="text"
                value={themeDescription}
                onChange={(e) => setThemeDescription(e.target.value)}
                placeholder="A beautiful custom theme"
                className="w-full px-3 py-2 border border-input rounded-md bg-background mt-1"
              />
            </div>
          </div>

          {/* CSS Input */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              CSS Custom Properties *
            </label>
            <p className="text-xs text-muted-foreground mt-1 mb-2">
              Paste your CSS with :root and .dark selectors containing --variable: value; declarations
            </p>
            <textarea
              value={cssInput}
              onChange={(e) => setCssInput(e.target.value)}
              placeholder={`:root {
  --background: 330 47.0588% 93.3333%;
  --foreground: 0 0% 35.6863%;
  --primary: 325.5814 57.8475% 56.2745%;
  --font-sans: Poppins, sans-serif;
  --radius: 0.4rem;
  /* ... more variables ... */
}

.dark {
  --background: 201.4286 43.7500% 12.5490%;
  --foreground: 333.7500 40.0000% 92.1569%;
  /* ... dark mode variables ... */
}`}
              className="w-full h-64 px-3 py-2 border border-input rounded-md bg-background font-mono text-sm resize-none"
            />
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Instructions */}
          <div className="p-3 bg-muted/50 rounded-md">
            <h4 className="text-sm font-medium mb-2">Instructions:</h4>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>• Paste CSS containing :root and .dark selectors</li>
              <li>• Variables should follow --variable-name: value; format</li>
              <li>• Include color variables like --primary, --background, etc.</li>
              <li>• Font variables: --font-sans, --font-serif, --font-mono</li>
              <li>• Other: --radius, --shadow-*, --tracking-normal</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border flex-shrink-0">
          <button
            onClick={handleClear}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear All
          </button>
          
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={parsing || !cssInput.trim() || !themeName.trim()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {parsing ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Import Theme
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};