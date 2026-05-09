// src/ink/components/design-system/MetricCard.tsx
// ─────────────────────────────────────────────────────────────────────────────
// High-density status card for dashboard metrics.
// Displays label, value, trend sparkline, and footer note.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Box } from 'ink';
import ThemedBox from './ThemedBox.js';
import ThemedText from './ThemedText.js';
import type { Theme } from '../../utils/theme.js';

export interface MetricCardProps {
  label: string;
  value: string;
  note:  string;
  /** Theme key for the label and trend highlights */
  tone?: keyof Theme;
  /** Optional unicode trend graph (e.g. from sparkline()) */
  trend?: string;
  /** Minimum width in characters */
  minWidth?: number;
}

/**
 * MetricCard component for displaying key-value data with visual context.
 */
export function MetricCard({
  label,
  value,
  note,
  tone = 'suggestion',
  trend,
  minWidth = 22,
}: MetricCardProps) {
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
