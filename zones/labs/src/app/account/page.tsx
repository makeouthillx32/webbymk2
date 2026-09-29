// zones/labs/src/app/account/page.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Unenter Labs zone · labs.unenter.live/account · entry wrapper
//
// Thin re-export, same idiom as this zone's page.tsx — the real content lives
// in the core tree so it can import shared components, theme tokens and utils:
//
//   → src/zones/labs/account/AccountPage.tsx
//
// Because this file lives under zones/labs/src/app/ it is copied over src/app/
// ONLY in the labs image (see zones/labs/Dockerfile: COPY zones/labs/src/app/).
// No other zone gets an /account route from this.
// ─────────────────────────────────────────────────────────────────────────────
export { default, metadata, dynamic } from "@/zones/labs/account/AccountPage";
