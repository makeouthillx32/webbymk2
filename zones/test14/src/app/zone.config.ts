// zones/test14/src/app/zone.config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Test14 zone layout configuration.
//
// This file is the single source of truth for which layout components render.
// ZoneLayout reads these values to select header, footer, sidebar, etc.
//
// Edit this file to change layout behavior without touching layout.tsx.
//
// CUSTOM CSS: If this zone needs styles beyond the shared theme tokens,
// create zones/test14/src/app/zone-styles.css and import it from your
// page component (src/zones/test14/Page.tsx), NOT from layout.tsx.
// ─────────────────────────────────────────────────────────────────────────────

import type { ZoneLayoutConfig } from "@/types/zones";

/**
 * Layout configuration for the Test14 zone.
 *
 * layoutType: app
 *   → Determines default feature flags (header, footer, sidebar, nav)
 *
 * Uncomment any field below to override the default for this layoutType.
 */
const zoneConfig: ZoneLayoutConfig & { label: string } = {
  label: "Test14",
  layoutType: "app",

  // ── Feature flag overrides (uncomment to change defaults) ─────────────────
  // useTicker: false,    // Scrolling ticker/banner below header
  // useSidebar: false,   // Dashboard sidebar (dashboard layout only)
  // useAppHeader: false, // Use AppHeader instead of ShopHeader (shop only)
  // useFooter: true,     // Show footer component
  // useNav: true,        // Show navigation in header
};

export default zoneConfig;
