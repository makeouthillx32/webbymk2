// types/theme.ts

// CSS variable names (without the -- prefix)
export interface ThemeCSSVariables {
  // Base colors
  'background': string;
  'foreground': string;
  'card': string;
  'card-foreground': string;
  'popover': string;
  'popover-foreground': string;
  'primary': string;
  'primary-foreground': string;
  'secondary': string;
  'secondary-foreground': string;
  'muted': string;
  'muted-foreground': string;
  'accent': string;
  'accent-foreground': string;
  'destructive': string;
  'destructive-foreground': string;
  'border': string;
  'input': string;
  'ring': string;
  
  // Chart colors
  'chart-1': string;
  'chart-2': string;
  'chart-3': string;
  'chart-4': string;
  'chart-5': string;
  
  // Sidebar
  'sidebar': string;
  'sidebar-foreground': string;
  'sidebar-primary': string;
  'sidebar-primary-foreground': string;
  'sidebar-accent': string;
  'sidebar-accent-foreground': string;
  'sidebar-border': string;
  'sidebar-ring': string;
  
  // Fonts
  'font-sans': string;
  'font-serif': string;
  'font-mono': string;
  
  // Border radius
  'radius': string;
  
  // Shadows
  'shadow-2xs': string;
  'shadow-xs': string;
  'shadow-sm': string;
  'shadow': string;
  'shadow-md': string;
  'shadow-lg': string;
  'shadow-xl': string;
  'shadow-2xl': string;
  
  // Typography
  'tracking-normal': string;
  

  // Allow any other string keys for future extensibility
  [key: string]: string;
}

export interface ThemeFonts {
  sans: string;
  serif: string;
  mono: string;
}

export interface ThemeRadii {
  radius: string;
}

export interface ThemeShadows {
  shadow2xs: string;
  shadowXs: string;
  shadowSm: string;
  shadow: string;
  shadowMd: string;
  shadowLg: string;
  shadowXl: string;
  shadow2xl: string;
}

export interface ThemeTypography {
  trackingNormal?: string;
}

export interface Theme {
  id: string;
  name: string;
  description?: string;
  previewColor: string;
  
  // Define light and dark themes with CSS variable names
  light: Record<string, string>;
  dark: Record<string, string>;
  
  // Component object definitions
  fonts: ThemeFonts;
  radii: ThemeRadii;
  shadows: ThemeShadows;
  typography?: ThemeTypography;
  
  // Metadata
  author?: string;
  version?: string;
}

// For theme editor functionality
export interface ThemeEditorState {
  styles: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}