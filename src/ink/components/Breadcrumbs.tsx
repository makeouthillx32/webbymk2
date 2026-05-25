// src/ink/components/Breadcrumbs.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight navigation trail rendered between the Header and the active view.
// Only visible when depth > 1 (i.e. not on the welcome / home screen).
//
//   home › zones
//   home › zones › new zone
//   home › settings
//
// The last segment is dimmer-white (current location).
// All other segments are mid-gray.
// The separators are dim.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Box, Text } from "../runtimeInk.js";
import type { View } from "../hooks/useAppRouter.ts";

// ── Label map ─────────────────────────────────────────────────────────────────

const LABELS: Record<View, string> = {
  welcome:          "home",
  zones:            "zones",
  npm:              "npm",
  db:               "db",
  infra:            "infra",
  settings:         "settings",
  wizard:           "new zone",
  "instance-wizard": "new instance",
  core:             "core",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface BreadcrumbsProps {
  history:   readonly View[];
  /** Internal panel sub-navigation — set by each panel via onSubCrumbs(). */
  subCrumbs: string[];
}

export function Breadcrumbs({ history, subCrumbs }: BreadcrumbsProps) {
  // Flatten router history labels + panel sub-crumbs into one trail.
  const all = [
    ...history.map((v) => LABELS[v] ?? v),
    ...subCrumbs,
  ];

  // Nothing to show at root (welcome only, no sub-crumbs).
  if (all.length <= 1) return null;

  return (
    <Box paddingX={1} marginBottom={0}>
      {all.map((label, i) => {
        const isLast = i === all.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && <Text dimColor>  ›  </Text>}
            <Text
              color={isLast ? "white" : undefined}
              dimColor={!isLast}
            >
              {label}
            </Text>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
