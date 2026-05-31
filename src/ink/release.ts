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

import { rmSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync, mkdtempSync, writeSync, existsSync } from 'fs'
import { join }                                                        from 'path'
import { tmpdir, homedir }                                             from 'os'
import { spawnSync }                                                   from 'child_process'
import { resolveNpmToken }                                             from '../utils/secureStorage/index.js'
import { makeBuildConfig, outdir, outfile }                            from './bun-build-config.js'

// ── I/O helpers ────────────────────────────────────────────────────────────────
// Bun buffers process.stdout when running as a piped child process (non-TTY).
// Buffered output never arrives in the TUI's onLine handler until the process
// exits — which it never does if npm publish blocks on stdin.  Using writeSync
// on the raw file descriptor bypasses Bun's FileSink buffer entirely.

const print = (msg: string) => writeSync(1, msg + '\n')
const printerr = (msg: string) => writeSync(2, msg + '\n')

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

const pkgPath = join(import.meta.dir, 'package.json')

// ── Load current version ───────────────────────────────────────────────────────

const pkg     = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const current = pkg.version as string
const kind    = major ? 'major' : minor ? 'minor' : 'patch'
const next    = bumpVersion(current, kind)

print('')
print('  UNAXIS release')
print('  ──────────────────────────────────────────────────')
print('  Releasing:  v' + current)
print('  Next dev:   v' + next)
print('  Publish:    ' + (publish ? 'YES — npm publish --access public' : 'no  (local only)'))
print('  Mode:       ' + (dry ? 'DRY RUN — no writes' : 'live'))
print('')

if (dry) {
  print('  [dry] would build dist/cli.js  UNAXIS_VERSION=' + current)
  print('  [dry] would bump package.json to v' + next)
  if (publish) {
    print('  [dry] would run: npm publish --access public')
  }
  print('')
  print('  Install anywhere after publish:')
  print('    npm install -g @untsystems/unaxis')
  print('')
  process.exit(0)
}

// ── Build ──────────────────────────────────────────────────────────────────────

try { rmSync(outdir, { recursive: true }) } catch {}
mkdirSync(outdir, { recursive: true })

print('  Bundling...')

const result = await Bun.build(makeBuildConfig(current))

if (!result.success) {
  printerr('  Build failed:')
  for (const log of result.logs) printerr('    ' + String(log))
  process.exit(1)
}

// Inject shebang
const bundled = readFileSync(outfile, 'utf-8')
if (!bundled.startsWith('#!')) {
  writeFileSync(outfile, '#!/usr/bin/env node\n' + bundled)
}

const kb = (readFileSync(outfile).length / 1024).toFixed(0)
print('  Built:      dist/cli.js (' + kb + ' KB)')

// ── Bump package.json ──────────────────────────────────────────────────────────

pkg.version = next
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
print('  Bumped:     package.json → v' + next)

// ── Publish to npm ─────────────────────────────────────────────────────────────

if (publish) {
  print('')
  print('  Publishing v' + current + ' to npm...')

  // Resolve npm token: env var override -> credential store.
  // Priority: NPM_TOKEN / NPM_AUTH_TOKEN env → ~/.unaxis/.credentials.json
  const npmToken = await resolveNpmToken()

  if (!npmToken) {
    // Check if npm global config has a token already (user may have `npm login`'d)
    // If not, fail fast with clear guidance rather than letting npm error cryptically.
    const whoami = spawnSync('npm', ['whoami'], { stdio: 'pipe', shell: true, timeout: 8000 })
    const loggedIn = whoami.status === 0 && !whoami.error
    if (!loggedIn) {
      printerr('')
      printerr('  ✗ No npm token found and not logged in to npm.')
      if (whoami.error) printerr('  (npm whoami timed out or failed: ' + whoami.error.message + ')')
      printerr('')
      printerr('  To fix, do one of:')
      printerr('    1. Store a token (recommended):')
      printerr('         Open settings → identity tab → press [n] to paste npm token')
      printerr('       Get a token at: https://www.npmjs.com/settings/<user>/tokens')
      printerr('       Use a Classic token with "Automation" type to bypass 2FA.')
      printerr('')
      printerr('    2. Set an env var for this session:')
      printerr('         NPM_TOKEN=<token> bun release.ts --publish')
      printerr('')
      printerr('    3. Log in globally (prompts for credentials):')
      printerr('         npm login')
      printerr('')
      process.exit(1)
    }
  }

  // Temporarily write the release version for publish (package.json is now next)
  // so we publish from a temp state with the correct version.
  const publishPkg = { ...pkg, version: current }
  writeFileSync(pkgPath, JSON.stringify(publishPkg, null, 2) + '\n')

  let tmpNpmrc: string | null = null
  let tmpNpmDir: string | null = null
  if (npmToken) {
    tmpNpmDir = mkdtempSync(join(tmpdir(), 'unaxis-npm-'))
    try { chmodSync(tmpNpmDir, 0o700) } catch {}
    tmpNpmrc = join(tmpNpmDir, '.npmrc')
    writeFileSync(tmpNpmrc, `//registry.npmjs.org/:_authToken=${npmToken}\n`, { mode: 0o600 })
    try { chmodSync(tmpNpmrc, 0o600) } catch {}
    print('  Auth:       npm token resolved')
  } else {
    print('  Auth:       using npm global config (~/.npmrc)')
  }

  const npmArgs = ['publish', '--access', 'public']
  if (tmpNpmrc) npmArgs.push('--userconfig', tmpNpmrc)

  print('  Running:    npm publish...')

  // npm publish must NOT inherit piped stdio — it would block forever waiting
  // for stdin (OTP prompt, TTY detection) that never arrives through a pipe.
  // Instead: ignore stdin, capture stdout+stderr, then print them ourselves.
  // CI=1 tells npm this is a non-interactive environment (no spinners/prompts).
  const npmResult = spawnSync('npm', npmArgs, {
    cwd:     import.meta.dir,
    stdio:   ['ignore', 'pipe', 'pipe'],
    shell:   true,
    timeout: 120_000,
    env:     { ...process.env, CI: '1', NO_UPDATE_NOTIFIER: '1', npm_config_yes: 'true' },
  })

  // Forward captured npm output through our unbuffered fd so onLine picks it up
  if (npmResult.stdout?.length) writeSync(1, npmResult.stdout)
  if (npmResult.stderr?.length) writeSync(2, npmResult.stderr)

  if (tmpNpmrc) { try { unlinkSync(tmpNpmrc) } catch {} }
  if (tmpNpmDir) { try { rmSync(tmpNpmDir, { recursive: true, force: true }) } catch {} }

  // Restore bumped version regardless of publish outcome
  pkg.version = next
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

  if (npmResult.error || npmResult.status !== 0) {
    printerr('')
    if (npmResult.error?.code === 'ETIMEDOUT') {
      printerr('  ✗ npm publish timed out after 2 minutes.')
    } else {
      printerr('  ✗ npm publish failed (exit ' + (npmResult.status ?? '?') + ').')
    }
    printerr('  dist/cli.js and package.json are still updated locally.')
    printerr('')
    printerr('  To retry publish manually:')
    printerr('    cd src/ink')
    printerr('    npm version ' + current + ' --no-git-tag-version')
    printerr('    npm publish --access public')
    printerr('    npm version ' + next + ' --no-git-tag-version')
    process.exit(1)
  }

  print('')
  print('  Published:  @untsystems/unaxis@' + current + ' on npm')

  // ── Auto-update global CLI after publish ──────────────────────────────────
  // `npm update -g` only bumps within the installed semver range and often
  // skips the version just published.  `install -g @latest` always fetches
  // the exact version we just pushed.
  print('  Auto-updating global CLI...')
  const updateResult = spawnSync('npm', ['install', '-g', '@untsystems/unaxis@latest'], {
    stdio:   ['ignore', 'pipe', 'pipe'],
    shell:   true,
    timeout: 60_000,
    env:     { ...process.env, CI: '1', NO_UPDATE_NOTIFIER: '1' },
  })
  if (updateResult.stdout?.length) writeSync(1, updateResult.stdout)
  if (updateResult.stderr?.length) writeSync(2, updateResult.stderr)
  if (!updateResult.error && updateResult.status === 0) {
    print('  ✓ Global CLI updated to v' + current)
  } else {
    printerr('  ⚠ Global CLI auto-update failed — run manually: npm install -g @untsystems/unaxis@latest')
  }

}

// ── Done ───────────────────────────────────────────────────────────────────────

print('')
print('  Done.')
print('  Released:   UNAXIS v' + current)
print('  Dev now:    v' + next + '  (package.json bumped)')
print('')

if (!publish) {
  print('  To push to npm next time:')
  print('    bun release.ts --publish')
}

// Signal the TUI to restart — caught by useDevBuildActions which calls process.exit(0).
// In dev mode (bun --watch) the watcher restarts the TUI automatically in ~1s.
// In production mode the process exits cleanly.
if (publish) {
  print('  [ok] done')
}
print('')
