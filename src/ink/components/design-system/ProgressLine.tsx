// src/ink/components/design-system/ProgressLine.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Labeled progress indicator for performance metrics.
// Shows label, percentage, bar, and optional metadata.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Box, Text } from 'ink';
import ThemedText from './ThemedText.js';
import { ProgressBar } from './ProgressBar.js';
import { useTheme } from './ThemeProvider.js';
import { getTheme, type Theme } from '../../utils/theme.js';

export interface ProgressLineProps {
  label: string;
  /** Percentage value [0, 1] */
  ratio: number;
  /** Secondary information (e.g. "8GB / 16GB") */
  meta: string;
  /** Theme key for the filled portion of the bar and label */
  tone?: keyof Theme;
  /** Width of the progress bar in characters */
  width: number;
}

/**
 * ProgressLine displays a status bar with high-level labeling and precision percentage.
 */
export function ProgressLine({
  label,
  ratio,
  meta,
  tone = 'suggestion',
  width,
}: ProgressLineProps) {
  const [themeName] = useTheme();
  const theme = getTheme(themeName);
  
  const percentage = (Math.min(1, Math.max(0, ratio)) * 100).toFixed(ratio * 100 >= 10 ? 0 : 1);

  return (
    <Box flexDirection="column">
      <Box>
        <ThemedText color={tone} bold>
          {label}
        </ThemedText>
        <Box flexGrow={1} />
        <Text>{percentage}%</Text>
      </Box>
      <Box gap={1}>
        <ProgressBar
          ratio={ratio}
          width={width}
          fillColor={theme[tone as keyof Theme] as string || theme.suggestion}
          emptyColor={themeName.includes('dark') ? '#2B3440' : '#D9DEE6'}
        />
        <ThemedText dimColor>{meta}</ThemedText>
      </Box>
    </Box>
  );
}
