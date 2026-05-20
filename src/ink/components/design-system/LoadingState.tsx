import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from '../Spinner.tsx';

export type LoadingStateProps = {
  /**
   * The loading message to display next to the spinner.
   */
  message?: string;

  /**
   * Backward-compatible alias used by some runtime components.
   */
  label?: string;

  /**
   * Display the message in bold.
   */
  bold?: boolean;

  /**
   * Display the message in dimmed color.
   */
  dimColor?: boolean;

  /**
   * Optional subtitle displayed below the main message.
   */
  subtitle?: string;
};

/**
 * A spinner with a loading message for async Unaxis operations.
 */
export function LoadingState({
  message,
  label,
  bold = false,
  dimColor = false,
  subtitle,
}: LoadingStateProps): React.ReactNode {
  const text = message ?? label ?? 'Loading...';

  return (
    <Box flexDirection="column">
      <Box flexDirection="row">
        <Spinner />
        <Text bold={bold} dimColor={dimColor}>
          {' '}
          {text}
        </Text>
      </Box>
      {subtitle && <Text dimColor>{subtitle}</Text>}
    </Box>
  );
}
