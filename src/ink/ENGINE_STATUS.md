# Unaxis Local Ink Engine Status

The local Ink engine is a renderer/runtime lab for Unaxis. It is not connected
to production boot.

Current production boot remains:

```text
src/main.tsx -> src/ink/App.tsx -> npm ink
```

Local engine entry points:

```text
src/ink/root.ts
src/ink/ink.tsx
src/ink/reconciler.ts
src/ink/renderer.ts
src/ink/layout/yoga.ts
```

Smoke harness:

```text
cd src/ink
bun run engine:smoke
```

Covered now:

- local `Box` / `Text` primitives
- npm Ink `Box` / `Text` compatibility
- Unaxis design-system components (`ProgressBar`, `ThemeProvider`,
  `MetricCard`)
- rerender behavior through the local `Instance.rerender()` path
- resize/frame redraw behavior with a custom stdout
- alternate-screen enter/exit terminal sequences through `TerminalWriteProvider`
- custom stdout/stdin render targets
- startup progress writes through the render stdout
- terminal side-effect hooks (`useTerminalNotification`, `useTabStatus`)
- terminal title hook behavior through the detached render surface
- selection/search hook compatibility surface plus renderer overlays
- static Unaxis production surfaces rendered without boot wiring:
  `ActionPanel`, `ZonesView`, `CoreView`, `DetachedStack`, `AppShell`, and
  `OperationOverlay`
- controlled mouse dispatch smoke for hover, click, and selection-change paths
- hook-level `useBackgroundOps` smoke with an in-memory fake operation,
  including both busy and final done output
- live local `useInput` smoke with synthetic stdin
- local DOM-style keyboard dispatch through a focused `Box onKeyDown` with
  synthetic stdin
- local focus traversal smoke for `Box tabIndex`, `onFocus`, and default Tab
  movement
- live stdin mouse dispatch through mounted React input, including alt-screen
  mouse tracking, hover, press, release, and `onClick` routing
- canonical runtime import boundary for Unaxis TUI leaf components and panels:
  production still uses npm Ink through `runtimeInk.ts`, while only boot/adapter
  files import `ink` directly
- local `Box` ref forwarding for mounted DOM-node access
- mounted-element search scanning through `scanElementSubtree`, using the
  current rendered screen region for the target node
- detached `runtimeInk.ts` preview switch via `UNAXIS_LOCAL_INK_RUNTIME=1`;
  default remains npm Ink, while smoke can exercise local primitives/hooks
- detached local-runtime active input smoke for `DetachedStack`
- detached local-runtime active input smoke for `ZonesView`
- detached local-runtime active input smoke for `CoreView`
- detached local-runtime active input smoke for `OperationOverlay`
- detached local-runtime active input smoke for nested Env `ContainersView`

Important fixes made:

- `AlternateScreen` now resolves the local Ink instance from the render
  context's stdout instead of hard-coding `process.stdout`.
- `use-selection` and `use-search-highlight` now resolve the local Ink instance
  from the render context's stdout.
- `useTermWidth`, `useTermHeight`, and `useWidths` now subscribe to the render
  context's stdout instead of a global `process.stdout` singleton.
- `StartupScreen` now writes progress sequences to the render context's stdout.
- `useCopyOnSelect` now uses `TerminalWriteContext` for the OSC 52 fallback
  instead of writing directly to `process.stdout`.
- The local `Ink` class now exposes the selection/search methods expected by
  Unaxis hooks.
- Selection and search highlights are applied as post-render screen overlays.
  The next frame is marked contaminated so stale overlay cells are not blitted
  forward after a clear/change.
- The local `Ink` class now routes drag selection, multiclick selection,
  DOM click dispatch, hover dispatch, and OSC 8 hyperlink lookup through the
  local root/screen state.
- The local reconciler now keeps event handler props in `_eventHandlers`
  instead of treating them as plain attributes.
- The local `Ink` class now dispatches parsed keyboard events through the
  focused DOM node and handles default Tab focus movement.
- The local `Ink` class now resolves rendered positions for mounted element
  search scans instead of returning an empty compatibility stub.
- Local `Box` now forwards refs to the underlying DOM node, enabling search,
  focus, and future mounted-node harnesses to inspect real local engine nodes.
- The local root `App` owns one balanced raw-mode/readable stdin subscription,
  so DOM `onKeyDown` handlers work even when no legacy `useInput` hook is
  mounted.
- `src/ink/engine.ts` now exports the broader local engine surface needed by
  detached Unaxis tests: controls, events, focus primitives, terminal hooks,
  selection hooks, and sizing hooks.
- `runtimeInk.ts` now has a detached preview switch. With
  `UNAXIS_LOCAL_INK_RUNTIME=1`, canonicalized Unaxis leaf components use local
  `Box`, `Text`, `useInput`, `useApp`, `useStdin`, `Newline`, and `Spacer` in
  smoke harnesses. Without the flag, they stay on npm Ink for production.
- The smoke harness can mark cases as local-runtime-only, so production-safe
  default smoke and local-engine preview smoke can be verified separately.
- The smoke harness runs against the isolated TUI dependency set under
  `src/ink/node_modules`.

Current import boundary:

- Production boot still renders through npm `ink`.
- Unaxis TUI leaf components and panels import through `runtimeInk.ts`.
- `runtimeInk.ts` defaults to npm Ink so the live TUI stays on the known-good
  production engine. Its local-engine mode is opt-in through
  `UNAXIS_LOCAL_INK_RUNTIME=1` and has only been exercised by detached smoke.
- Only live boot/entry compatibility files should import npm `ink` directly:
  `src/ink/App.tsx`, `src/ink/index.tsx`, `runtimeInk.ts`, and the smoke
  comparison case.
- Active keybinding flows in production panels are now import-canonicalized and
  have detached local-runtime coverage for `DetachedStack`, `ZonesView`,
  `CoreView`, `OperationOverlay`, and nested Env `ContainersView`, but
  production boot still has not been wired to the local engine.

Not covered yet:

- full `src/ink/App.tsx`
- production boot wiring
- full production panel keybinding flows
- active keybinding flows inside full-frame panels
- shutdown cleanup still intentionally targets process-level stdout/stdin

Next safe engine targets:

1. Replace remaining process-level shutdown assumptions only when a local
   engine preview path exists.
2. Only after those pass, consider a launcher flag for local-engine preview.
