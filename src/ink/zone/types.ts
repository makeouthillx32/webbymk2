// src/ink/zone/types.ts
// ─────────────────────────────────────────────────────────────────────────────
// Canonical shared types for the zone scaffolding system.
// Imported by zone-templates.ts, zone/*, zone-scaffold.ts, and TUI screens.
// ─────────────────────────────────────────────────────────────────────────────

// ── Logging callback ──────────────────────────────────────────────────────────

/** Called with each progress line emitted during a scaffolding operation. */
export type OnLine = (line: string) => void;

// ── Layout types ──────────────────────────────────────────────────────────────

export type LayoutType    = "landing" | "shop" | "app" | "minimal";
export type AppFooterType = "none" | "shop" | "landing";

// ── Dynamic sections ──────────────────────────────────────────────────────────
//
// Dynamic route sections are Next.js route segments containing a dynamic param
// (e.g. [slug], [id]) or static child routes (e.g. checkout, cart) that a zone
// needs in addition to its root page.tsx.
//
// Each entry in DS_CATALOG maps a LayoutType to the sections that make sense
// for it.  The wizard pre-selects defaultOn:true entries; the user can toggle.
//
// Scaffold creates two files per section:
//   zones/{key}/src/app/{routePath}/page.tsx  ← thin re-export wrapper
//   src/zones/{key}/{routePath}/Page.tsx       ← starter content in core

export interface DynamicSection {
  id:          string;        // unique key, e.g. "products"
  routePath:   string;        // Next.js path, e.g. "products/[slug]"
  param:       string | null; // dynamic segment name, null for static routes
  label:       string;        // human label
  desc:        string;        // one-line description shown in wizard
  defaultOn:   boolean;       // pre-selected when layout is chosen
  hasCore?:    boolean;       // if true, route lives in core; zone gets thin wrapper only
}

// ── Zone creation params ──────────────────────────────────────────────────────

export interface NewZoneParams {
  key:              string;
  label:            string;
  layoutType:       LayoutType;
  appFooter?:       AppFooterType;    // only used when layoutType === "app"
  dynamicSections?: DynamicSection[];
}

// ── Derived zone (all computed values) ───────────────────────────────────────

export interface DerivedZone {
  key:             string;
  label:           string;
  layoutType:      LayoutType;
  appFooter:       AppFooterType;   // "none" for non-app layouts
  domain:          string;
  service:         string;
  container:       string;
  image:           string;
  dockerfile:      string;
  upstreamEnvKey:  string;
  devPort:         number;
  dynamicSections: DynamicSection[];
}
