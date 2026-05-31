// src/ink/hooks/useProductionRestart.ts
// ─────────────────────────────────────────────────────────────────────────────
// Self-restart hook for the production `unaxis` binary.
//
// After a successful release, release.ts writes a signal file:
//   %APPDATA%\unaxis\pending-restart
//
// This hook polls for it every 3s — but ONLY in production mode (node running
// dist/cli.js). Dev mode (bun --watch) is excluded: bun handles hot-reload.
//
// On detection:
//   1. Delete the signal file
//   2. Spawn a new `node dist/cli.js` with stdio: 'inherit'  → inherits terminal
//   3. Call gracefulShutdownSync(0)  → restores terminal state, then exits
//   4. New process comes up in the clean terminal — TUI is back
//
// Result: pressing `r` in the dev TUI triggers a full release and the
// production Window 1 restarts itself. Zero keystrokes required.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect }                          from "react";
import { existsSync, unlinkSync }             from "fs";
import { join }                               from "path";
import { homedir }                            from "os";
import { spawn }                              from "child_process";
import { gracefulShutdownSync }               from "../../utils/gracefulShutdown.js";

// ── Signal file ───────────────────────────────────────────────────────────────
// release.ts writes this after a successful publish + global CLI update.

export const RESTART_SIGNAL_PATH = join(
  process.env["APPDATA"] ?? homedir(),
  "unaxis",
  "pending-restart",
);

// ── Mode detection ────────────────────────────────────────────────────────────
// Dev mode:        process.execPath → bun.exe  (bun --watch runs the source)
// Production mode: process.execPath → node.exe (node dist/cli.js)

const isProductionMode = !process.execPath.toLowerCase().includes("bun");

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useProductionRestart(): void {
  useEffect(() => {
    // Skip entirely in dev mode — bun --watch already handles restarts.
    if (!isProductionMode) return;

    const interval = setInterval(() => {
      if (!existsSync(RESTART_SIGNAL_PATH)) return;

      // Consume the signal immediately to avoid double-trigger on slow exits.
      try { unlinkSync(RESTART_SIGNAL_PATH); } catch { /* race: already gone */ }

      // Spawn the new version with the same executable + args.
      // stdio: 'inherit'  → child gets the same stdin/stdout/stderr (terminal)
      // detached: true    → child becomes independent; parent can exit freely
      // UNAXIS_RESTARTED  → lets the new process know it was auto-restarted
      const child = spawn(process.execPath, process.argv.slice(1), {
        stdio:    "inherit",
        detached: true,
        cwd:      process.cwd(),
        env:      { ...process.env, UNAXIS_RESTARTED: "1" },
      });
      child.unref(); // parent exit does not kill child

      // gracefulShutdownSync: unmounts Ink, restores terminal (alt-screen,
      // cursor, raw mode), then calls process.exit(0). By the time the child
      // process boots and starts rendering, the terminal is fully restored.
      gracefulShutdownSync(0);

    }, 3_000);

    return () => clearInterval(interval);
  }, []);
}
