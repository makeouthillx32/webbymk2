'use client';

import React, { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { ChevronDown, Save, Download, Upload, Palette } from 'lucide-react';

// Create Supabase client
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface ColorGroup {
  title: string;
  id: string;
  colors: Array<{
    key: string;
    label: string;
    value: string;
  }>;
  expanded?: boolean;
}

const DatabaseThemeCreator = () => {
  const [currentTheme, setCurrentTheme] = useState({
    id: '',
    name: '',
    description: '',
    previewColor: '#3b82f6',
    light: {} as Record<string, string>,
    dark: {} as Record<string, string>,
    fonts: {
      sans: 'Inter, sans-serif',
      serif: 'Georgia, serif', 
      mono: 'Monaco, monospace'
    },
    radii: { radius: '0.5rem' },
    shadows: {},
    typography: { trackingNormal: '0px' }
  });
  
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['primary-colors', 'secondary-colors'])
  );
  const [saving, setSaving] = useState(false);
  const [existingThemes, setExistingThemes] = useState<any[]>([]);
  const [showPresets, setShowPresets] = useState(false);

  // Color groups matching your screenshot structure
  const colorGroups: ColorGroup[] = [
    {
      title: 'Primary Colors',
      id: 'primary-colors',
      expanded: true,
      colors: [
        { key: '--primary', label: 'Primary', value: currentTheme[mode]['--primary'] || '220 14.3% 95.9%' },
        { key: '--primary-foreground', label: 'Primary Foreground', value: currentTheme[mode]['--primary-foreground'] || '220.9 39.3% 11%' }
      ]
    },
    {
      title: 'Secondary Colors', 
      id: 'secondary-colors',
      expanded: true,
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
      title: 'Base Colors',
      id: 'base-colors',
      colors: [
        { key: '--background', label: 'Background', value: currentTheme[mode]['--background'] || '0 0% 100%' },
        { key: '--foreground', label: 'Foreground', value: currentTheme[mode]['--foreground'] || '222.2 84% 4.9%' }
      ]
    },
    {
      title: 'Card Colors',
      id: 'card-colors',
      colors: [
        { key: '--card', label: 'Card', value: currentTheme[mode]['--card'] || '0 0% 100%' },
        { key: '--card-foreground', label: 'Card Foreground', value: currentTheme[mode]['--card-foreground'] || '222.2 84% 4.9%' }
      ]
    },
    {
      title: 'Popover Colors',
      id: 'popover-colors',
      colors: [
        { key: '--popover', label: 'Popover', value: currentTheme[mode]['--popover'] || '0 0% 100%' },
        { key: '--popover-foreground', label: 'Popover Foreground', value: currentTheme[mode]['--popover-foreground'] || '222.2 84% 4.9%' }
      ]
    },
    {
      title: 'Muted Colors',
      id: 'muted-colors',
      colors: [
        { key: '--muted', label: 'Muted', value: currentTheme[mode]['--muted'] || '210 40% 96%' },
        { key: '--muted-foreground', label: 'Muted Foreground', value: currentTheme[mode]['--muted-foreground'] || '215.4 16.3% 46.9%' }
      ]
    },
    {
      title: 'Destructive Colors',
      id: 'destructive-colors',
      colors: [
        { key: '--destructive', label: 'Destructive', value: currentTheme[mode]['--destructive'] || '0 84.2% 60.2%' },
        { key: '--destructive-foreground', label: 'Destructive Foreground', value: currentTheme[mode]['--destructive-foreground'] || '210 40% 98%' }
      ]
    },
    {
      title: 'Border & Input Colors',
      id: 'border-input-colors',
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

  // Load existing themes
  useEffect(() => {
    const loadThemes = async () => {
      try {
        const { data, error } = await supabase
          .from('themes')
          .select('id, name, description')
          .order('created_at', { ascending: false });
        
        if (!error && data) {
          setExistingThemes(data);
        }
      } catch (error) {
        console.error('Error loading themes:', error);
      }
    };
    
    loadThemes();
  }, []);

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const updateColor = (key: string, value: string) => {
    setCurrentTheme(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        [key]: value
      }
    }));
  };

  const hslToHex = (hsl: string): string => {
    // Simple conversion - you might want a more robust version
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

  const saveTheme = async () => {
    if (!currentTheme.name.trim()) {
      alert('Please enter a theme name');
      return;
    }

    setSaving(true);
    try {
      const themeData = {
        id: currentTheme.id || currentTheme.name.toLowerCase().replace(/\s+/g, '-'),
        name: currentTheme.name,
        description: currentTheme.description,
        previewColor: currentTheme.previewColor,
        fonts: currentTheme.fonts,
        radii: currentTheme.radii,
        shadows: currentTheme.shadows,
        typography: currentTheme.typography,
        light: {
          ...currentTheme.light,
          '--font-sans': currentTheme.fonts.sans,
          '--font-serif': currentTheme.fonts.serif,
          '--font-mono': currentTheme.fonts.mono,
          '--radius': currentTheme.radii.radius,
          '--tracking-normal': currentTheme.typography.trackingNormal
        },
        dark: {
          ...currentTheme.dark,
          '--font-sans': currentTheme.fonts.sans,
          '--font-serif': currentTheme.fonts.serif,
          '--font-mono': currentTheme.fonts.mono,
          '--radius': currentTheme.radii.radius,
          '--tracking-normal': currentTheme.typography.trackingNormal
        }
      };

      const { error } = await supabase
        .from('themes')
        .upsert({
          id: themeData.id,
          name: themeData.name,
          description: themeData.description,
          preview_color: themeData.previewColor,
          theme_data: themeData,
          is_system: false,
          tags: ['custom', 'user-created']
        });

      if (error) throw error;
      
      alert('Theme saved successfully!');
      
      // Reload themes list
      const { data } = await supabase
        .from('themes')
        .select('id, name, description')
        .order('created_at', { ascending: false });
      
      if (data) setExistingThemes(data);
      
    } catch (error) {
      console.error('Error saving theme:', error);
      alert('Failed to save theme');
    } finally {
      setSaving(false);
    }
  };

  const exportTheme = () => {
    const themeData = {
      id: currentTheme.id || currentTheme.name.toLowerCase().replace(/\s+/g, '-'),
      name: currentTheme.name,
      description: currentTheme.description,
      previewColor: currentTheme.previewColor,
      fonts: currentTheme.fonts,
      radii: currentTheme.radii,
      shadows: currentTheme.shadows,
      typography: currentTheme.typography,
      light: {
        ...currentTheme.light,
        '--font-sans': currentTheme.fonts.sans,
        '--font-serif': currentTheme.fonts.serif,
        '--font-mono': currentTheme.fonts.mono,
        '--radius': currentTheme.radii.radius,
        '--tracking-normal': currentTheme.typography.trackingNormal
      },
      dark: {
        ...currentTheme.dark,
        '--font-sans': currentTheme.fonts.sans,
        '--font-serif': currentTheme.fonts.serif,
        '--font-mono': currentTheme.fonts.mono,
        '--radius': currentTheme.radii.radius,
        '--tracking-normal': currentTheme.typography.trackingNormal
      }
    };

    const blob = new Blob([JSON.stringify(themeData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${themeData.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importTheme = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        
        // Validate the imported theme has required properties
        if (!imported.name || !imported.light || !imported.dark) {
          alert('Invalid theme file - missing required properties');
          return;
        }

        setCurrentTheme({
          id: imported.id || '',
          name: imported.name,
          description: imported.description || '',
          previewColor: imported.previewColor || '#3b82f6',
          light: imported.light || {},
          dark: imported.dark || {},
          fonts: imported.fonts || {
            sans: 'Inter, sans-serif',
            serif: 'Georgia, serif',
            mono: 'Monaco, monospace'
          },
          radii: imported.radii || { radius: '0.5rem' },
          shadows: imported.shadows || {},
          typography: imported.typography || { trackingNormal: '0px' }
        });

        alert('Theme imported successfully!');
      } catch (error) {
        console.error('Error importing theme:', error);
        alert('Failed to import theme - invalid JSON file');
      }
    };
    reader.readAsText(file);
    
    // Reset the input
    event.target.value = '';
  };

  const loadExistingTheme = async (themeId: string) => {
    try {
      const { data, error } = await supabase
        .from('themes')
        .select('*')
        .eq('id', themeId)
        .single();

      if (error) throw error;

      const themeData = data.theme_data;
      setCurrentTheme({
        id: themeData.id,
        name: themeData.name,
        description: themeData.description || '',
        previewColor: data.preview_color || '#3b82f6',
        light: themeData.light || {},
        dark: themeData.dark || {},
        fonts: themeData.fonts || {
          sans: 'Inter, sans-serif',
          serif: 'Georgia, serif',
          mono: 'Monaco, monospace'
        },
        radii: themeData.radii || { radius: '0.5rem' },
        shadows: themeData.shadows || {},
        typography: themeData.typography || { trackingNormal: '0px' }
      });

      setShowPresets(false);
      alert(`Loaded theme: ${themeData.name}`);
    } catch (error) {
      console.error('Error loading theme:', error);
      alert('Failed to load theme');
    }
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Theme Creator Panel */}
      <div className="w-80 border-r border-border bg-card overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Theme Creator</h1>
          </div>
          
          {/* Import/Export/Load Controls */}
          <div className="flex gap-2 mb-4">
            <input
              type="file"
              accept=".json"
              onChange={importTheme}
              className="hidden"
              id="theme-import"
            />
            <label
              htmlFor="theme-import"
              className="flex-1 py-2 px-3 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 cursor-pointer flex items-center justify-center gap-2 text-sm"
            >
              <Upload className="w-4 h-4" />
              Import
            </label>
            
            <button
              onClick={exportTheme}
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
                  <div className="text-xs text-muted-foreground text-center py-2">
                    No saved themes found
                  </div>
                ) : (
                  existingThemes.map((theme) => (
                    <button
                      key={theme.id}
                      onClick={() => loadExistingTheme(theme.id)}
                      className="w-full text-left p-2 hover:bg-accent hover:text-accent-foreground rounded text-xs transition-colors"
                    >
                      <div className="font-medium">{theme.name}</div>
                      {theme.description && (
                        <div className="text-muted-foreground truncate">{theme.description}</div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
          
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Theme Name"
              value={currentTheme.name}
              onChange={(e) => setCurrentTheme(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-3 py-2 border border-input rounded-md bg-background"
            />
            <input
              type="text"
              placeholder="Description"
              value={currentTheme.description}
              onChange={(e) => setCurrentTheme(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-input rounded-md bg-background"
            />
            
            {/* Mode Toggle */}
            <div className="flex rounded-lg bg-muted p-1">
              <button
                onClick={() => setMode('light')}
                className={`flex-1 py-1 px-3 text-sm rounded-md transition-colors ${
                  mode === 'light' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Light
              </button>
              <button
                onClick={() => setMode('dark')}
                className={`flex-1 py-1 px-3 text-sm rounded-md transition-colors ${
                  mode === 'dark' ? 'bg-background shadow-sm' : 'text-muted-foreground'
                }`}
              >
                Dark
              </button>
            </div>
          </div>
        </div>

        {/* Color Controls */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">
            {colorGroups.map((group) => (
              <div key={group.id} className="border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleSection(group.id)}
                  className="w-full px-4 py-3 bg-muted/50 flex items-center justify-between hover:bg-muted/70 transition-colors"
                >
                  <span className="font-medium text-sm">{group.title}</span>
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
                            className="w-8 h-8 rounded border border-border cursor-pointer"
                            style={{ backgroundColor: hslToHex(color.value) }}
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'color';
                              input.value = hslToHex(color.value);
                              input.onchange = (e) => {
                                // Convert hex back to HSL - simplified
                                updateColor(color.key, color.value);
                              };
                              input.click();
                            }}
                          />
                          <input
                            type="text"
                            value={color.value}
                            onChange={(e) => updateColor(color.key, e.target.value)}
                            className="flex-1 px-2 py-1 text-xs border border-input rounded bg-background font-mono"
                            placeholder="HSL values"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="p-4 border-t border-border">
          <button
            onClick={saveTheme}
            disabled={saving || !currentTheme.name}
            className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Theme'}
          </button>
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 p-8 overflow-auto">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-6">Theme Preview</h2>
          <div className="text-muted-foreground mb-8">
            Preview your theme in real-time as you make changes
          </div>
          
          {/* Preview Components */}
          <div className="space-y-6">
            <div className="p-6 rounded-lg border border-border bg-card">
              <h3 className="text-lg font-semibold mb-4">Colors Preview</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-primary mx-auto mb-2"></div>
                  <div className="text-xs text-muted-foreground">Primary</div>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-secondary mx-auto mb-2"></div>
                  <div className="text-xs text-muted-foreground">Secondary</div>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-accent mx-auto mb-2"></div>
                  <div className="text-xs text-muted-foreground">Accent</div>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-destructive mx-auto mb-2"></div>
                  <div className="text-xs text-muted-foreground">Destructive</div>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-lg border border-border bg-card">
              <h3 className="text-lg font-semibold mb-4">Typography</h3>
              <div className="space-y-2">
                <p className="font-sans">Sans-serif font example</p>
                <p className="font-serif">Serif font example</p>
                <p className="font-mono text-sm">Monospace font example</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DatabaseThemeCreator;