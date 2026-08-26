// themes/tank-green.ts
// ─────────────────────────────────────────────────────────────────────────────
// Official Tank Arcade Green theme.
//
// Matches the chassis background image and provides seamless iOS status bar
// color integration (#637F6D / hsl(141.43 12.39% 44.31%)).
// Light mode and dark mode are intentionally identical for Tank.
// ─────────────────────────────────────────────────────────────────────────────
import type { Theme, ThemeRadii, ThemeShadows } from "@/types/theme";

const defaultRadii: ThemeRadii = {
  radius: "0.5rem",
};

const defaultShadows: ThemeShadows = {
  shadow2xs: "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
  shadowXs: "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
  shadowSm: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
  shadow: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
  shadowMd: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10)",
  shadowLg: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10)",
  shadowXl: "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10)",
  shadow2xl: "0 1px 3px 0px hsl(0 0% 0% / 0.25)",
};

const tankFonts = {
  sans: "Tank Highway Gothic, Plus Jakarta Sans, sans-serif",
  serif: "Source Serif 4, serif",
  mono: "Tank 5x5 Dots, JetBrains Mono, monospace",
};

// #637F6D -> 141.43 12.39% 44.31%
// #789687 -> 150.00 12.50% 52.94%
// #718F7F -> 148.00 11.81% 50.20%
// #708E7F -> 150.00 11.81% 49.80%

const tankGreenVariables: Record<string, string> = {
  "--background": "141.43 12.39% 44.31%", // #637F6D (Tank Base Green)
  "--foreground": "0 0% 95%",
  "--card": "150.00 11.81% 49.80%", // #708E7F (Secondary Card Fill)
  "--card-foreground": "0 0% 95%",
  "--popover": "150.00 11.81% 49.80%",
  "--popover-foreground": "0 0% 95%",
  "--primary": "150.00 12.50% 52.94%", // #789687 (Highlight Accent)
  "--primary-foreground": "0 0% 100%",
  "--secondary": "148.00 11.81% 50.20%", // #718F7F (Midtone Accent)
  "--secondary-foreground": "0 0% 100%",
  "--muted": "141.43 12.39% 36.00%",
  "--muted-foreground": "150.00 12.50% 75.00%",
  "--accent": "150.00 12.50% 52.94%", // #789687
  "--accent-foreground": "0 0% 100%",
  "--destructive": "0 84.24% 60.20%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "150.00 11.81% 49.80%", // #708E7F
  "--input": "141.43 12.39% 32.00%",
  "--ring": "150.00 12.50% 52.94%",
  "--chart-1": "150.00 12.50% 52.94%",
  "--chart-2": "148.00 11.81% 50.20%",
  "--chart-3": "141.43 12.39% 44.31%",
  "--chart-4": "150.00 11.81% 49.80%",
  "--chart-5": "141.43 12.39% 36.00%",
  "--sidebar": "141.43 12.39% 44.31%",
  "--sidebar-foreground": "0 0% 95%",
  "--sidebar-primary": "150.00 12.50% 52.94%",
  "--sidebar-primary-foreground": "0 0% 100%",
  "--sidebar-accent": "148.00 11.81% 50.20%",
  "--sidebar-accent-foreground": "0 0% 100%",
  "--sidebar-border": "150.00 11.81% 49.80%",
  "--sidebar-ring": "150.00 12.50% 52.94%",
  "--font-sans": "Tank Highway Gothic, Plus Jakarta Sans, sans-serif",
  "--font-serif": "Source Serif 4, serif",
  "--font-mono": "Tank 5x5 Dots, JetBrains Mono, monospace",
  "--radius": "0.5rem",
  "--shadow-2xs": "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
  "--shadow-xs": "0 1px 3px 0px hsl(0 0% 0% / 0.05)",
  "--shadow-sm": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
  "--shadow": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 1px 2px -1px hsl(0 0% 0% / 0.10)",
  "--shadow-md": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 2px 4px -1px hsl(0 0% 0% / 0.10)",
  "--shadow-lg": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 4px 6px -1px hsl(0 0% 0% / 0.10)",
  "--shadow-xl": "0 1px 3px 0px hsl(0 0% 0% / 0.10), 0 8px 10px -1px hsl(0 0% 0% / 0.10)",
  "--shadow-2xl": "0 1px 3px 0px hsl(0 0% 0% / 0.25)",
  "--tracking-normal": "0.5px",
  "--lt-status-bar": "#637F6D",
  "--lt-bg": "#637F6D",
  "--tank-bg-url": "https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/green-bg.png",
};

const tankGreenTheme: Theme = {
  id: "tank-green",
  name: "Tank Arcade Green",
  description: "Official Tank Arcade Console theme with matching green arcade chassis & iOS status bar (#637F6D).",
  previewColor: "#637F6D",
  fonts: tankFonts,
  radii: defaultRadii,
  shadows: defaultShadows,
  typography: {
    trackingNormal: "0.5px",
  },
  // Light and dark are identical on Tank
  light: tankGreenVariables,
  dark: tankGreenVariables,
};

export default tankGreenTheme;
