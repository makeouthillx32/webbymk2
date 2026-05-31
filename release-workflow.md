# UNAXIS Release Workflow

Current state as of v0.0.x — three windows, manual steps.

---

## Windows

| # | Terminal | What runs |
|---|----------|-----------|
| 0 | Dev TUI (bun --watch) | Live-reloading source — press `r` here to release |
| 1 | Docker Desktop terminal | Production `unaxis` binary |
| 2 | Other PowerShell | npm global install |

---

## Steps

### 1. Trigger the release (Window 0)
Press `r` in the dev TUI.

Builds `dist/cli.js`, bumps `package.json`, publishes to npm, then runs:
```
npm install -g @untsystems/unaxis@latest
```

> **Known issue:** the auto-install does not always take effect on P0WER before the binary restarts. Window 2 is still required to confirm the update lands.

---

### 2. Update global CLI (Window 2)
```
↑  Enter
```
Runs: `npm install -g @untsystems/unaxis@latest`

Wait for the `changed N packages` confirmation before touching Window 1.

---

### 3. Restart production TUI (Window 1)
```
q  →  Ctrl+C  →  ↑  →  Enter
```

Quits the running `unaxis`, clears it, re-launches with the new binary.

---

## Goal State (not yet reached)

Once `npm install -g @latest` reliably runs before the binary needs to restart:

1. Window 0 — press `r`
2. Window 1 — press `R` on the startup screen (self-restart, one key)
3. Window 2 — gone entirely

The `R` key on the startup screen is already in the codebase, ships with the next working auto-install release.

---

## Notes

- `npm update -g` was tried and removed — it respects semver ranges and skips newly published versions. `install -g @latest` is the correct command.
- Self-restart via signal file was tried and reverted — unreliable across TUI restarts.
- The `R` key is only shown in production mode (`isProductionMode` guard) so it does not appear in the dev TUI.
