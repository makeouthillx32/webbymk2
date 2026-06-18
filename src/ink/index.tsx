// src/ink/index.tsx — TOMBSTONED (legacy npm-ink debug shell)
//
// This file was the original TUI shell that called `render` from npm `ink`
// directly. It is no longer on any boot path.
//
// The active boot chain is:
//   src/entrypoints/cli.tsx → src/main.tsx → src/replLauncher.tsx
//   → src/ink/root.ts → src/ink/ink.tsx (local engine)
//
// The TuiMain component has been superseded by src/ink/App.tsx +
// src/ink/AppProviders.tsx + src/ink/AppShell.tsx.
export {}
