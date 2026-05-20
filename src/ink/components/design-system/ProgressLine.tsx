import React from 'react';
import { Box, Text } from 'ink';
import ThemedText from './ThemedText.js';
import { ProgressBar } from './ProgressBar.js';
import { useTheme } from './ThemeProvider.js';
import { getTheme, type Theme } from '../../utils/theme.js';

export interface ProgressLineProps {
  label: string;
  /**
   * Percentage value between 0 and 1.
   */
  ratio: number;
  /**
   * Secondary information, for example "8GB / 16GB".
   */
  meta: string;
  /**
   * Theme key for the filled portion of the bar and label.
   */
  tone?: keyof Theme;
  /**
   * Width of the progress bar in terminal cells.
   */
  width: number;
}

/**
 * Labeled progress indicator for runtime metrics, credential age,
 * deployment progress, and other bounded control-plane values.
 */
export function ProgressLine({
  label,
  ratio,
  meta,
  tone = 'suggestion',
  width,
}: ProgressLineProps): React.ReactNode {
  const [themeName] = useTheme();
  const theme = getTheme(themeName);

  const clamped = Math.min(1, Math.max(0, ratio));
  const percentage = (clamped * 100).toFixed(clamped * 100 >= 10 ? 0 : 1);

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
          ratio={clamped}
          width={width}
          fillColor={(theme[tone] as string) || theme.suggestion}
          emptyColor={themeName.includes('dark') ? '#2B3440' : '#D9DEE6'}
        />
        <ThemedText dimColor>{meta}</ThemedText>
      </Box>
    </Box>
  );
}
