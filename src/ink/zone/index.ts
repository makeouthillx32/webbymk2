// src/ink/zone/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Zone scaffolding system — public barrel.
//
// Import from this file (or from zone-scaffold.ts which re-exports it) to
// access the full zone API:
//
//   Types & constants   → zone/types.ts, zone/constants.ts
//   Computation         → zone/derive.ts
//   File generators     → zone-templates.ts  (imported by zone/scaffold.ts)
//   Route classifier    → zone/route-classifier.ts
//   DB registry         → zone/registry.ts
//   Docker cleanup      → zone/docker-compose.ts (legacy), zone/delete.ts
//   NPM cleanup         → zone/npm-cleanup.ts
//   Orchestration       → zone/scaffold.ts, zone/delete.ts
//
// Submodule layout:
//   types.ts            — LayoutType, AppFooterType, DerivedZone, NewZoneParams, …
//   constants.ts        — LAYOUT_OPTIONS, DS_CATALOG
//   derive.ts           — deriveZone(), findNextDevPort()
//   route-classifier.ts — genRouteOverride(), patchRouteClassifier(), removeFromRouteClassifier()
//   registry.ts         — insertZoneToDb(), deleteZoneFromDb()
//   docker-compose.ts   — legacy root-compose patching (kept for old zones)
//   npm-cleanup.ts      — deleteZoneNpmHost()
//   scaffold.ts         — scaffoldZone()
//   delete.ts           — deleteZone()
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
  OnLine,
  LayoutType,
  AppFooterType,
  DynamicSection,
  NewZoneParams,
  DerivedZone,
} from "./types.ts";

// ── Constants ─────────────────────────────────────────────────────────────────
export { LAYOUT_OPTIONS, DS_CATALOG } from "./constants.ts";

// ── Derive ────────────────────────────────────────────────────────────────────
export { deriveZone, findNextDevPort } from "./derive.ts";

// ── Route classifier (zone-overrides.ts data ops) ────────────────────────────
export {
  patchRouteClassifier,
  removeFromRouteClassifier,
} from "./route-classifier.ts";

// ── DB registry ───────────────────────────────────────────────────────────────
export { insertZoneToDb, deleteZoneFromDb } from "./registry.ts";

// ── Legacy docker-compose patching (old zones only) ───────────────────────────
export {
  genComposeService,
  patchDockerCompose,
  removeFromDockerCompose,
} from "./docker-compose.ts";

// ── NPM cleanup ───────────────────────────────────────────────────────────────
export { deleteZoneNpmHost } from "./npm-cleanup.ts";

// ── Orchestration ─────────────────────────────────────────────────────────────
export { scaffoldZone } from "./scaffold.ts";
export { deleteZone }   from "./delete.ts";

// ── DS file generators (public — used by zone-ops.ts for existing zones) ──────
// genDockerfile, genPackageJson, genPageTsx, genLayoutTsx, genCorePageModule,
// and genZoneCompose are scaffold internals — import them directly from
// zone-templates.ts if needed rather than through this barrel.
export {
  genDsWrappers,
  genDsCorePageTsx,
} from "../zone-templates.ts";
