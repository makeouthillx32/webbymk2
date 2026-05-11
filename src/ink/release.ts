#!/usr/bin/env bun
// src/ink/release.ts
// ─────────────────────────────────────────────────────────────────────────────
// UNAXIS release script — build + auto-bump + optional npm publish.
//
// Workflow:
//   1. Read current version from package.json  (e.g. 0.0.5)
//   2. Build dist/cli.js with that version      (becomes prod)
//   3. Bump package.json to next patch          (e.g. 0.0.6)
//   4. (optional) npm publish --access public   (if --publish flag used)
//
// Install on any machine after publishing:
//   npm install -g @untsystems/unaxis
//
// Update on any machine:
//   npm update -g @untsystems/unaxis
//
// Usage:
//   bun release.ts             # build + bump (local only)
//   bun release.ts --publish   # build + bump + push to npm
//   bun release.ts --minor     # minor bump   (0.0.5 → 0.1.0)
//   bun release.ts --major     # major bump   (0.0.5 → 1.0.0)
//   bun release.ts --dry       # preview only, no writes
// ─────────────────────────────────────────────────────────────────────────────

import { rmSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join }                                           from 'path'
import { spawnSync }                                      from 'child_process'

// ── Args ───────────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2)
const dry     = args.includes('--dry')
const publish = args.includes('--publish')
const minor   = args.includes('--minor')
const major   = args.includes('--major')

// ── Version helpers ────────────────────────────────────────────────────────────

function parseSemver(v: string): [number, number, number] {
  const [maj, min, pat] = v.replace(/^v/, '').split('.').map(Number)
  return [maj ?? 0, min ?? 0, pat ?? 0]
}

function bumpVersion(current: string, kind: 'patch' | 'minor' | 'major'): string {
  const [maj, min, pat] = parseSemver(current)
  if (kind === 'major') return `${maj + 1}.0.0`
  if (kind === 'minor') return `${maj}.${min + 1}.0`
  return `${maj}.${min}.${pat + 1}`
}

// ── Paths ──────────────────────────────────────────────────────────────────────

const pkgPath  = join(import.meta.dir, 'package.json')
const outdir   = join(import.meta.dir, 'dist')
const outfile  = join(outdir, 'cli.js')
const entry    = join(import.meta.dir, '../entrypoints/cli.tsx')

// ── Load current version ───────────────────────────────────────────────────────

const pkg     = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const current = pkg.version as string
const kind    = major ? 'major' : minor ? 'minor' : 'patch'
const next    = bumpVersion(current, kind)

console.log('')
console.log('  UNAXIS release')
console.log('  ──────────────────────────────────────────────────')
console.log('  Releasing:  v' + current)
console.log('  Next dev:   v' + next)
console.log('  Publish:    ' + (publish ? 'YES — npm publish --access public' : 'no  (local only)'))
console.log('  Mode:       ' + (dry ? 'DRY RUN — no writes' : 'live'))
console.log('')

if (dry) {
  console.log('  [dry] would build dist/cli.js  UNAXIS_VERSION=' + current)
  console.log('  [dry] would bump package.json to v' + next)
  if (publish) {
    console.log('  [dry] would run: npm publish --access public')
  }
  console.log('')
  console.log('  Install anywhere after publish:')
  console.log('    npm install -g @untsystems/unaxis')
  console.log('')
  process.exit(0)
}

// ── Build ──────────────────────────────────────────────────────────────────────

try { rmSync(outdir, { recursive: true }) } catch {}
mkdirSync(outdir, { recursive: true })

console.log('  Bundling...')

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
  define: {
    'process.env.NODE_ENV': '"production"',
    'UNAXIS_VERSION':       '"' + current + '"',
  },
})

if (!result.success) {
  console.error('  Build failed:')
  for (const log of result.logs) console.error('    ', log)
  process.exit(1)
}

// Inject shebang
const bundled = readFileSync(outfile, 'utf-8')
if (!bundled.startsWith('#!')) {
  writeFileSync(outfile, '#!/usr/bin/env node\n' + bundled)
}

const kb = (readFileSync(outfile).length / 1024).toFixed(0)
console.log('  Built:      dist/cli.js (' + kb + ' KB)')

// ── Bump package.json ──────────────────────────────────────────────────────────

pkg.version = next
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
console.log('  Bumped:     package.json → v' + next)

// ── Publish to npm ─────────────────────────────────────────────────────────────

if (publish) {
  console.log('')
  console.log('  Publishing v' + current + ' to npm...')

  // Temporarily write the release version for publish (package.json is now next)
  // So we publish from a temp state with the correct version
  const publishPkg = { ...pkg, version: current }
  writeFileSync(pkgPath, JSON.stringify(publishPkg, null, 2) + '\n')

  const npmResult = spawnSync('npm', ['publish', '--access', 'public'], {
    cwd:   import.meta.dir,
    stdio: 'inherit',
    shell: true,
  })

  // Restore bumped version regardless of publish outcome
  pkg.version = next
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  if (npmResult.status !== 0) {
    console.error('')
    console.error('  npm publish failed (see above).')
    console.error('  dist/cli.js and package.json are still updated locally.')
    console.error('')
    console.error('  To retry publish manually:')
    console.error('    cd src/ink')
    console.error('    npm version ' + current + ' --no-git-tag-version')
    console.error('    npm publish --access public')
    console.error('    npm version ' + next + ' --no-git-tag-version')
    process.exit(1)
  }

  console.log('')
  console.log('  Published:  @untsystems/unaxis@' + current + ' on npm')
}

// ── Done ───────────────────────────────────────────────────────────────────────

console.log('')
console.log('  Done.')
console.log('  Released:   UNAXIS v' + current)
console.log('  Dev now:    v' + next + '  (package.json bumped)')
console.log('')

if (publish) {
  console.log('  Install on any machine:')
  console.log('    npm install -g @untsystems/unaxis')
  console.log('')
  console.log('  Update on any machine:')
  console.log('    npm update -g @untsystems/unaxis')
} else {
  console.log('  To push to npm next time:')
  console.log('    bun release.ts --publish')
}

console.log('')
