// tui/components/Divider.tsx
// API-compatible with src/components/design-system/Divider.tsx
//
// Core props: width?, color?, char?, padding?, title? (TUI extension)
// Differences from core: defaults to 72 cols instead of terminal width

import React            from "react";
import { Box, Text }    from "ink";
import { resolveColor } from "../theme.ts";

export interface DividerProps {
  width?:   number;   // explicit char width (default 72)
  color?:   string;   // theme token or raw color
  char?:    string;   // repeat char, default "─"
  padding?: number;   // cols to subtract from effective width
  title?:   string;   // TUI extension: centered label
}

export function Divider({
  width   = 72,
  color,
  char    = "─",
  padding = 0,
  title,
}: DividerProps) {
  const resolved  = resolveColor(color);
  const hasTint   = resolved !== undefined;
  const effective = Math.max(0, width - padding);

  if (!title) {
    return (
      <Box>
        <Text dimColor={!hasTint} color={resolved}>{char.repeat(effective)}</Text>
      </Box>
    );
  }

  const label = ` ${title} `;
  const total = effective - label.length;
  const left  = Math.floor(total / 2);
  const right = total - left;

  return (
    <Box>
      <Text dimColor={!hasTint} color={resolved}>{char.repeat(Math.max(0, left))}</Text>
      <Text color={resolved}>{label}</Text>
      <Text dimColor={!hasTint} color={resolved}>{char.repeat(Math.max(0, right))}</Text>
    </Box>
  );
}
