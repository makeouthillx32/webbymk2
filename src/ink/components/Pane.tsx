// Compatibility surface for older runtime imports.
// Canonical implementation lives in components/design-system/Pane.tsx.

import React from 'react';
import {
  Pane as DesignPane,
  type PaneProps as DesignPaneProps,
} from './design-system/Pane.js';

export interface PaneProps extends Omit<DesignPaneProps, 'color'> {
  color?: string;
}

export function Pane({ color, ...props }: PaneProps): React.ReactNode {
  return <DesignPane color={color as DesignPaneProps['color']} {...props} />;
}
