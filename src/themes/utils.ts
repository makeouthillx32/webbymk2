// themes/utils.ts
import { ThemeFonts, ThemeRadii, ThemeShadows, ThemeTypography } from "@/types/theme";

/**
 * Utility functions for theme manipulation
 * No default values defined here - they belong in themes/default.ts
 */

// Font utilities
export const getFontVariables = (fonts: ThemeFonts): Record<string, string> => {
  return {
    '--font-sans': fonts.sans,
    '--font-serif': fonts.serif,
    '--font-mono': fonts.mono,
  };
};

// Border radius utilities
export const getRadiiVariables = (radii: ThemeRadii): Record<string, string> => {
  return {
    '--radius': radii.radius,
    // Add computed radius variants
    '--radius-sm': `calc(${radii.radius} - 4px)`,
    '--radius-md': `calc(${radii.radius} - 2px)`,
    '--radius-lg': radii.radius,
    '--radius-xl': `calc(${radii.radius} + 4px)`,
    '--radius-2xl': `calc(${radii.radius} + 8px)`,
    '--radius-full': '9999px',
  };
};

// Shadow utilities
export const getShadowVariables = (shadows: ThemeShadows): Record<string, string> => {
  return {
    '--shadow-2xs': shadows.shadow2xs,
    '--shadow-xs': shadows.shadowXs,
    '--shadow-sm': shadows.shadowSm,
    '--shadow': shadows.shadow,
    '--shadow-md': shadows.shadowMd,
    '--shadow-lg': shadows.shadowLg,
    '--shadow-xl': shadows.shadowXl,
    '--shadow-2xl': shadows.shadow2xl,
  };
};

// Typography utilities
export const getTypographyVariables = (typography?: ThemeTypography): Record<string, string> => {
  if (!typography) return {};
  
  const variables: Record<string, string> = {};
  
  if (typography.trackingNormal) {
    const baseSpacing = typography.trackingNormal;
    variables['--tracking-normal'] = baseSpacing;
    
    // Add computed tracking variants
    variables['--tracking-tighter'] = `calc(${baseSpacing} - 0.05em)`;
    variables['--tracking-tight'] = `calc(${baseSpacing} - 0.025em)`;
    variables['--tracking-wide'] = `calc(${baseSpacing} + 0.025em)`;
    variables['--tracking-wider'] = `calc(${baseSpacing} + 0.05em)`;
    variables['--tracking-widest'] = `calc(${baseSpacing} + 0.1em)`;
  }
  
  return variables;
};

// Generate color variable names from theme color object
export const getColorVariables = (prefix: string = ''): string[] => {
  return [
    'background',
    'foreground',
    'card',
    'card-foreground',
    'popover',
    'popover-foreground',
    'primary',
    'primary-foreground',
    'secondary',
    'secondary-foreground',
    'muted',
    'muted-foreground',
    'accent',
    'accent-foreground',
    'destructive',
    'destructive-foreground',
    'border',
    'input',
    'ring',
    'chart-1',
    'chart-2',
    'chart-3',
    'chart-4',
    'chart-5',
    'sidebar',
    'sidebar-foreground',
    'sidebar-primary',
    'sidebar-primary-foreground',
    'sidebar-accent',
    'sidebar-accent-foreground',
    'sidebar-border',
    'sidebar-ring',
  ].map(name => prefix ? `${prefix}-${name}` : name);
};

// Combine all theme variables
export const getAllThemeVariables = (
  fonts: ThemeFonts,
  radii: ThemeRadii,
  shadows: ThemeShadows,
  typography?: ThemeTypography
): Record<string, string> => {
  return {
    ...getFontVariables(fonts),
    ...getRadiiVariables(radii),
    ...getShadowVariables(shadows),
    ...getTypographyVariables(typography),
  };
};

// Helper to create HSL string
export const hsl = (h: number, s: number, l: number): string => {
  return `${h} ${s}% ${l}%`;
};

// Helper to convert hex to HSL
export const hexToHSL = (hex: string): string => {
  // Remove # if present
  hex = hex.replace(/^#/, '');
  
  // Parse hex
  let r = 0, g = 0, b = 0;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  }
  
  // Convert to HSL
  r /= 255;
  g /= 255;
  b /= 255;
  
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
    
    h *= 60;
  }
  
  // Return HSL string in the format used by CSS variables
  return `${h.toFixed(2)} ${(s * 100).toFixed(2)}% ${(l * 100).toFixed(2)}%`;
};

// Create a helper to easily combine theme variables
export const createThemeVariables = (theme: Partial<Record<string, string>>): Record<string, string> => {
  const result: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(theme)) {
    // Add the -- prefix if not present
    const varName = key.startsWith('--') ? key : `--${key}`;
    result[varName] = value;
  }
  
  return result;
};

// Helper to extract HSL components for manipulation
export const parseHSL = (hslString: string): { h: number, s: number, l: number } => {
  const parts = hslString.trim().split(' ');
  if (parts.length !== 3) {
    throw new Error(`Invalid HSL string: ${hslString}`);
  }
  
  return {
    h: parseFloat(parts[0]),
    s: parseFloat(parts[1].replace('%', '')),
    l: parseFloat(parts[2].replace('%', ''))
  };
};

// Create variations of a base color (lighter/darker)
export const createColorVariations = (baseHSL: string, name: string): Record<string, string> => {
  const { h, s, l } = parseHSL(baseHSL);
  
  return {
    [`--${name}-50`]: hsl(h, Math.max(0, s - 20), Math.min(95, l + 25)),
    [`--${name}-100`]: hsl(h, Math.max(0, s - 15), Math.min(90, l + 20)),
    [`--${name}-200`]: hsl(h, Math.max(0, s - 10), Math.min(85, l + 15)),
    [`--${name}-300`]: hsl(h, Math.max(0, s - 5), Math.min(80, l + 10)),
    [`--${name}-400`]: hsl(h, s, Math.min(75, l + 5)),
    [`--${name}-500`]: baseHSL,
    [`--${name}-600`]: hsl(h, Math.min(100, s + 5), Math.max(20, l - 5)),
    [`--${name}-700`]: hsl(h, Math.min(100, s + 10), Math.max(15, l - 10)),
    [`--${name}-800`]: hsl(h, Math.min(100, s + 15), Math.max(10, l - 15)),
    [`--${name}-900`]: hsl(h, Math.min(100, s + 20), Math.max(5, l - 20)),
    [`--${name}-950`]: hsl(h, Math.min(100, s + 25), Math.max(5, l - 25)),
  };
};