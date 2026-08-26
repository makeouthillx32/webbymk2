// src/components/Layouts/config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server-safe zone layout config helpers.
//
// This file is intentionally free of "use client" so it can be imported by
// Next.js layout.tsx files and other server components.
// ─────────────────────────────────────────────────────────────────────────────

import type { LayoutType, ZoneLayoutConfig } from "@/types/zones";

// ── Defaults ──────────────────────────────────────────────────────────────────

export const LAYOUT_DEFAULTS: Record<LayoutType, Required<Omit<ZoneLayoutConfig, "layoutType">>> = {
  landing:   { useTicker: false, useSidebar: false, useAppHeader: false, useFooter: true,  useNav: true  },
  shop:      { useTicker: false, useSidebar: false, useAppHeader: false, useFooter: true,  useNav: true  },
  dashboard: { useTicker: false, useSidebar: true,  useAppHeader: false, useFooter: false, useNav: false },
  app:       { useTicker: false, useSidebar: false, useAppHeader: true,  useFooter: false, useNav: true  },
  minimal:   { useTicker: false, useSidebar: false, useAppHeader: false, useFooter: false, useNav: false },
};

// ── Resolver ──────────────────────────────────────────────────────────────────

export function resolveZoneConfig(
  partial: Partial<ZoneLayoutConfig> & { layoutType: LayoutType }
): Required<ZoneLayoutConfig> {
  const defaults = LAYOUT_DEFAULTS[partial.layoutType];
  return {
    layoutType: partial.layoutType,
    useTicker: partial.useTicker ?? defaults.useTicker,
    useSidebar: partial.useSidebar ?? defaults.useSidebar,
    useAppHeader: partial.useAppHeader ?? defaults.useAppHeader,
    useFooter: partial.useFooter ?? defaults.useFooter,
    useNav: partial.useNav ?? defaults.useNav,
  };
}
