// src/ink/components/LogoV2/OverageCreditUpsell.tsx
// Stub — no billing/overage concept in UNAXIS. Kept for import compatibility.

import React from "react";
import type { FeedConfig } from "./Feed.js";

export function useShowOverageCreditUpsell(): boolean {
  return false;
}

export function incrementOverageCreditUpsellSeenCount(): void {
  // no-op
}

export function createOverageCreditFeed(): FeedConfig | null {
  return null;
}

export function OverageCreditUpsell(): React.ReactNode {
  return null;
}
