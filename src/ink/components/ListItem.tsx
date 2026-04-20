// tui/components/ListItem.tsx
// API-compatible with src/components/design-system/ListItem.tsx
//
// Core props: isFocused, isSelected?, children, description?,
//             showScrollDown?, showScrollUp?, styled?, disabled?, declareCursor?
// Backward-compat aliases: focused (=isFocused), selected (=isSelected)

import React          from "react";
import { Box, Text }  from "ink";

export interface ListItemProps {
  // Core API
  isFocused?:      boolean;
  isSelected?:     boolean;
  children:        React.ReactNode;
  description?:    string;
  showScrollDown?: boolean;
  showScrollUp?:   boolean;
  styled?:         boolean;  // default true
  disabled?:       boolean;
  declareCursor?:  boolean;  // no-op, accepted for compat
  // Backward-compat aliases
  focused?:  boolean;
  selected?: boolean;
}

export function ListItem({
  isFocused,
  isSelected,
  children,
  description,
  showScrollDown,
  showScrollUp,
  styled   = true,
  disabled = false,
  focused,
  selected,
}: ListItemProps) {
  const isFoc = isFocused ?? focused  ?? false;
  const isSel = isSelected ?? selected ?? false;

  function renderIndicator() {
    if (disabled)      return <Text> </Text>;
    if (isFoc)         return <Text color="cyan">❯</Text>;
    if (showScrollDown) return <Text dimColor>↓</Text>;
    if (showScrollUp)   return <Text dimColor>↑</Text>;
    return <Text> </Text>;
  }

  const mainRow = (
    <Box gap={1}>
      {renderIndicator()}
      {styled ? (
        <Box gap={1} flexGrow={1}>
          {React.Children.map(children, (child) => {
            if (!React.isValidElement(child)) return child;
            if (disabled) {
              return React.cloneElement(
                child as React.ReactElement<{ dimColor?: boolean }>,
                { dimColor: true },
              );
            }
            return child;
          })}
        </Box>
      ) : children}
      {isSel && !disabled && <Text color="green">✓</Text>}
    </Box>
  );

  if (!description) return mainRow;

  return (
    <Box flexDirection="column">
      {mainRow}
      <Box paddingLeft={2}>
        <Text color="gray">{description}</Text>
      </Box>
    </Box>
  );
}
