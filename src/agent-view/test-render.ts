// src/agent-view/test-render.ts
// ─────────────────────────────────────────────────────────────────────────────
// Proof-of-concept: render a tiny component, confirm pipeline works,
// then render the real NpmPanel.
//
// Run: bun src/agent-view/test-render.ts
// ─────────────────────────────────────────────────────────────────────────────

import React                from '../ink/reactRuntime.js'
import { Box, Text }        from '../ink/runtimeInk.js'
import { renderToFrame }    from './renderToFrame.js'

// ── Test 1: tiny deterministic component ─────────────────────────────────────

const Hello = () =>
  React.createElement(Box, { flexDirection: 'column' },
    React.createElement(Text, { bold: true, color: 'cyan' }, 'UNAXIS agent-view'),
    React.createElement(Text, { dimColor: true }, 'render pipeline ok'),
  );

// ── Test 2: real NpmPanel (needs mock props / providers) ─────────────────────

async function main() {
  console.log('=== Test 1: tiny component ===');
  const t1 = await renderToFrame(React.createElement(Hello), { columns: 60, rows: 10 }, 'hello');
  console.log('text output:');
  console.log(t1.text);
  console.log(`renderMs: ${t1.renderMs}ms`);
  console.log('');

  console.log('=== Pipeline status ===');
  console.log(t1.text.includes('UNAXIS agent-view') ? '✓ text capture works' : '✗ text capture FAILED');
  console.log(t1.ansi.includes('\x1b[') ? '✓ ANSI capture works' : '✗ ANSI missing (check isTTY)');
  console.log(`✓ renderMs: ${t1.renderMs}ms`);
}

main().catch(console.error);
