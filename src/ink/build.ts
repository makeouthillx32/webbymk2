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

// ── Version ────────────────────────────────────────────────────────────────────

const pkgJson  = JSON.parse(readFileSync(join(import.meta.dir, 'package.json'), 'utf-8'))
const version  = pkgJson.version as string

// ── Paths ──────────────────────────────────────────────────────────────────────

const outdir   = join(import.meta.dir, 'dist')
const outfile  = join(outdir, 'cli.js')
const entry    = join(import.meta.dir, '../entrypoints/cli.tsx')

const tuiNodeModules = join(import.meta.dir, 'node_modules')
const tuiInkBuild    = join(tuiNodeModules, 'ink', 'build')

// ── Clean ──────────────────────────────────────────────────────────────────────

try { rmSync(outdir, { recursive: true }) } catch {}
mkdirSync(outdir, { recursive: true })

console.log('\u2699  Bundling UNAXIS v' + version + '...')

// ── Bundle ─────────────────────────────────────────────────────────────────────

const result = await Bun.build({
  entrypoints: [entry],
  outdir,
  naming:      'cli.js',
  target:      'node',
  format:      'esm',
  bundle:      true,
  minify:      false,
  sourcemap:   'none',
  external:    ['yoga-wasm-web'],
  plugins: [
    {
      name: 'unaxis-tui-runtime-aliases',
      setup(builder) {
        builder.onResolve({ filter: /^ink$/ }, () => ({
          path: join(tuiInkBuild, 'index.js'),
        }))
        builder.onResolve({ filter: /^ink\/(.+)$/ }, ({ path }) => ({
          path: join(tuiInkBuild, path.slice('ink/'.length)),
        }))
        builder.onResolve({ filter: /^react$/ }, () => ({
          path: join(tuiNodeModules, 'react', 'index.js'),
        }))
        builder.onResolve({ filter: /^react\/(.+)$/ }, ({ path }) => ({
          path: join(tuiNodeModules, 'react', path.slice('react/'.length) + '.js'),
        }))
        builder.onResolve({ filter: /^react-dom$/ }, () => ({
          path: join(tuiNodeModules, 'react-dom', 'index.js'),
        }))
        builder.onResolve({ filter: /^react-dom\/(.+)$/ }, ({ path }) => ({
          path: join(tuiNodeModules, 'react-dom', path.slice('react-dom/'.length) + '.js'),
        }))
      },
    },
  ],
  define: {
    'process.env.NODE_ENV': '"production"',
    'UNAXIS_VERSION':       '"' + version + '"',
  },
})

if (!result.success) {
  console.error('\u2717  Build failed:')
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

console.log('\u2713  dist/cli.js  (' + kb + ' KB)  UNAXIS v' + version)
console.log('')
console.log('   Run locally:   node ./src/ink/dist/cli.js')
console.log('   Publish:       npm publish --access public  (from src/ink/)')
console.log('')
