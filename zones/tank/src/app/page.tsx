// zones/tank/src/app/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Tank Director zone · tank.unenter.live · entry wrapper
//
// This is a thin re-export so Next.js App Router can pick up the route — the
// real page content lives in the core tree so it can freely import the shared
// Unenter components, theme tokens, and utilities:
//
//   → src/zones/tank/Page.tsx     ← start building here
//
// You can leave this wrapper untouched for most projects.  Editing or
// re-generating it is fine — it's your zone.
// ─────────────────────────────────────────────────────────────────────────────
export { default, metadata } from "@/zones/tank/Page";
