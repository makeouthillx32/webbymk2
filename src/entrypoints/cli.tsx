// src/entrypoints/cli.tsx — unt.ink TUI entrypoint
// ─────────────────────────────────────────────────────────────────────────────
// Thin delegator to the self-contained TUI package at src/ink/.
//
// render() is intentionally NOT called here. The ink package (v4.4.1) and
// React 18 live in src/ink/node_modules/ — isolated from the main app which
// uses React 19. Keeping the render() call inside src/ink/ ensures Bun and
// Node resolve the correct versions.
//
// Import chain:
//   src/cli.ts
//     → src/entrypoints/cli.tsx       (this file — routing layer)
//       → src/ink/App.tsx             (React state machine / UI + render())
//
// Dev:    bun --tsconfig-override ./src/ink/tsconfig.json --watch ./src/cli.ts
// Build:  cd src/ink && bun build.ts
// ─────────────────────────────────────────────────────────────────────────────

import "../ink/App.tsx";
