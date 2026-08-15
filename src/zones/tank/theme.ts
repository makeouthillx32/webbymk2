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
// Asset origin: scraped from the real fishtank.live (web.archive.org
// snapshot, Dec 2023) — Z:\WEBSITES\webbymk2\.tmp\tank_image_dump. Their
// logo.png is deliberately NOT included/served here; everything else
// (button/panel/texture art + the four font files) is generic UI chrome,
// not a trademark.

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

export const FISHTANK_ARCADE_THEME: TankTheme = {
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

// Swap this to re-skin the whole zone once a second theme pack exists.
export const ACTIVE_THEME: TankTheme = FISHTANK_ARCADE_THEME;
