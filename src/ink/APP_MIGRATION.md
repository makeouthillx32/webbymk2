# App Layer Migration

This file documents the reversible migration from a self-rendering
`src/ink/App.tsx` into explicit boot and provider layers.

## Current Production Flow

```text
src/main.tsx
  -> src/replLauncher.tsx
    -> src/interactiveHelpers.tsx
      -> npm ink render(...)
      -> src/ink/AppProviders.tsx
        -> src/ink/App.tsx
          -> src/ink/AppFrame.tsx
            -> src/ink/AppRoutes.tsx
```

## Ownership

- `App.tsx` owns the React TUI state machine and routed view bodies.
- `AppFrame.tsx` owns the terminal frame, startup gate, overlay gate, stack
  manager gate, wizard gate, and `AppShell` chrome.
- `AppRoutes.tsx` owns the view-to-screen mapping and per-route prop wiring.
- `AppProviders.tsx` owns cross-cutting React providers.
- `replLauncher.tsx` owns runtime assembly and renderer selection.
- `interactiveHelpers.tsx` owns production npm Ink rendering.
- `AppBoot.tsx` remains a reversible fallback boot wrapper.

## App Hooks

- `hooks/useIpcBridge.ts` owns the local CLI/agent IPC bridge plus startup proxy
  reconciliation.
- `hooks/useOperationChrome.ts` owns overlay and background stack state
  transitions.
- `hooks/useGlobalAppInput.ts` owns root-level keyboard shortcuts.
- `hooks/useDevBuildActions.ts` owns local build/release operation launchers.

## Local Preview

`launchRepl({ engine: 'local-preview' })` or `UNAXIS_LOCAL_INK_RUNTIME=1`
routes the same assembled tree through the local Ink engine. This is opt-in;
production remains on npm Ink.

## Reversal

To return to the previous shape:

1. Move the `render(<AppProviders><App /></AppProviders>, ...)` call from
   `AppBoot.tsx` back to the bottom of `App.tsx`.
2. Move the provider wrapper from `AppProviders.tsx` back inline.
3. Change `src/main.tsx` to import `./ink/AppBoot.tsx` again, or restore the
   older direct `./ink/App.tsx` import if the render call has been moved back.
4. Move the route JSX from `AppRoutes.tsx` back into `App.tsx` only if the
   App/routes split needs to be reversed.
5. Move the frame JSX from `AppFrame.tsx` back into `App.tsx` only if the
   App/frame split itself needs to be reversed.
6. Move the extracted hook bodies back into `App.tsx` only if a hook boundary
   needs to be reversed.
7. Delete `AppBoot.tsx`, `AppProviders.tsx`, and the `launchRepl()` boot call
   only after the render call has been restored elsewhere.

Only screen imports that directly touched npm Ink were canonicalized to the
Unaxis runtime adapter; their behavior stays on npm Ink unless local preview is
explicitly enabled.
