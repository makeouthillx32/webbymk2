import React from 'react';
import { Box } from 'ink';
import type { Theme } from '../../utils/theme.js';
import { Divider } from './Divider.js';

export type PaneProps = {
  children: React.ReactNode;
  /**
   * Theme color for the top border line.
   */
  color?: keyof Theme;
  /**
   * Optional label centered in the divider.
   */
  title?: string;
  /**
   * Optional fixed divider width.
   */
  width?: number;
  /**
   * Gap between the divider and body content.
   */
  gap?: number;
};

/**
 * A control-plane pane bounded by a divider and grouped body content.
 */
export function Pane({
  children,
  color,
  title,
  width,
  gap = 0,
}: PaneProps): React.ReactNode {
  return (
    <Box flexDirection="column" paddingTop={1} gap={gap}>
      <Divider color={color} title={title} width={width} />
      <Box flexDirection="column" paddingX={2}>
        {children}
      </Box>
    </Box>
  );
}
