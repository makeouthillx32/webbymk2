# CLAUDE.md — src/ink (UNAXIS TUI)

Package `@untsystems/unaxis` — the UNAXIS terminal UI and a **local Ink engine** (custom React reconciler + yoga-wasm-web layout). This is not stock Ink; engine internals live here (`engine.ts`, `runtimeInk.ts`, `renderer.ts`, `render-to-screen.ts`, yoga layout, `AppShell`, `AlternateScreen`).

**Always load the `cli-framework-oclif-ink` skill before working here** — it covers panels, screens, commands, hooks, keyboard handlers, layout pitfalls, and smoke tests. For running/deploying zones from the TUI, load `unaxis-operator`.

## Commands (run from `src/ink/`, or via root `bun run tui:*`)

- `bun run dev` — watch mode against `../main.tsx`
- `bun build.ts` — build to `dist/cli.js` (bin: `unaxis`)
- `bun engine-smoke.tsx` — engine smoke test; run after touching engine internals
- `node dist/cli.js` — start built TUI

## Ground rules

- React pinned at **18.3.1**; the reconciler depends on it — don't bump casually.
- **Never `import ... from "react"` directly.** All React imports go through the single re-export (`runtimeInk.ts` → reactRuntime). The root project uses React 19; a direct import bundles two React instances and crashes the reconciler (`ReactCurrentBatchConfig` undefined). This shipped broken once — see `vault/TUI/cli-release-engineering-and-bundling.md`.
- ESM, Bun-built. `tsconfig.json` here overrides root; `ink` path alias points at the local build shim.
- Keep IPC/CLI surface in sync when adding commands: `cli-schema.ts` + `hooks/useIpcBridge.ts` together.
- Zone operations flow through `zone-ops.ts` / `zone-pipeline.ts` / `zone-store.ts` — don't shell out to docker directly.
- Status docs: `APP_MIGRATION.md`, `ENGINE_STATUS.md` in this folder.

## Layout rules (the yoga height chain)

- **Never pass terminal height as a yoga `height` prop** in the app-shell hierarchy (AlternateScreen, AppShell, wrappers). It triggers a flex-shrink cascade → descendant rows floor to height 0 → the zero-height guard silently skips whole subtrees → blank panels with no errors.
- `useTermHeight()` is for **windowing logic only** (`listRows = termHeight - CHROME_ROWS` inside a panel), never as a Box layout constraint.
- The screen buffer clips at `terminalRows` (`setCellAt` drops `y >= screen.height`); yoga computes natural heights. Two different jobs — don't merge them.
- The layout wrapper `layout/yoga.ts` must forward the height param to `calculateLayout` (it once silently discarded it — that was the true root cause behind the blank-panel era).
- Full history: `vault/Architecture/key-decisions.md`, `vault/TUI/fix-yoga-height-chain.md`.

## Build & release

- `bun-build-config.ts` is the **single source of truth** for `Bun.build()` config — `build.ts` and `release.ts` both import `makeBuildConfig()`. Never fork the config; drift here shipped a dual-React crash to npm.
- A build/publish is not done until the smoke test passes: `npm update -g @untsystems/unaxis` then launch `unaxis`. The bundle must also run under **Node** (Bun has produced malformed bundles that Bun tolerated but Node rejected — a known release blocker on Bun 1.3.11).
- Version fast-path flags: `-version`, `--version`, `-v`, and the `version` command all work.
