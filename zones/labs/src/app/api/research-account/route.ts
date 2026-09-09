// zones/labs/src/app/api/research-account/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Unenter Labs zone · GET/PATCH /api/research-account · entry wrapper
//
// Labs-only API route (zone overlay — see this zone's Dockerfile). Named
// research-* to match the existing src/app/api/research-checkout/ convention.
// Implementation, including the editable-field allow-list, lives in:
//
//   → src/zones/labs/account/api.ts
// ─────────────────────────────────────────────────────────────────────────────
export { GET, PATCH, POST, DELETE } from "@/zones/labs/account/api";
