import figures from 'figures';
import React from 'react';
import ThemedText from './ThemedText.js';

type CoreStatus = 'success' | 'error' | 'warning' | 'info' | 'pending' | 'loading';
type RuntimeStatus = 'running' | 'restarting' | 'checking' | 'missing';

export type IconStatus = CoreStatus | RuntimeStatus;

export type StatusIconProps = {
  /**
   * The status to display. Determines both the icon and color.
   */
  status: IconStatus;
  /**
   * Include a trailing space after the icon.
   */
  withSpace?: boolean;
  /**
   * Backward-compatible alias used by older TUI components.
   */
  pad?: boolean;
};

const STATUS_CONFIG: Record<
  IconStatus,
  {
    icon: string;
    color: 'success' | 'error' | 'warning' | 'suggestion' | 'inactive' | undefined;
  }
> = {
  success: { icon: figures.tick, color: 'success' },
  error: { icon: figures.cross, color: 'error' },
  warning: { icon: figures.warning, color: 'warning' },
  info: { icon: figures.info, color: 'suggestion' },
  pending: { icon: figures.circle, color: 'inactive' },
  loading: { icon: '...', color: undefined },
  running: { icon: figures.circle, color: 'success' },
  restarting: { icon: figures.circle, color: 'warning' },
  checking: { icon: '...', color: 'warning' },
  missing: { icon: figures.circle, color: 'inactive' },
};

/**
 * Renders a compact status indicator for Unaxis runtime state.
 */
export function StatusIcon({
  status,
  withSpace = false,
  pad,
}: StatusIconProps): React.ReactNode {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const shouldPad = withSpace || pad || false;

  return (
    <ThemedText color={config.color} dimColor={!config.color}>
      {config.icon}
      {shouldPad && ' '}
    </ThemedText>
  );
}
