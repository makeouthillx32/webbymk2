// src/zones/tank/theme.ts
// ─────────────────────────────────────────────────────────────────────────────
// Hot-swappable visual theme registry for the Tank zone.
//
// Assets (button/panel/texture PNGs, fonts) live in Supabase Storage — the
// shared public `site-assets` bucket, under `tank-theme/<theme-id>/...` —
// not bundled into the app. Swapping the whole zone's "vibe" is meant to be
// a matter of adding a new theme object below (new asset folder + new
// font-family names) and pointing ACTIVE_THEME at it, no rebuild of the
// asset pipeline itself.
//
// DB-backed version (so the active theme can change from the admin console
// without a redeploy) is drafted at
// supabase/migrations/20260814_tank_theme_assets.sql — NOT applied yet, the
// DB connector was unreachable from the session that wrote it. Until that
// migration lands and a loader replaces this file, ACTIVE_THEME below is
// the source of truth.
//
// Asset origin: all assets are served directly from Supabase Storage
// (bucket `site-assets` and `tank-assets`). No local temp folders used.

const SUPABASE_ASSET_BASE =
  "https://db.unenter.live/storage/v1/object/public/site-assets";

export type TankThemeFontFace = {
  family: string;
  url: string;
  format: string;
  weight?: string;
  style?: string;
};

export type TankTheme = {
  id: string;
  label: string;
  fonts: {
    /** Big glowing LED numeric readouts (live/offline, cams-online count). */
    display: string;
    /** Small pixel dot-matrix readouts. */
    dotMatrix: string;
    /** Condensed uppercase labels — room names, button text. */
    label: string;
    /** Wider condensed variant for headers. */
    labelWide: string;
    /** Stamp/badge accent font. */
    stamp: string;
  };
  fontFaces: TankThemeFontFace[];
  images: {
    background: string;
    buttonBlue: string;
    buttonGray: string;
    buttonOrange: string;
    buttonRed: string;
    aluminumTexture: string;
    metalTexture: string;
    screwTopLeft: string;
    screwTopRight: string;
    screwBottomLeft: string;
    screwBottomRight: string;
  };
};

function assetUrl(theme: string, kind: "images" | "fonts", file: string): string {
  return `${SUPABASE_ASSET_BASE}/tank-theme/${theme}/${kind}/${file}`;
}

export const TANK_ARCADE_THEME: TankTheme = {
  id: "fishtank-arcade",
  label: "Arcade Console",
  fonts: {
    display: "Tank Alarm Clock",
    dotMatrix: "Tank 5x5 Dots",
    label: "Tank Highway Gothic",
    labelWide: "Tank Highway Gothic Wide",
    stamp: "Tank Army Rust",
  },
  fontFaces: [
    {
      family: "Tank Alarm Clock",
      url: assetUrl("fishtank-arcade", "fonts", "alarmclock.ttf"),
      format: "truetype",
    },
    {
      family: "Tank 5x5 Dots",
      url: assetUrl("fishtank-arcade", "fonts", "5x5-Dots.woff"),
      format: "woff",
    },
    {
      family: "Tank Highway Gothic",
      url: assetUrl("fishtank-arcade", "fonts", "highway_gothic.ttf"),
      format: "truetype",
      weight: "600",
    },
    {
      family: "Tank Highway Gothic Wide",
      url: assetUrl("fishtank-arcade", "fonts", "highway_gothic_wide.ttf"),
      format: "truetype",
      weight: "600",
    },
    {
      family: "Tank Army Rust",
      url: assetUrl("fishtank-arcade", "fonts", "army.ttf"),
      format: "truetype",
      weight: "800",
    },
  ],
  images: {
    background: assetUrl("fishtank-arcade", "images", "green-bg.png"),
    buttonBlue: assetUrl("fishtank-arcade", "images", "console-button-long-blue.png"),
    buttonGray: assetUrl("fishtank-arcade", "images", "console-button-long-gray.png"),
    buttonOrange: assetUrl("fishtank-arcade", "images", "console-button-long-orange.png"),
    buttonRed: assetUrl("fishtank-arcade", "images", "console-button-long-red.png"),
    aluminumTexture: assetUrl("fishtank-arcade", "images", "light-aluminum-comp.webp"),
    metalTexture: assetUrl("fishtank-arcade", "images", "metal-small-comp.webp"),
    screwTopLeft: assetUrl("fishtank-arcade", "images", "screw-top-left.png"),
    screwTopRight: assetUrl("fishtank-arcade", "images", "screw-top-right.png"),
    screwBottomLeft: assetUrl("fishtank-arcade", "images", "screw-bottom-left.png"),
    screwBottomRight: assetUrl("fishtank-arcade", "images", "screw-bottom-right.png"),
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Tank Background Themes & Status Bar Color Registry
// ─────────────────────────────────────────────────────────────────────────────

export type TankBackgroundTheme = {
  id: string;
  label: string;
  themeId: string; // connects to unenter.live theme system id (e.g. 'tank-green')
  backgroundUrl: string;
  statusBarHex: string;
  palette: {
    base: string; // #637F6D (141.43 12.39% 44.31%)
    highlight: string; // #789687 (150.00 12.50% 52.94%)
    midtone: string; // #718F7F (148.00 11.81% 50.20%)
    border: string; // #708E7F (150.00 11.81% 49.80%)
  };
};

export const TANK_BACKGROUND_THEMES: TankBackgroundTheme[] = [
  {
    id: "tank-arcade-green",
    label: "Arcade Green",
    themeId: "tank-green",
    backgroundUrl: "https://db.unenter.live/storage/v1/object/public/site-assets/tank-theme/fishtank-arcade/images/green-bg.png",
    statusBarHex: "#637F6D",
    palette: {
      base: "#637F6D",
      highlight: "#789687",
      midtone: "#718F7F",
      border: "#708E7F",
    },
  },
  {
    id: "tank-arcade-blue",
    label: "Arcade Blue (Base)",
    themeId: "tank-blue",
    backgroundUrl: "https://db.unenter.live/storage/v1/object/public/tank-assets/patterns/asfalt-light.png",
    statusBarHex: "#557194",
    palette: {
      base: "#557194",
      highlight: "#6c8db5",
      midtone: "#466080",
      border: "#3b516c",
    },
  },
];

export function getTankBackgroundTheme(id?: string): TankBackgroundTheme {
  const found = TANK_BACKGROUND_THEMES.find((t) => t.id === id);
  return found || TANK_BACKGROUND_THEMES[0];
}

// Swap this to re-skin the whole zone once a second theme pack exists.
export const ACTIVE_THEME: TankTheme = TANK_ARCADE_THEME;
