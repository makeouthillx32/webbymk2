#!/usr/bin/env bun
// src/ink/build.ts
// ─────────────────────────────────────────────────────────────────────────────
// Bundles UNAXIS into a single Node-compatible dist/cli.js.
//
// Entry:   src/entrypoints/cli.tsx   (fast-path flags + TUI boot)
//   via:   src/main.tsx              (runtime bootstrap / rootGuard)
//   via:   src/ink/App.tsx           (Ink render layer)
//
// Output:  src/ink/dist/cli.js       (shebang-prefixed, ESM)
//
// yoga-wasm-web is kept external so it resolves from node_modules at
// runtime — avoids inlining raw WASM bytes into the bundle.
//
// Build:   bun build.ts              (from src/ink/)
// Run:     node src/ink/dist/cli.js  (from project root)
// Global:  npm install -g @untsystems/unaxis
// ─────────────────────────────────────────────────────────────────────────────

import { rmSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join }                                           from 'path'
import { makeBuildConfig, outdir, outfile }               from './bun-build-config.js'

// ── Version ────────────────────────────────────────────────────────────────────

const pkgJson  = JSON.parse(readFileSync(join(import.meta.dir, 'package.json'), 'utf-8'))
const version  = pkgJson.version as string

// ── Clean ──────────────────────────────────────────────────────────────────────

try { rmSync(outdir, { recursive: true }) } catch {}
mkdirSync(outdir, { recursive: true })

console.log('⚙  Bundling UNAXIS v' + version + '...')

// ── Bundle ─────────────────────────────────────────────────────────────────────

const result = await Bun.build(makeBuildConfig(version))

if (!result.success) {
  console.error('✗  Build failed:')
  for (const log of result.logs) console.error('  ', log)
  process.exit(1)
}

// ── Inject shebang ─────────────────────────────────────────────────────────────
// npm creates platform wrappers on install, but the shebang ensures the file
// is directly executable on Unix and works with `node dist/cli.js` on Windows.

const bundled = readFileSync(outfile, 'utf-8')
if (!bundled.startsWith('#!')) {
  writeFileSync(outfile, '#!/usr/bin/env node\n' + bundled)
}

// ── Report ─────────────────────────────────────────────────────────────────────

const bytes = readFileSync(outfile).length
const kb    = (bytes / 1024).toFixed(0)

console.log('✓  dist/cli.js  (' + kb + ' KB)  UNAXIS v' + version)
console.log('')
console.log('   Run locally:   node ./src/ink/dist/cli.js')
console.log('   Publish:       npm publish --access public  (from src/ink/)')
console.log('')
