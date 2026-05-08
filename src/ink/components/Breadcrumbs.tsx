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
import { Box, Text } from "ink";
import type { View } from "../hooks/useAppRouter.ts";

// ── Label map ─────────────────────────────────────────────────────────────────

const LABELS: Record<View, string> = {
  welcome:  "home",
  zones:    "zones",
  npm:      "npm",
  db:       "db",
  infra:    "infra",
  settings: "settings",
  wizard:   "new zone",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface BreadcrumbsProps {
  history: readonly View[];
}

export function Breadcrumbs({ history }: BreadcrumbsProps) {
  // Nothing to show at root (welcome only).
  if (history.length <= 1) return null;

  return (
    <Box paddingX={1} marginBottom={0}>
      {history.map((v, i) => {
        const isLast = i === history.length - 1;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <Text dimColor>  ›  </Text>
            )}
            <Text
              color={isLast ? "white" : undefined}
              dimColor={!isLast}
            >
              {LABELS[v] ?? v}
            </Text>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
