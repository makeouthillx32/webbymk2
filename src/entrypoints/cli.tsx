// src/entrypoints/cli.tsx
// UNAXIS CLI fast-path entry.
// Handles --version and --help synchronously before any Ink/React import.
// Loads .env synchronously before booting the TUI so all process.env values
// are available when db-api and other modules initialize.

export {}

// Injected by build.ts via Bun.build define
declare const UNAXIS_VERSION: string

import { ensureRuntimeEnv } from '../utils/runtimeEnv.js'

const args = process.argv.slice(2)

// Fast-path flags

if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(UNAXIS_VERSION + '\n')
  process.exit(0)
}

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    '\n' +
    '  UNAXIS — unenter infrastructure manager\n' +
    '\n' +
    '  Usage:\n' +
    '    unaxis              launch the TUI\n' +
    '    unaxis --version    print version\n' +
    '    unaxis --help       show this message\n' +
    '\n'
  )
  process.exit(0)
}

// Early .env load before any bundled TUI modules can initialize their config.
ensureRuntimeEnv(true)

// Boot TUI
// Dynamic import: Ink/React/yoga-wasm-web only initialize when this line
// executes. Fast-path exits above never trigger the TUI load.
await import('../main.js')
