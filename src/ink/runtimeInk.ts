/**
 * Local Ink engine — production adapter.
 *
 * All TUI components import from here. This file exports the local engine
 * primitives exclusively. The npm `ink` package is no longer on the live path.
 *
 * Boot chain:
 *   cli.tsx → main.tsx → replLauncher.tsx
 *   → src/ink/root.ts → src/ink/ink.tsx → src/ink/reconciler.ts
 */
export { default as Box }      from './components/Box.js'
export { default as Text }     from './components/Text.js'
export { default as Newline }  from './components/Newline.js'
export { default as Spacer }   from './components/Spacer.js'
export { default as useApp }   from './hooks/use-app.js'
export { default as useInput } from './hooks/use-input.js'
export { default as useStdin } from './hooks/use-stdin.js'
