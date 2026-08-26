// lib/research/references/ghk-cu.ts
//
// DEPRECATED — intentionally emptied out 2026-08-09. Per feedback: reference
// data should live in the database (research_references table, group_key
// column), not in per-product-named hardcoded files like this one. The
// filesystem this project runs on doesn't allow this file to be deleted from
// the agent sandbox, so it's left as this stub rather than removed — do not
// resurrect it with data. Use getResearchReferences("ghk-cu") from
// ./queries instead.
//
// See:
//   - src/lib/research/references/queries.ts — the real, generic data fetch
//   - src/lib/research/references/types.ts   — shared types
//   - src/components/research/SourcesReferences.tsx — presentational component
export {};
