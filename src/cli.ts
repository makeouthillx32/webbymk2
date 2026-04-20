// src/cli.ts — unt.ink top-level CLI entry point
// ─────────────────────────────────────────────────────────────────────────────
// Routes to the TUI via the entrypoints layer.
// render() stays inside src/ink/ where ink@4.4.1 is isolated.
//
// Import chain:
//   src/cli.ts                           (this file — outermost entry)
//     → src/entrypoints/cli.tsx          (routing layer)
//       → src/ink/App.tsx                (React state machine / UI + render())
//
// Dev:    bun --tsconfig-override ./src/ink/tsconfig.json --watch ./src/cli.ts
// Build:  cd src/ink && bun build.ts
// ─────────────────────────────────────────────────────────────────────────────

import "./entrypoints/cli.tsx";
