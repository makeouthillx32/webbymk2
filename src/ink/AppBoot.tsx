// src/ink/AppBoot.tsx — TOMBSTONED
//
// The npm `ink` boot path is no longer used.
// The TUI now boots exclusively through:
//   src/entrypoints/cli.tsx → src/main.tsx → src/replLauncher.tsx
//   → src/ink/root.ts (local Ink engine)
//
// This file is kept as an empty export to avoid import errors from any
// stale reference that hasn't been cleaned up yet.
export {}
