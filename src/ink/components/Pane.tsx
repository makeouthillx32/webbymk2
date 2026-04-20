// tui/components/Pane.tsx
// API-compatible with src/components/design-system/Pane.tsx
//
// Core props: children, color?
// TUI extensions: title? (centered label in divider), width?, gap?

import React       from "react";
import { Box }     from "ink";
import { Divider } from "./Divider.tsx";

export interface PaneProps {
  children:  React.ReactNode;
  color?:    string;  // theme token or raw color
  title?:    string;  // TUI extension: label in divider
  width?:    number;  // TUI extension: divider width
  gap?:      number;  // TUI extension: gap between divider and body
}

export function Pane({ children, color, title, width, gap = 0 }: PaneProps) {
  return (
    <Box flexDirection="column" gap={gap}>
      <Divider title={title} color={color} width={width} />
      {children}
    </Box>
  );
}
