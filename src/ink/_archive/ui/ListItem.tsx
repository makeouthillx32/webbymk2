// tui/ui/ListItem.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Selectable list row — mirrors the ListItem.tsx design-system pattern:
//   focused  →  › pointer in cyan  (figures.pointer equivalent)
//   selected →  ✓ tick in green
//   default  →  space
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Box, Text } from "ink";

interface ListItemProps {
  focused?:   boolean;
  selected?:  boolean;
  disabled?:  boolean;
  children:   React.ReactNode;
  /** Optional dim description shown after a separator */
  description?: string;
}

export function ListItem({
  focused   = false,
  selected  = false,
  disabled  = false,
  children,
  description,
}: ListItemProps) {
  const indicator = (() => {
    if (disabled) return <Text dimColor> </Text>;
    if (focused)  return <Text color="cyan">›</Text>;
    if (selected) return <Text color="green">✓</Text>;
    return          <Text> </Text>;
  })();

  const textColor = (() => {
    if (disabled) return "gray";
    if (focused)  return "cyan";
    if (selected) return "green";
    return undefined;
  })();

  return (
    <Box gap={1}>
      <Text>{indicator} </Text>
      <Text color={textColor} bold={focused}>
        {children}
      </Text>
      {description && (
        <Text dimColor>  {description}</Text>
      )}
    </Box>
  );
}
