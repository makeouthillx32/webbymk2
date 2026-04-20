import React from 'react';
import { Box } from 'ink';
import type { Theme } from '../../utils/theme.js';
import { Divider } from './Divider.js';

type PaneProps = {
  children: React.ReactNode;
  /**
   * Theme color for the top border line.
   */
  color?: keyof Theme;
};

/**
 * A pane — a region of the terminal that appears below the REPL prompt,
 * bounded by a colored top line with a one-row gap above and horizontal
 * padding.
 */
export function Pane({ children, color }: PaneProps): React.ReactNode {
  // Simplified Pane without modal detection for now as it's a standalone engine.
  // If modal context is added later, this can be restored.
  return (
    <Box flexDirection="column" paddingTop={1}>
      <Divider color={color} />
      <Box flexDirection="column" paddingX={2}>
        {children}
      </Box>
    </Box>
  );
}