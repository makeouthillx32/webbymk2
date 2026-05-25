import React from 'react';
import { Box } from '../../runtimeInk.js';
import ThemedBox from './ThemedBox.js';
import ThemedText from './ThemedText.js';
import type { Theme } from '../../utils/theme.js';

export interface MetricCardProps {
  label: string;
  value: string;
  note: string;
  /**
   * Theme key for the label and trend highlights.
   */
  tone?: keyof Theme;
  /**
   * Optional unicode trend graph, for example from sparkline().
   */
  trend?: string;
  /**
   * Minimum width in terminal cells.
   */
  minWidth?: number;
}

/**
 * High-density status card for Unaxis dashboard metrics.
 */
export function MetricCard({
  label,
  value,
  note,
  tone = 'suggestion',
  trend,
  minWidth = 22,
}: MetricCardProps): React.ReactNode {
  return (
    <ThemedBox
      borderStyle="single"
      borderColor="subtle"
      paddingX={1}
      paddingY={0}
      flexDirection="column"
      flexGrow={1}
      minWidth={minWidth}
    >
      <Box>
        <ThemedText color={tone} bold>
          {label}
        </ThemedText>
        <Box flexGrow={1} />
        {trend && <ThemedText dimColor>{trend}</ThemedText>}
      </Box>
      <ThemedText bold>{value}</ThemedText>
      <ThemedText dimColor>{note}</ThemedText>
    </ThemedBox>
  );
}
