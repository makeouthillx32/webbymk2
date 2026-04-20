import figures from 'figures';
import React from 'react';
import { Text } from 'ink';

type Status = 'success' | 'error' | 'warning' | 'info' | 'pending' | 'loading';

type Props = {
  /**
   * The status to display. Determines both the icon and color.
   */
  status: Status;
  /**
   * Include a trailing space after the icon. Useful when followed by text.
   * @default false
   */
  withSpace?: boolean;
};

const STATUS_CONFIG: Record<
  Status,
  {
    icon: string;
    color: 'success' | 'error' | 'warning' | 'suggestion' | undefined;
  }
> = {
  success: { icon: figures.tick, color: 'success' },
  error: { icon: figures.cross, color: 'error' },
  warning: { icon: figures.warning, color: 'warning' },
  info: { icon: figures.info, color: 'suggestion' },
  pending: { icon: figures.circle, color: undefined },
  loading: { icon: '…', color: undefined },
};

/**
 * Renders a status indicator icon with appropriate color.
 */
export function StatusIcon({
  status,
  withSpace = false,
}: Props): React.ReactNode {
  const config = STATUS_CONFIG[status];

  return (
    <Text color={config.color} dimColor={!config.color}>
      {config.icon}
      {withSpace && ' '}
    </Text>
  );
}