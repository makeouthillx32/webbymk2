// tui/components/KeyboardShortcutHint.tsx
// API-compatible with src/components/design-system/KeyboardShortcutHint.tsx
//
// Renders "key to action" or "(key to action)" inline.
// Wrap in <Text dimColor> for the common muted styling.
//
// Usage:
//   <Text dimColor><KeyboardShortcutHint shortcut="esc" action="cancel" /></Text>
//   <Text dimColor><KeyboardShortcutHint shortcut="Enter" action="confirm" bold /></Text>
//   <Text dimColor><KeyboardShortcutHint shortcut="Tab" action="switch panel" parens /></Text>

import React    from "react";
import { Text } from "ink";

export interface KeyboardShortcutHintProps {
  shortcut: string;
  action:   string;
  parens?:  boolean;
  bold?:    boolean;
}

export function KeyboardShortcutHint({
  shortcut,
  action,
  parens = false,
  bold   = false,
}: KeyboardShortcutHintProps) {
  const key = bold ? <Text bold>{shortcut}</Text> : shortcut;

  if (parens) {
    return <Text>({key} to {action})</Text>;
  }
  return <Text>{key} to {action}</Text>;
}
