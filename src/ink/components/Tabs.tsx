// tui/components/Tabs.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Horizontal tab strip.
//
//   <Tabs tabs={["zones","db","infra"]} active="zones" />
//   →  [zones]  db  infra
//
// Active tab is bracketed + cyan. Inactive tabs are dim.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Box, Text } from "ink";

interface TabsProps {
  tabs:         string[];
  active:       string;
  marginBottom?: number;
}

export function Tabs({ tabs, active, marginBottom }: TabsProps) {
  return (
    <Box gap={2} marginBottom={marginBottom}>
      {tabs.map((tab) => {
        const isActive = tab === active;
        return (
          <Text
            key={tab}
            bold={isActive}
            color={isActive ? "cyan" : undefined}
            dimColor={!isActive}
          >
            {isActive ? `[${tab}]` : ` ${tab} `}
          </Text>
        );
      })}
    </Box>
  );
}
