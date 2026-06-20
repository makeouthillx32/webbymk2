"use client";

// src/components/providers/ZoneProvider.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Client-side zone runtime. The layout (a server component) reads the zone
// context from headers via getZoneContext() and feeds it here once; any client
// hook or component can then call useZone() to learn what zone it's running in
// WITHOUT sniffing window.location.hostname or hardcoding "shop.unenter.live".
//
// This is the shared-runtime contract: a Zone-Compatible component reads zone
// facts from useZone() and therefore works unchanged under both
// unenter.live/feature (Core path) and feature.unenter.live (dedicated zone).
// ─────────────────────────────────────────────────────────────────────────────

import { createContext, useContext, type ReactNode } from "react";
import type { ZoneRequestContext } from "@/lib/multiZone";

const ZoneContext = createContext<ZoneRequestContext | null>(null);

export function ZoneProvider({
  value,
  children,
}: {
  value: ZoneRequestContext;
  children: ReactNode;
}) {
  return <ZoneContext.Provider value={value}>{children}</ZoneContext.Provider>;
}

/**
 * Read the current zone context. Returns a safe Core default when called
 * outside a provider (tests, isolated stories) so components never crash.
 */
export function useZone(): ZoneRequestContext {
  return (
    useContext(ZoneContext) ?? {
      zone:          "unenter",
      host:          "",
      canonicalHost: "",
      isCoreHost:    true,
      isLocal:       false,
    }
  );
}
