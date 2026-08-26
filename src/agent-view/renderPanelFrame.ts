// src/agent-view/renderPanelFrame.ts
// ─────────────────────────────────────────────────────────────────────────────
// Agent-facing wrapper around renderToFrame. Returns a clean text frame
// with structured metadata — ready for agent consumption or snapshot saving.
//
// Usage:
//   import { renderPanelFrame } from './renderPanelFrame.ts'
//   const result = await renderPanelFrame('infra-dns', infraElement)
//   console.log(result.text)
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from 'react'
import { renderToFrame, type FrameSize } from './renderToFrame.js'

export type PanelFrameResult = {
  text:      string;
  ansi:      string;
  lines:     string[];
  metadata: {
    label:         string;
    componentName: string;
    width:         number;
    height:        number;
    renderMs:      number;
    timestamp:     string;
  };
};

export async function renderPanelFrame(
  label:         string,
  node:          ReactNode,
  componentName: string,
  size:          FrameSize = { columns: 120, rows: 40 },
): Promise<PanelFrameResult> {
  const frame = await renderToFrame(node, size, label);
  return {
    text:  frame.text,
    ansi:  frame.ansi,
    lines: frame.lines,
    metadata: {
      label,
      componentName,
      width:     size.columns,
      height:    size.rows,
      renderMs:  frame.renderMs,
      timestamp: frame.timestamp,
    },
  };
}
