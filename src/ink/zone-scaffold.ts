// src/ink/zone-scaffold.ts
// ─────────────────────────────────────────────────────────────────────────────
// Public API barrel for the zone scaffolding system.
//
// All implementation lives in src/ink/zone/* submodules.
// This file re-exports the complete public API so existing importers
// (zone-pipeline.ts, zone-ops.ts, ZoneWizardScreen.tsx, ZonesView.tsx)
// continue working without any changes.
//
// To extend or modify scaffolding behaviour, edit the relevant submodule:
//
//   zone/types.ts            — LayoutType, AppFooterType, DerivedZone, …
//   zone/constants.ts        — LAYOUT_OPTIONS, DS_CATALOG
//   zone/derive.ts           — deriveZone(), findNextDevPort()
//   zone/route-classifier.ts — routeClassifier.ts patching
//   zone/registry.ts         — Supabase DB operations
//   zone/scaffold.ts         — scaffoldZone() orchestration
//   zone/delete.ts           — deleteZone() orchestration
//   zone-templates.ts        — all file content generators (genDockerfile, …)
// ─────────────────────────────────────────────────────────────────────────────

export type {
  OnLine,
  LayoutType,
  AppFooterType,
  DynamicSection,
  NewZoneParams,
  DerivedZone,
} from "./zone/index.ts";

export {
  // Constants
  LAYOUT_OPTIONS,
  DS_CATALOG,
  // Computation
  deriveZone,
  findNextDevPort,
  // Orchestration
  scaffoldZone,
  deleteZone,
  // DS file generators (used by zone-ops.ts)
  genDsWrappers,
  genDsCorePageTsx,
} from "./zone/index.ts";
