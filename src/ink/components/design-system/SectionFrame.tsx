import React from 'react';
import { Box } from '../../runtimeInk.js';
import ThemedBox from './ThemedBox.js';
import ThemedText from './ThemedText.js';
import type { Theme } from '../../utils/theme.js';

export interface SectionFrameProps {
  title: string;
  /**
   * Theme key for the title color.
   */
  tone?: keyof Theme;
  /**
   * Optional metadata or shortcut hints shown on the top-right edge.
   */
  right?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Standard container for grouped runtime widgets.
 */
export function SectionFrame({
  title,
  tone = 'suggestion',
  right,
  children,
}: SectionFrameProps): React.ReactNode {
  return (
    <ThemedBox
      borderStyle="round"
      borderColor="subtle"
      paddingX={1}
      paddingY={0}
      flexDirection="column"
    >
      <Box>
        <ThemedText color={tone} bold>
          {title}
        </ThemedText>
        <Box flexGrow={1} />
        {right}
      </Box>
      <Box marginTop={1} flexDirection="column">
        {children}
      </Box>
    </ThemedBox>
  );
}
