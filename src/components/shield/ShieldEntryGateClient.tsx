"use client";

import { useRouter } from "next/navigation";
import ShieldTurnstileWidget from "./ShieldTurnstileWidget";

// Bridges the client-side PoW widget's success back into the server-rendered
// gate above it (ShieldEntryGate.tsx). That gate is a Server Component that
// decides `isVerified` from the __unt_clearance cookie once, at render time.
// The widget setting that cookie via POST /api/shield/verify does NOT make
// Next.js re-render the server tree on its own — before this fix the widget
// flipped to its own "Success" state and just sat there forever, because
// nothing told the gate above it to re-check the cookie. Confirmed live
// 2026-09-04: real visitors solved the challenge, saw the green check, and
// were stuck on the interstitial indefinitely.
//
// router.refresh() re-runs the current route's Server Components in place
// with the request cookies Next.js has *right now* — the same technique
// AuthProvider uses after a SIGNED_IN event (see
// src/app/providers/AuthProvider.tsx) instead of a full document reload.
// Since ShieldEntryGate calls cookies() itself, its render is already
// dynamic/uncached, so the refreshed pass picks up the freshly-set
// clearance cookie and swaps straight to the real page — no flash, no
// full-page reload like the raw-HTML middleware interstitial has to do.
export default function ShieldEntryGateClient() {
  const router = useRouter();
  return <ShieldTurnstileWidget autoVerify={true} onSuccess={() => router.refresh()} />;
}
