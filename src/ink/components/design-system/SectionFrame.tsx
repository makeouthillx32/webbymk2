// src/ink/components/design-system/SectionFrame.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Rounded-border section container for dashboard grouping.
// Includes a bold title and optional right-aligned metadata/actions.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Box } from 'ink';
import ThemedBox from './ThemedBox.js';
import ThemedText from './ThemedText.js';
import type { Theme } from '../../utils/theme.js';

export interface SectionFrameProps {
  title: string;
  /** Theme key for the title color */
  tone?: keyof Theme;
  /** Optional metadata or shortcut hints shown on the top-right edge */
  right?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * SectionFrame provides a standardized container for dashboard widgets.
 */
export function SectionFrame({
  title,
  tone = 'suggestion',
  right,
  children,
}: SectionFrameProps) {
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
