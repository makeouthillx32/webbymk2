import figures from 'figures';
import React, { type ReactNode } from 'react';
import { useDeclaredCursor } from '../../hooks/use-declared-cursor.js';
import { Box, Text } from '../../runtimeInk.js';

export type ListItemProps = {
  /**
   * Whether this item is currently focused.
   */
  isFocused?: boolean;

  /**
   * Whether this item is selected.
   */
  isSelected?: boolean;

  children: ReactNode;
  description?: string;
  showScrollDown?: boolean;
  showScrollUp?: boolean;
  styled?: boolean;
  disabled?: boolean;
  /**
   * Whether this item should declare the terminal cursor position.
   */
  declareCursor?: boolean;

  /**
   * Backward-compatible aliases used by older TUI components.
   */
  focused?: boolean;
  selected?: boolean;
};

/**
 * Common list row for keyboard-driven selection, menus, and pickers.
 */
export function ListItem({
  isFocused,
  isSelected,
  children,
  description,
  showScrollDown,
  showScrollUp,
  styled = true,
  disabled = false,
  declareCursor = true,
  focused,
  selected,
}: ListItemProps): React.ReactNode {
  const itemFocused = isFocused ?? focused ?? false;
  const itemSelected = isSelected ?? selected ?? false;

  function renderIndicator(): ReactNode {
    if (disabled) {
      return <Text> </Text>;
    }

    if (itemFocused) {
      return <Text color="suggestion">{figures.pointer}</Text>;
    }

    if (showScrollDown) {
      return <Text dimColor>{figures.arrowDown}</Text>;
    }

    if (showScrollUp) {
      return <Text dimColor>{figures.arrowUp}</Text>;
    }

    return <Text> </Text>;
  }

  function getTextColor(): 'success' | 'suggestion' | 'inactive' | undefined {
    if (disabled) {
      return 'inactive';
    }

    if (!styled) {
      return undefined;
    }

    if (itemSelected) {
      return 'success';
    }

    if (itemFocused) {
      return 'suggestion';
    }

    return undefined;
  }

  const textColor = getTextColor();
  const cursorRef = useDeclaredCursor({
    line: 0,
    column: 0,
    active: itemFocused && !disabled && declareCursor !== false,
  });

  return (
    <Box ref={cursorRef} flexDirection="column">
      <Box flexDirection="row" gap={1}>
        {renderIndicator()}
        {styled ? (
          <Text color={textColor} dimColor={disabled}>
            {children}
          </Text>
        ) : (
          children
        )}
        {itemSelected && !disabled && <Text color="success">{figures.tick}</Text>}
      </Box>
      {description && (
        <Box paddingLeft={2}>
          <Text color="inactive">{description}</Text>
        </Box>
      )}
    </Box>
  );
}
