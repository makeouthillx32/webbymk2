// app/dashboard/[id]/settings/thememaker/page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Eye, ArrowLeft } from 'lucide-react';
import Breadcrumb from "@/components/Breadcrumbs/dashboard";

// Import components - Fixed to match your actual file names
import { ThemeHeader } from './_components/Header';
import { ThemeForm } from './_components/ThemeForm';
import { ColorPicker } from './_components/ColorPicker';
import { FontControls } from './_components/FontControls';
import { ThemePreview } from './_components/ThemePreview';
import { ThemeCreatorSkeleton } from './_components/ThemeCreatorSkeleton';

// Create Supabase client
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ThemeCreator = () => {
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
    shadows: {
      shadow2xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      shadowXs: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      shadowSm: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
      shadow: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
      shadowMd: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      shadowLg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      shadowXl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      shadow2xl: '0 25px 50px -12px rgb(0 0 0 / 0.25)'
    },
    typography: { trackingNormal: '0px' }
  });
  
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['primary-colors', 'secondary-colors'])
  );
  const [saving, setSaving] = useState(false);
  const [existingThemes, setExistingThemes] = useState<any[]>([]);
  const [showPresets, setShowPresets] = useState(false);
  const [activeTab, setActiveTab] = useState<'colors' | 'fonts'>('colors');
  const [loading, setLoading] = useState(true);
  
  // Mobile-specific states
  const [showPreview, setShowPreview] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
      } finally {
        // Simulate loading time for better UX
        setTimeout(() => setLoading(false), 1000);
      }
    };
    
    loadThemes();
  }, []);

  // Theme update handlers
  const handleThemeChange = (updates: Partial<typeof currentTheme>) => {
    setCurrentTheme(prev => ({ ...prev, ...updates }));
  };

  const handleColorUpdate = (key: string, value: string) => {
    setCurrentTheme(prev => ({
      ...prev,
      [mode]: {
        ...prev[mode],
        [key]: value
      }
    }));
  };

  const handleFontChange = (fontType: 'sans' | 'serif' | 'mono', value: string) => {
    setCurrentTheme(prev => ({
      ...prev,
      fonts: {
        ...prev.fonts,
        [fontType]: value
      }
    }));
  };

  const handleRadiusChange = (value: string) => {
    setCurrentTheme(prev => ({
      ...prev,
      radii: { radius: value }
    }));
  };

  const handleShadowChange = (shadowType: string, value: string) => {
    setCurrentTheme(prev => ({
      ...prev,
      shadows: {
        ...prev.shadows,
        [shadowType]: value
      }
    }));
  };

  const handleTypographyChange = (property: string, value: string) => {
    setCurrentTheme(prev => ({
      ...prev,
      typography: {
        ...prev.typography,
        [property]: value
      }
    }));
  };

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  // Save theme with better UX feedback
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

  // Export theme
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

  // Import theme from CSS
  const importTheme = (themeData: any) => {
    try {
      setCurrentTheme({
        id: themeData.id || '',
        name: themeData.name,
        description: themeData.description || '',
        previewColor: themeData.previewColor || '#3b82f6',
        light: themeData.light || {},
        dark: themeData.dark || {},
        fonts: themeData.fonts || {
          sans: 'Inter, sans-serif',
          serif: 'Georgia, serif',
          mono: 'Monaco, monospace'
        },
        radii: themeData.radii || { radius: '0.5rem' },
        shadows: themeData.shadows || currentTheme.shadows,
        typography: themeData.typography || { trackingNormal: '0px' }
      });

      alert('Theme imported successfully from CSS!');
    } catch (error) {
      console.error('Error importing theme:', error);
      alert('Failed to import theme');
    }
  };

  // Load existing theme
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
        shadows: themeData.shadows || currentTheme.shadows,
        typography: themeData.typography || { trackingNormal: '0px' }
      });

      setShowPresets(false);
      alert(`Loaded theme: ${themeData.name}`);
    } catch (error) {
      console.error('Error loading theme:', error);
      alert('Failed to load theme');
    }
  };

  // Show loading skeleton
  if (loading) {
    return <ThemeCreatorSkeleton />;
  }

  // Mobile Preview - Now working properly
  if (isMobile && showPreview) {
    return (
      <>
        <Breadcrumb pageName="Theme Creator" />
        <div className="space-y-6">
          {/* Theme Editor */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <ThemeHeader
              currentTheme={currentTheme}
              showPresets={showPresets}
              setShowPresets={setShowPresets}
              onImportTheme={importTheme}
              onExportTheme={exportTheme}
              existingThemes={existingThemes}
              onLoadTheme={loadExistingTheme}
            />

            <div className="px-4 pb-4 border-b border-border">
              <ThemeForm
                currentTheme={currentTheme}
                onThemeChange={handleThemeChange}
                mode={mode}
                onModeChange={setMode}
                onSaveTheme={saveTheme}
                saving={saving}
              />
            </div>

            <div className="flex border-b border-border">
              <button
                onClick={() => setActiveTab('colors')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                  activeTab === 'colors' 
                    ? 'bg-background text-foreground border-b-2 border-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Colors
              </button>
              <button
                onClick={() => setActiveTab('fonts')}
                className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                  activeTab === 'fonts' 
                    ? 'bg-background text-foreground border-b-2 border-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Fonts & Style
              </button>
            </div>

            <div className="p-4">
              {activeTab === 'colors' ? (
                <ColorPicker
                  mode={mode}
                  currentTheme={currentTheme}
                  expandedSections={expandedSections}
                  onToggleSection={toggleSection}
                  onUpdateColor={handleColorUpdate}
                />
              ) : (
                <FontControls
                  currentTheme={currentTheme}
                  onFontChange={handleFontChange}
                  onRadiusChange={handleRadiusChange}
                  onShadowChange={handleShadowChange}
                  onTypographyChange={handleTypographyChange}
                />
              )}
            </div>

            {/* Mobile Preview Toggle */}
            <div className="p-4 border-t border-border">
              <button
                onClick={() => setShowPreview(false)}
                className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Editor
              </button>
            </div>
          </div>

          {/* Live Preview Section */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold">Live Preview</h2>
              <p className="text-sm text-muted-foreground">See how your theme looks in real-time</p>
            </div>
            <ThemePreview currentTheme={currentTheme} mode={mode} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Breadcrumb pageName="Theme Creator" />
      <div className={`${isMobile ? 'flex flex-col min-h-0' : 'flex h-[calc(100vh-8rem)]'} bg-background`}>
      {/* Theme Creator Panel - Full width on mobile */}
      <div className={`${isMobile ? 'w-full' : 'w-80'} border-r border-border bg-card overflow-hidden flex flex-col`}>
        {/* Header */}
        <ThemeHeader
          currentTheme={currentTheme}
          showPresets={showPresets}
          setShowPresets={setShowPresets}
          onImportTheme={importTheme}
          onExportTheme={exportTheme}
          existingThemes={existingThemes}
          onLoadTheme={loadExistingTheme}
        />

        {/* Theme Form */}
        <div className="px-4 pb-4 border-b border-border">
          <ThemeForm
            currentTheme={currentTheme}
            onThemeChange={handleThemeChange}
            mode={mode}
            onModeChange={setMode}
            onSaveTheme={saveTheme}
            saving={saving}
          />
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab('colors')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              activeTab === 'colors' 
                ? 'bg-background text-foreground border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Colors
          </button>
          <button
            onClick={() => setActiveTab('fonts')}
            className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
              activeTab === 'fonts' 
                ? 'bg-background text-foreground border-b-2 border-primary' 
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Fonts & Style
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            {activeTab === 'colors' ? (
              <ColorPicker
                mode={mode}
                currentTheme={currentTheme}
                expandedSections={expandedSections}
                onToggleSection={toggleSection}
                onUpdateColor={handleColorUpdate}
              />
            ) : (
              <FontControls
                currentTheme={currentTheme}
                onFontChange={handleFontChange}
                onRadiusChange={handleRadiusChange}
                onShadowChange={handleShadowChange}
                onTypographyChange={handleTypographyChange}
              />
            )}
          </div>
        </div>
      </div>

      {/* Desktop Preview Area */}
      {!isMobile && (
        <ThemePreview currentTheme={currentTheme} mode={mode} />
      )}

      {/* Mobile Preview Floating Button - Overlay */}
      {isMobile && !showPreview && (
        <button
          onClick={() => setShowPreview(true)}
          className="fixed bottom-6 left-6 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors z-40"
          aria-label="Show Preview"
        >
          <Eye className="w-6 h-6" />
        </button>
      )}

      {/* Mobile Inline Preview - NOT an overlay */}
      {isMobile && showPreview && (
        <div className="mt-6 bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Live Preview</h2>
            <button
              onClick={() => setShowPreview(false)}
              className="px-3 py-1 text-sm border border-border rounded-md hover:bg-muted transition-colors"
            >
              Hide Preview
            </button>
          </div>
          <ThemePreview currentTheme={currentTheme} mode={mode} />
        </div>
      )}
    </div>
    </>
  );
};

export default ThemeCreator;