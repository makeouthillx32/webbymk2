// src/ink/components/LogoV2/GuestPassesUpsell.tsx
// Stub — no guest pass concept in UNAXIS. Kept for import compatibility.

import React from "react";
import type { FeedConfig } from "./Feed.js";

export function useShowGuestPassesUpsell(): boolean {
  return false;
}

export function incrementGuestPassesSeenCount(): void {
  // no-op
}

export function createGuestPassesFeed(): FeedConfig | null {
  return null;
}

export function GuestPassesUpsell(): React.ReactNode {
  return null;
}
