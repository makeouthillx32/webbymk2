# Runtime Primitive Prep Report

Scope: runtime primitive cleanup plus the first queue integration. Virtual scroll
and keybinding runtime changes remain parked.

Run the current scan with:

```powershell
node scripts\runtime-prep-scan.mjs
```

## Current Files

| File | Classification | Notes |
| --- | --- | --- |
| `src/utils/execFileNoThrow.ts` | `ready` | Existing no-throw process helper. No donor cleanup needed. |
| `src/utils/gracefulShutdown.ts` | `ready` | Donor analytics/session code removed. Terminal cleanup primitive only. |
| `src/hooks/useVirtualScroll.ts` | `parked` | Valid import chain; not wired into the TUI. |
| `src/utils/messageQueueManager.ts` | `wired-ready` | Standalone priority queue with `now`, `next`, and `later`; now used by `useBackgroundOps`. |
| `src/utils/queueProcessor.ts` | `wired-ready` | Minimal idle-time queue drain helper. |
| `src/ink/hooks/useQueueProcessor.ts` | `wired-ready` | Ink-local React hook. Must live under `src/ink/` so `react` resolves to Ink's React 18 copy. |
| `src/utils/QueryGuard.ts` | `wired-ready` | Synchronous idle/running guard for the queue processor. |
| `src/utils/signal.ts` | `ready` | Small event signal helper; also used by existing keybinding loading code. |

## Pruned Files

| File | Reason |
| --- | --- |
| `src/ink/components/ScrollKeybindingHandler.tsx` | Broken donor-relative imports, embedded source map, no runtime consumer. |
| `src/utils/tasks.ts` | Donor agent/swarm task queue with missing helper imports. |
| `src/utils/activityManager.ts` | Telemetry/bootstrap-state dependency and no runtime consumer. |
| `src/utils/objectGroupBy.ts` | No remaining consumers after queue cleanup. |
| `src/types/textInputTypes.ts` | Temporary compatibility shim; no remaining consumers. |
| `src/hooks/useQueueProcessor.ts` | Root-level duplicate removed; React hooks used by Ink must not resolve the top-level React package. |

## Missing Files Not Present

The cron scheduler pair discussed in the handoff is not present in this repo:

- `src/utils/cronScheduler.ts`
- `src/hooks/useScheduledTasks.ts`

No cron prep was performed.

## Donor Cleanup Status

The current kept queue/shutdown primitives have zero matches for the donor scan
terms: Anthropic, Claude, agent, swarm, teammate, Datadog, analytics, telemetry,
model, prompt, completion, tengu, `bootstrap/state`, `services/analytics`, and
`getClaudeConfigHomeDir`.

## Integration Notes

- `gracefulShutdown.ts` is already referenced by `src/ink/App.tsx`.
- The queue is wired through `src/ink/hooks/useBackgroundOps.ts`.
- `src/ink/hooks/useQueueProcessor.ts` intentionally uses `useState`/`useEffect`
  subscriptions instead of `useSyncExternalStore` to avoid duplicate-React
  dispatcher crashes in the Ink tree.
- `useVirtualScroll.ts` remains parked because its imports resolve and it is a
  plausible later primitive, but it has no runtime consumer today. If it is
  wired into the Ink tree later, move/adapt it under `src/ink/hooks/` first so
  its React import resolves to the same React instance as Ink.
