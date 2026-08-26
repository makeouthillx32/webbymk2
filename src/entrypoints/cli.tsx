// src/entrypoints/cli.tsx
// UNAXIS CLI fast-path entry.
// Handles --version, --help, config, and credentials subcommands synchronously
// before any Ink/React import.
// Loads .env synchronously before booting the TUI so all process.env values
// are available when db-api and other modules initialize.

export {}

// Injected by build.ts via Bun.build define
declare const UNAXIS_VERSION: string

import { ensureRuntimeEnv }                         from '../utils/runtimeEnv.js'
import { STACK_IP_SAFE }                             from '../config/stack.js'
import { getSetting, setSetting, getCredential, setCredential,
         getAllSettings, getAllCredentials,
         getCredentialsPath, getSettingsPath }       from '../utils/secureStorage/index.js'
import type { CredentialKey }                        from '../utils/secureStorage/index.js'
import { existsSync, readFileSync }                 from 'fs'
import { join, resolve, dirname, isAbsolute }       from 'path'
import * as net                                     from 'net'
import { spawnSync }                                from 'child_process'

// ── Bun self-relaunch guard ───────────────────────────────────────────────────
// UNAXIS must run under Bun: control-db.ts (the SQLite-backed zones +
// environments store) hard-requires `bun:sqlite`, with no Node fallback.
// Every launch path can still end up invoking this bundled file with plain
// `node`: npm's Windows shims (unaxis.cmd / unaxis.ps1) hardcode a call to
// node.exe and ignore the shebang line build.ts injects, and nothing stops
// a script (or a person) from running `node dist/cli.js` directly. Rather
// than chase down and fix every entry point one at a time -- global install,
// this repo's own scripts, whatever gets written next -- self-relaunch under
// bun transparently right here, before any other module gets a chance to
// reach control-db.ts.
//
// Discovered 2026-08-08: the prod autostart path silently left the TUI with
// zero zones and zero environments loaded, because control-db hydration
// threw "Cannot find module 'bun:sqlite'" under node and nothing caught it.
if (typeof (globalThis as { Bun?: unknown }).Bun === 'undefined') {
  const result = spawnSync('bun', [process.argv[1] as string, ...process.argv.slice(2)], {
    stdio: 'inherit',
  })
  if (result.error) {
    process.stderr.write(
      '\nUNAXIS requires Bun to run (bun:sqlite backs the local zones/environments store).\n' +
      'Install it from https://bun.sh, then re-run.\n\n'
    )
    process.exit(1)
  }
  process.exit(result.status ?? 1)
}

const args = process.argv.slice(2)

type PublicCredentialKey = 'npm_token' | 'ghcr_token' | 'openai_api_key'

const PUBLIC_CREDENTIAL_KEYS: readonly PublicCredentialKey[] = [
  'npm_token',
  'ghcr_token',
  'openai_api_key',
]

function isPublicCredentialKey(key: string): key is PublicCredentialKey {
  return (PUBLIC_CREDENTIAL_KEYS as readonly string[]).includes(key)
}

function credentialTimestampKey(key: PublicCredentialKey): CredentialKey | null {
  if (key === 'npm_token') return 'npm_token_set_at'
  if (key === 'ghcr_token') return 'ghcr_token_set_at'
  return null
}

function maskSecret(value: string): string {
  if (value.length <= 8) return '*'.repeat(Math.max(8, value.length))
  return value.slice(0, 4) + '...' + value.slice(-4)
}

function isProjectRoot(path: string): boolean {
  return (
    existsSync(path) &&
    existsSync(join(path, 'docker-compose.yml')) &&
    existsSync(join(path, 'src', 'ink'))
  )
}

// ── Fast-path flags ───────────────────────────────────────────────────────────

if (args.includes('--version') || args.includes('-version') || args.includes('-v')) {
  process.stdout.write(UNAXIS_VERSION + '\n')
  process.exit(0)
}

if (args.includes('--schema')) {
  const { UNAXIS_CLI_SCHEMA } = await import('../ink/cli-schema.js')
  process.stdout.write(JSON.stringify(UNAXIS_CLI_SCHEMA, null, 2) + '\n')
  process.exit(0)
}

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    '\n' +
    '  UNAXIS — unified infrastructure manager\n' +
    '\n' +
    '  Usage:\n' +
    '    unaxis                                       launch the TUI\n' +
    '    unaxis -version | --version | -v             print version\n' +
    '    unaxis --help                                show this message\n' +
    '\n' +
    '  Project commands  (requires TUI to be running):\n' +
    '    unaxis <slug>                                show project info\n' +
    '    unaxis <slug> status                         confirm TUI is alive\n' +
    '    unaxis <slug> version                        TUI + agent versions\n' +
    '    unaxis <slug> zones list                     list zones\n' +
    '    unaxis <slug> dev <zone>                     start/stop dev container\n' +
    '    unaxis <slug> restart <zone>                 hard restart dev container\n' +
    '    unaxis <slug> logs proxy --tail 120          proxy logs (unt_proxy on P0W3R)\n' +
    '    unaxis <slug> logs db --tail 120             db logs (unt_db on P0W3R)\n' +
    '    unaxis <slug> logs npm --tail 120            NPM logs (nginx-proxy-manager on L0VE via SSH)\n' +
    '    unaxis <slug> zone <zone> status             one zone status\n' +
    '    unaxis <slug> zone <zone> logs --tail 120    zone logs\n' +
    '    unaxis <slug> zone <zone> dev start|stop     zone dev container\n' +
    '    unaxis <slug> session                        TUI session snapshot\n' +
    '    unaxis <slug> stack                          TUI stack items\n' +
    '    unaxis <slug> watch begin --label <text>     start watch session\n' +
    '    unaxis <slug> watch note <text>              add watch note\n' +
    '    unaxis <slug> watch snapshot                 record snapshot\n' +
    '    unaxis <slug> watch end                      end watch session\n' +
    '    unaxis <slug> db backup                       quick pg_dump (core DB only)\n' +
    '    unaxis <slug> db snapshot                     full snapshot (DB + storage + metadata)\n' +
    '    unaxis <slug> db snapshots                    list core snapshots\n' +
    '    unaxis <slug> db restore --bundle <path>      restore core from snapshot bundle\n' +
    '    unaxis <slug> db blank <name>                 create new blank instance\n' +
    '    unaxis <slug> db clone <source> <name>        snapshot source → new independent instance\n' +
    '    unaxis <slug> db clone core <name>            clone the core database\n' +
    '    unaxis <slug> db instances                    list all runtime instances\n' +
    '    unaxis <slug> db instance <name> status       instance container health\n' +
    '    unaxis <slug> db instance <name> logs         instance logs (db, kong, studio)\n' +
    '    unaxis <slug> db instance <name> start        start all containers\n' +
    '    unaxis <slug> db instance <name> stop         stop all containers\n' +
    '    unaxis <slug> db instance <name> restart      stop + start\n' +
    '    unaxis <slug> db instance <name> snapshot     capture full bundle\n' +
    '    unaxis <slug> db instance <name> snapshots    list captured bundles\n' +
    '    unaxis <slug> db instance <name> restore      rollback from bundle (--bundle <path>)\n' +
    '    unaxis <slug> db instance <name> verify       deep health check, sync Docker state\n' +
    '    unaxis <slug> db instance <name> delete       full teardown, volumes gone (--confirm)\n' +
    '    unaxis <slug> db instance <name> remove       soft remove, volumes kept  (--confirm)\n' +
    '    unaxis <slug> db instance <name> npm          re-register NPM proxy hosts\n' +
    '    unaxis <slug> npm list [--search <domain>]   list all NPM proxy hosts\n' +
    '    unaxis <slug> npm search <domain>            search proxy hosts by domain substring\n' +
    '    unaxis <slug> preflight edit --zone <zone>   pre-edit validation\n' +
    '    unaxis <slug> env list                       list environments\n' +
    '    unaxis <slug> env ping [<name>]              ping environment agents\n' +
    '    unaxis <slug> env containers [<name>]        list containers (unt_* only; --all for everything)\n' +
    '    unaxis <slug> env stacks [<name>]            list Docker Compose stacks (grouped by project)\n' +
    '    unaxis <slug> env logs <env> <container>     container logs from any environment\n' +
    '    unaxis <slug> env security [<name>]          inspect container security posture\n' +
    '    unaxis <slug> env audit-image <img_name>     audit image layers for secrets\n' +
    '    unaxis <slug> env events [<name>]            stream recent docker events\n' +
    '    unaxis <slug> env update <name>              update agent\n' +
    '\n' +
    '  UNAXIS global commands:\n' +
    '    unaxis project list                          list known project roots\n' +
    '    unaxis project add [<path>]                  register a project\n' +
    '    unaxis project remove <slug>                 remove from registry\n' +
    '    unaxis snap-view [manifest|dir]              view recorded frame series (timeline + film strip)\n' +
    '    unaxis connect <uaxc_key>                    connect to remote TUI\n' +
    '                                                   (generate key: press K in picker)\n' +
    '    unaxis disconnect                            remove remote session\n' +
    '    unaxis version                               print installed version\n' +
    '    unaxis update                                update global CLI installation\n' +
    '    unaxis events --watch                        stream TUI event bus\n' +
    '\n' +
    '  Config:\n' +
    '    unaxis config set default_project <path>     set default project root\n' +
    '    unaxis config get default_project            show current project root\n' +
    '    unaxis config list                           show all settings\n' +
    '\n' +
    '  Credentials:\n' +
    '    unaxis credentials set npm_token <token>     store npm publish token\n' +
    '    unaxis credentials get npm_token             show masked token value\n' +
    '    unaxis credentials list                      list credential keys\n' +
    '\n' +
    '  Storage paths:\n' +
    '    settings:     ' + getSettingsPath() + '\n' +
    '    credentials:  ' + getCredentialsPath() + '\n' +
    '\n'
  )
  process.exit(0)
}

// ── TUI IPC commands ──────────────────────────────────────────────────────────
// Commands that forward to the running TUI via local TCP socket.
// Must be checked BEFORE the config/credentials subcommands so short-circuit
// exits work correctly.

// ── unaxis version — installed package version (no TUI required) ─────────────
if (args[0] === 'version') {
  if (!args.includes('--compare')) {
    process.stdout.write(`UNAXIS  ${UNAXIS_VERSION}\n`)
    process.exit(0)
  }

  // ── unaxis version --compare ──────────────────────────────────────────────
  // Queries prod TUI (50505) and dev TUI (50507) simultaneously. No auth.
  // Control-node LAN IP comes from config.json (STACK_IP_SAFE) — never a
  // literal address in source, since this repo is public on GitHub.
  const CONTROL_NODE_IP = STACK_IP_SAFE
  const IS_LAN_LOCAL = (() => {
    if (!CONTROL_NODE_IP) return true
    try {
      const os = require('os') as typeof import('os')
      return Object.values(os.networkInterfaces()).flat().some(i => i?.address === CONTROL_NODE_IP)
    } catch { return false }
  })()
  const HOST = IS_LAN_LOCAL ? '127.0.0.1' : CONTROL_NODE_IP

  const queryTui = (port: number, label: string): Promise<string> =>
    new Promise((res) => {
      const sock = net.connect(port, HOST)
      let data = ''
      sock.on('connect', () => sock.write(JSON.stringify({ argv: ['version'] }) + '\n'))
      sock.on('data',  (d: Buffer) => { data += d.toString() })
      sock.on('end',   () => res(data))
      sock.on('error', () => res(`✗ ${label} TUI not running`))
      setTimeout(() => { sock.destroy(); res(data || `✗ ${label} TUI not running`) }, 5000)
    })

  // Query both ports in parallel
  const [local50505, remote50507] = await Promise.all([queryTui(50505, 'prod'), queryTui(50507, 'dev')])

  // Extract version strings
  const ver50505 = (local50505.match(/UNAXIS\s+(\S+)/)  ?? [])[1] ?? null
  const ver50507 = (remote50507.match(/UNAXIS\s+(\S+)/) ?? [])[1] ?? null

  // Auto-detect which is dev vs prod from version string
  // "dev" = dev TUI (bun hot-reload, UNAXIS_VERSION not baked)
  // semver = prod TUI (compiled binary with baked version)
  const isSemver = (v: string | null) => v !== null && /^\d+\.\d+\.\d+/.test(v)

  // Build labeled results regardless of which port each is on
  const rows: Array<{ label: string; ver: string; port: string }> = []

  if (ver50505 !== null) {
    rows.push({ label: isSemver(ver50505) ? 'prod' : 'dev ', ver: ver50505, port: '50505' })
  } else {
    rows.push({ label: 'n/a ', ver: local50505.startsWith('✗') ? local50505 : '(no response)', port: '50505' })
  }
  if (ver50507 !== null) {
    rows.push({ label: isSemver(ver50507) ? 'prod' : 'dev ', ver: ver50507, port: '50507' })
  } else {
    rows.push({ label: 'n/a ', ver: remote50507.startsWith('✗') ? remote50507 : '(no response)', port: '50507' })
  }

  const prodVer = rows.find(r => r.label.trim() === 'prod')?.ver ?? null
  const devVer  = rows.find(r => r.label.trim() === 'dev')?.ver  ?? null
  const behind  = prodVer && devVer && prodVer !== devVer

  process.stdout.write('\n')
  for (const r of rows) process.stdout.write(`  ${r.label}  UNAXIS  ${r.ver}  (port ${r.port})\n`)
  process.stdout.write('\n')
  if (behind)          process.stdout.write(`  [≠] prod ${prodVer} · dev is on hot-reload — no update needed\n`)
  else if (!prodVer)   process.stdout.write(`  [!] prod TUI not detected\n`)
  else if (!devVer)    process.stdout.write(`  [!] dev TUI not detected\n`)
  else                 process.stdout.write(`  [=] both TUIs reporting same version\n`)
  process.stdout.write('\n')
  process.exit(0)
}

// ── unaxis snapshot-view <panel> [--save] [--label <name>] [--json] ──────────
// Renders an Ink panel component directly to a text frame.
// Works standalone — no TUI launch, no IPC, no keystrokes. ~25ms.
// Panels: npm, infra, infra-dns, infra-ports, zones, db, env
//
// Examples:
//   unaxis snapshot-view db
//   unaxis snapshot-view npm --json
//   unaxis snapshot-view infra-dns --save --label "before-fix"
// ── unaxis snapshot-view (global screens only — no project slug needed) ───────
// Project panels (db, npm, zones, etc.) require a slug: unaxis unenter snapshot-view db
// Global screens (startup, welcome) have no project context and run standalone.
if (args[0] === 'snapshot-view') {
  const target   = args[1] ?? 'startup'
  const save     = args.includes('--save')
  const asJson   = args.includes('--json')
  const labelIdx = args.indexOf('--label')
  const label    = labelIdx >= 0 ? (args[labelIdx + 1] ?? target) : target

  const rowsIdx  = args.indexOf('--rows')
  const rowsVal  = rowsIdx >= 0 ? parseInt(args[rowsIdx + 1] ?? '40', 10) : 40
  const colsIdx  = args.indexOf('--cols')
  const colsVal  = colsIdx >= 0 ? parseInt(args[colsIdx + 1] ?? '120', 10) : 120

  const GLOBAL_SCREENS = new Set(['startup', 'welcome', 'settings'])

  if (!GLOBAL_SCREENS.has(target)) {
    process.stderr.write(`  ✗ "${target}" is a project panel — use: unaxis <slug> snapshot-view ${target}\n`)
    process.stderr.write(`  Global screens (no slug needed): startup, welcome, settings\n`)
    process.exit(2)
  }

  const { renderPanelFrame } = await import('../agent-view/renderPanelFrame.js')
  const React = (await import('../ink/reactRuntime.js')).default
  const noop  = () => {}

  let element: React.ReactElement | null = null
  let componentName = ''

  if (target === 'startup') {
    const { StartupScreen } = await import('../ink/components/StartupScreen.js')
    componentName = 'StartupScreen'
    element = React.createElement(StartupScreen, { onDone: noop, onQuit: noop, instant: true })

  } else if (target === 'welcome') {
    const { WelcomeScreen } = await import('../screens/WelcomeScreen.js')
    componentName = 'WelcomeScreen'
    element = React.createElement(WelcomeScreen, {
      zones: [], zoneStatuses: {}, proxyStatus: 'running',
      isActive: true, onManage: noop, onSettings: noop,
      onQuit: noop,
    })

  } else if (target === 'settings') {
    const { SettingsScreen } = await import('../screens/SettingsScreen.js')
    componentName = 'SettingsScreen'
    element = React.createElement(SettingsScreen, {
      zones: [], onTokenEditStart: noop, onTokenEditEnd: noop,
    })

  } else {
    process.stderr.write(`  ✗ unknown target: ${target}\n`)
    process.stderr.write(`  panels:  npm, infra, infra-dns, infra-ports, zones, db, env\n`)
    process.stderr.write(`  screens: startup, welcome, settings\n`)
    process.exit(2)
  }

  const result = await renderPanelFrame(label, element!, componentName, { columns: colsVal, rows: rowsVal })

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  } else {
    process.stdout.write(`\n── snapshot-view: ${target} (${componentName}) ${'─'.repeat(Math.max(0, 48 - target.length))}\n`)
    process.stdout.write(result.text + '\n')
    process.stdout.write('─'.repeat(70) + '\n')
    process.stdout.write(`  ${result.metadata.renderMs}ms · ${result.lines.length} lines · ${result.metadata.width}×${result.metadata.height}\n`)
  }

  if (save) {
    const { writeSnapshot } = await import('../agent-view/writeSnapshot.js')
    const snap = await writeSnapshot(result)
    process.stdout.write(`  saved → ${snap.dir}\n`)
  }

  process.exit(0)
}

// ── unaxis snap-view [manifest-or-dir] [options] ──────────────────────────────
// Frame-series viewer — prints manifest stats, the sample timeline, and the
// unique frames as an inline film strip. Reads the output of
// `snap --series` / `snap --arm-startup` recordings.
// Standalone fast-path: pure fs/path, no TUI launch, no IPC, no Ink import.
// Defaults to logs/startup-series-latest.json (the boot-recording pointer).
//
// Examples:
//   unaxis snap-view --summary
//   unaxis snap-view --max-frames 2
//   unaxis snap-view .snapshots/2026-06-11T14-33-46-startup-series
if (args[0] === 'snap-view') {
  const sub = args.slice(1)
  const has = (flag: string) => sub.includes(flag)
  const valueAfter = (flag: string): string | null => {
    const i = sub.indexOf(flag)
    return i >= 0 ? (sub[i + 1] ?? null) : null
  }

  if (has('--help')) {
    process.stdout.write([
      '  Usage: unaxis snap-view [manifest-or-dir] [options]',
      '',
      '  Defaults to logs/startup-series-latest.json.',
      '',
      '  Options:',
      '    --summary          Only print manifest stats and frame timeline.',
      '    --strip            Print unique frames inline as a compact film strip. Default.',
      '    --all-samples      Include repeat samples as timing rows. Default.',
      '    --unique-only      Omit repeat samples from the timeline.',
      '    --max-frames N     Limit inline unique frames. Default: all unique frames.',
      '    --help             Show this help.',
      '',
    ].join('\n') + '\n')
    process.exit(0)
  }

  const flagsWithValues = new Set(['--max-frames'])
  let positional: string | null = null
  for (let i = 0; i < sub.length; i += 1) {
    const a = sub[i]!
    if (flagsWithValues.has(a)) { i += 1; continue }
    if (!a.startsWith('-')) { positional = a; break }
  }
  const targetPath = resolve(process.cwd(), positional ?? 'logs/startup-series-latest.json')

  type SeriesFrame = { index: number; file: string | null; t?: number; repeatOf?: number }

  const timelineRow = (frame: SeriesFrame): string => {
    const index = String(frame.index).padStart(4, '0')
    const t = String(frame.t ?? 0).padStart(5, ' ')
    if (frame.file) return `${index}  ${t}ms  ${frame.file}`
    if (frame.repeatOf) return `${index}  ${t}ms  repeatOf frame-${String(frame.repeatOf).padStart(4, '0')}`
    return `${index}  ${t}ms  no frame captured`
  }

  try {
    if (!existsSync(targetPath)) throw new Error(`Frame-series path not found: ${targetPath}`)
    const manifestPath = targetPath.endsWith('.json') ? targetPath : join(targetPath, 'manifest.json')
    if (!existsSync(manifestPath)) throw new Error(`Manifest not found: ${manifestPath}`)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    // Prefer the manifest's recorded dir only if it still exists — a manifest
    // copy (e.g. logs/startup-series-latest.json after .snapshots cleanup) or
    // a moved series folder falls back to the manifest's own directory.
    let baseDir = manifest.dir && isAbsolute(manifest.dir) && existsSync(manifest.dir) ? manifest.dir : dirname(manifestPath)

    const frames: SeriesFrame[] = Array.isArray(manifest.frames) ? manifest.frames : []
    const uniqueFrames = frames.filter((f) => f.file)

    // Cross-platform fallback: a manifest pointer may record `dir` using
    // another OS's path syntax (e.g. a Windows path read inside a Linux
    // sandbox), making isAbsolute/existsSync fail. If the first unique frame
    // is not found in baseDir, look for the series folder by name under
    // .snapshots/ next to the manifest's parent directory.
    const firstFile = uniqueFrames[0]?.file
    if (firstFile && !existsSync(isAbsolute(firstFile) ? firstFile : join(baseDir, firstFile)) && typeof manifest.dir === 'string') {
      const seriesName = manifest.dir.split(/[\\/]/).filter(Boolean).pop()
      if (seriesName) {
        const candidate = join(dirname(manifestPath), '..', '.snapshots', seriesName)
        if (existsSync(join(candidate, firstFile))) baseDir = candidate
      }
    }
    const includeRepeats = has('--all-samples') || !has('--unique-only')
    const summaryOnly = has('--summary')
    const strip = has('--strip') || !summaryOnly
    const maxFramesRaw = valueAfter('--max-frames')
    const maxFrames = maxFramesRaw ? Math.max(0, Number.parseInt(maxFramesRaw, 10)) : uniqueFrames.length

    console.log(`Frame series: ${manifest.label ?? '(unlabeled)'}`)
    console.log(`Manifest: ${manifestPath}`)
    console.log(`Directory: ${baseDir}`)
    console.log(`Mode: ${manifest.mode ?? 'unknown'} | sampled: ${manifest.sampled ?? frames.length} | unique: ${manifest.written ?? uniqueFrames.length} | every: ${manifest.everyMs ?? '?'}ms | duration: ${manifest.durationMs ?? '?'}ms | size: ${manifest.width ?? '?'}x${manifest.height ?? '?'}`)
    console.log('')
    console.log('Timeline:')
    for (const frame of frames) {
      if (!includeRepeats && !frame.file) continue
      console.log(`  ${timelineRow(frame)}`)
    }

    if (strip) {
      console.log('')
      console.log(`Film strip: ${Math.min(maxFrames, uniqueFrames.length)} of ${uniqueFrames.length} unique frames`)
      for (const frame of uniqueFrames.slice(0, maxFrames)) {
        const file = frame.file!
        const framePath = isAbsolute(file) ? file : join(baseDir, file)
        console.log('')
        console.log(`--- frame-${String(frame.index).padStart(4, '0')} @ ${frame.t ?? 0}ms (${file}) ---`)
        console.log(readFileSync(framePath, 'utf8').replace(/\s+$/g, ''))
      }
      if (maxFrames < uniqueFrames.length) {
        console.log('')
        console.log(`... ${uniqueFrames.length - maxFrames} unique frame(s) omitted by --max-frames ${maxFrames}`)
      }
    }
    process.exit(0)
  } catch (err) {
    process.stderr.write(`  ✗ ${err instanceof Error ? err.message : String(err)}\n`)
    process.stderr.write(`  Usage: unaxis snap-view [manifest-or-dir] [--summary] [--unique-only] [--max-frames N]\n`)
    process.exit(1)
  }
}

// ── project subcommand ────────────────────────────────────────────────────────
// Manages the known-projects registry used by the TUI project picker.
//
// Future: `unaxis <project-slug> <command>` will route IPC commands to the
// TUI session for that specific project.  For now, project management is
// handled here and the picker lives inside the TUI at startup.

if (args[0] === 'project') {
  const { getKnownProjects, addKnownProject, removeKnownProject } =
    await import('../utils/projectRegistry.js')

  const sub = args[1]   // list | add | remove

  if (!sub || sub === 'list') {
    const list = await getKnownProjects()
    if (list.length === 0) {
      console.log('  (no projects registered)')
      console.log(`  Add one: unaxis project add [<path>]`)
    } else {
      console.log('')
      for (const p of list) {
        console.log(`  ${p.slug.padEnd(20)}  ${p.path}`)
      }
      console.log('')
    }
    process.exit(0)
  }

  if (sub === 'add') {
    const rawPath = args[2] ?? process.cwd()
    const { resolve } = await import('path')
    const abs = resolve(rawPath)
    if (!isProjectRoot(abs)) {
      console.error(`  Error: not a UNAXIS project root: ${abs}`)
      console.error('  Expected: docker-compose.yml and src/ink')
      process.exit(1)
    }
    const entry = await addKnownProject(abs)
    console.log(`  Added: ${entry.slug}  →  ${entry.path}`)
    process.exit(0)
  }

  if (sub === 'remove') {
    const slugOrPath = args[2]
    if (!slugOrPath) {
      console.error('  Usage: unaxis project remove <slug>')
      console.error('  Run "unaxis project list" to see registered projects.')
      process.exit(1)
    }
    const removed = await removeKnownProject(slugOrPath)
    if (removed) {
      console.log(`  Removed: ${slugOrPath}`)
    } else {
      console.error(`  Not found: ${slugOrPath}`)
      console.error('  Run "unaxis project list" to see registered projects.')
      process.exit(1)
    }
    process.exit(0)
  }

  console.error(`  Unknown project subcommand: ${sub}`)
  console.error('  Try: unaxis project list|add|remove')
  process.exit(1)
}

// ── connect subcommand ────────────────────────────────────────────────────────
// Decode a uaxc_ pairing key and write ~/.unaxis/remote-session.json so that
// subsequent `unaxis <command>` calls route to the remote TUI via the bridge.

if (args[0] === 'connect') {
  const raw = args[1]
  if (!raw) {
    console.error('  Usage: unaxis connect <uaxc_key>')
    console.error('  Generate a key: press K in the UNAXIS project picker.')
    process.exit(1)
  }

  const { parsePairingKey, describePairingKey } = await import('../utils/pairingKey.js')
  const payload = parsePairingKey(raw)
  if (!payload) {
    console.error('  Error: invalid or expired pairing key.')
    console.error('  Generate a fresh key in the UNAXIS project picker (K).')
    process.exit(1)
  }

  const { host, port, slug, expiresAt, ttlLabel } = describePairingKey(payload)

  // Write the remote session file
  const { writeFileSync, mkdirSync } = await import('fs')
  const { join } = await import('path')
  const { homedir } = await import('os')
  const sessionDir  = join(homedir(), '.unaxis')
  const sessionPath = join(sessionDir, 'remote-session.json')
  mkdirSync(sessionDir, { recursive: true })
  writeFileSync(sessionPath, JSON.stringify({
    host:        payload.host,
    port:        payload.port,
    token:       payload.token,
    slug:        payload.slug,
    exp:         payload.exp,
    connectedAt: new Date().toISOString(),
  }, null, 2), 'utf8')

  console.log('')
  console.log(`  ✓ Connected to  ${slug}  at  ${host}:${port}`)
  console.log(`    expires  ${expiresAt.toLocaleString()}  (${ttlLabel})`)
  console.log(`    session  ${sessionPath}`)
  console.log('')
  console.log('  All unaxis commands now route to the remote TUI.')
  console.log('  To disconnect:  unaxis disconnect')
  console.log('')
  process.exit(0)
}

// ── disconnect subcommand ─────────────────────────────────────────────────────

if (args[0] === 'disconnect') {
  const { existsSync, unlinkSync } = await import('fs')
  const { join } = await import('path')
  const { homedir } = await import('os')
  const sessionPath = join(homedir(), '.unaxis', 'remote-session.json')

  if (!existsSync(sessionPath)) {
    console.log('  (no active remote session)')
    process.exit(0)
  }

  unlinkSync(sessionPath)
  console.log('  ✓ Disconnected — commands now route to local TUI.')
  process.exit(0)
}

// ── events subcommand ─────────────────────────────────────────────────────────

if (args[0] === 'events') {
  const { sendIpcCommand } = await import('../ink/ipc-client.js')
  process.exit(await sendIpcCommand(args))
}

// ── update subcommand ─────────────────────────────────────────────────────────

if (args[0] === 'update') {
  const { spawnSync } = await import('child_process')
  process.stdout.write('  Updating global UNAXIS CLI via npm...\n')
  const result = spawnSync('npm', ['install', '-g', '@untsystems/unaxis@latest'], {
    stdio: 'inherit',
    shell: true,
  })
  if (result.status === 0) {
    process.stdout.write('  ✓ Global UNAXIS CLI updated successfully!\n')
  } else {
    process.stderr.write('  ✗ Global UNAXIS CLI update failed.\n')
    process.exit(result.status ?? 1)
  }
  process.exit(0)
}

// ── <slug> <command…> — project-scoped IPC routing ───────────────────────────
// All TUI commands are namespaced under the project slug:
//   unaxis unenter status
//   unaxis unenter zones list
//   unaxis unenter dev <zone>
//
// The slug is resolved against the known-projects registry.  If a remote
// session is active (unaxis connect <key>), commands route through the bridge.

const GLOBAL_SUBCOMMANDS = new Set([
  'project', 'connect', 'disconnect', 'events', 'config', 'credentials', 'creds', 'version',
  'snapshot-view', 'snap-view', 'update',
])

if (args.length >= 1 && args[0] && !args[0].startsWith('-') && !GLOBAL_SUBCOMMANDS.has(args[0])) {
  const potentialSlug = args[0]

  // Resolve the slug against:
  //   1. The active remote session (if connected, its slug is authoritative)
  //   2. The local known-projects registry
  const { loadRemoteSession } = await import('../ink/ipc-client.js')
  const session = loadRemoteSession()

  const { getKnownProjects } = await import('../utils/projectRegistry.js')
  const projects = await getKnownProjects()
  const localProject = projects.find((p) => p.slug === potentialSlug)

  const isRemoteSlug = session !== null && session.slug === potentialSlug
  const isKnownSlug  = !!localProject || isRemoteSlug

  if (isKnownSlug) {
    const subArgs = args.slice(1)
    if (subArgs.length === 0) {
      // No subcommand — show project summary
      if (isRemoteSlug) {
        process.stdout.write(`\n  Project  ${potentialSlug}  (remote — ${session!.host})\n`)
      } else if (localProject) {
        process.stdout.write(`\n  Project  ${localProject.slug}\n`)
        process.stdout.write(`  Path     ${localProject.path}\n`)
        process.stdout.write(`  Added    ${new Date(localProject.addedAt).toLocaleDateString()}\n`)
      }
      process.stdout.write(`\n  unaxis ${potentialSlug} status\n`)
      process.stdout.write(`  unaxis ${potentialSlug} zones list\n`)
      process.stdout.write(`  unaxis ${potentialSlug} dev <zone>\n\n`)
      process.exit(0)
    }
    const { sendIpcCommand } = await import('../ink/ipc-client.js')
    // --dev  → force dev TUI (remote session port 50506)
    // --prod → force prod TUI (local port 50505)
    const target = subArgs.includes('--dev')  ? 'dev'
                 : subArgs.includes('--prod') ? 'prod'
                 : 'auto'
    process.exit(await sendIpcCommand(subArgs, { target }))
  }

  // Not a known slug and not a global command — give a clear error
  process.stderr.write(`  ✗  Unknown project: "${potentialSlug}"\n`)
  process.stderr.write(`  Run  unaxis project list  to see registered projects.\n`)
  if (session) {
    process.stderr.write(`  Active remote session: ${session.slug}  →  try  unaxis ${session.slug} <command>\n`)
  }
  process.exit(1)
}

// ── config subcommand ─────────────────────────────────────────────────────────

if (args[0] === 'config') {
  const sub  = args[1]  // get | set | list
  const key  = args[2]  // e.g. default_project
  const val  = args[3]  // value for set

  if (sub === 'set') {
    if (!key || !val) {
      console.error('  Usage: unaxis config set default_project <path>')
      process.exit(1)
    }

    // Validate + resolve path for default_project
    if (key === 'default_project') {
      const resolved = resolve(val)
      if (!isProjectRoot(resolved)) {
        console.error(`  Error: not a UNAXIS project root: ${resolved}`)
        console.error('  Expected markers: docker-compose.yml and src/ink')
        process.exit(1)
      }
      await setSetting('default_project', resolved)
      console.log(`  default_project -> ${resolved}`)
      console.log(`  Saved to: ${getSettingsPath()}`)
    } else {
      console.error(`  Unknown config key: ${key}`)
      console.error('  Supported keys: default_project')
      process.exit(1)
    }
    process.exit(0)
  }

  if (sub === 'get') {
    if (!key) {
      console.error('  Usage: unaxis config get default_project')
      process.exit(1)
    }
    if (key !== 'default_project') {
      console.error(`  Unknown config key: ${key}`)
      console.error('  Supported keys: default_project')
      process.exit(1)
    }
    const value = await getSetting('default_project')
    if (value === null) {
      console.log(`  ${key} is not set`)
    } else {
      console.log(`  ${key} = ${value}`)
    }
    process.exit(0)
  }

  if (sub === 'list' || !sub) {
    const all = await getAllSettings()
    const entries = Object.entries(all)
    if (entries.length === 0) {
      console.log('  (no settings stored)')
    } else {
      for (const [k, v] of entries) {
        console.log(`  ${k} = ${v}`)
      }
    }
    console.log(`\n  File: ${getSettingsPath()}`)
    process.exit(0)
  }

  console.error(`  Unknown config subcommand: ${sub}`)
  console.error('  Try: unaxis config set|get|list')
  process.exit(1)
}

// ── credentials subcommand ────────────────────────────────────────────────────

if (args[0] === 'credentials' || args[0] === 'creds') {
  const sub = args[1]  // get | set | list
  const key = args[2]  // e.g. npm_token
  const val = args[3]  // value for set

  if (sub === 'set') {
    if (!key || !val) {
      console.error('  Usage: unaxis credentials set <key> <value>')
      console.error('  Keys:  npm_token  ghcr_token  openai_api_key')
      process.exit(1)
    }
    if (!isPublicCredentialKey(key)) {
      console.error(`  Unknown credential key: ${key}`)
      console.error('  Keys:  npm_token  ghcr_token  openai_api_key')
      process.exit(1)
    }
    await setCredential(key, val)
    const timestampKey = credentialTimestampKey(key)
    if (timestampKey) await setCredential(timestampKey, new Date().toISOString())
    const masked = maskSecret(val)
    console.log(`  ${key} saved  (${masked})`)
    console.log(`  Stored in: ${getCredentialsPath()}`)
    process.exit(0)
  }

  if (sub === 'get') {
    if (!key) {
      console.error('  Usage: unaxis credentials get <key>')
      console.error('  Keys:  npm_token  ghcr_token  openai_api_key')
      process.exit(1)
    }
    if (!isPublicCredentialKey(key)) {
      console.error(`  Unknown credential key: ${key}`)
      console.error('  Keys:  npm_token  ghcr_token  openai_api_key')
      process.exit(1)
    }
    const value = await getCredential(key)
    if (value === null) {
      console.log(`  ${key} is not set`)
      console.log(`  To set it: unaxis credentials set ${key} <value>`)
    } else {
      // Always mask credentials; never print secrets in full.
      const masked = maskSecret(value)
      console.log(`  ${key} = ${masked}  (${value.length} chars)`)
    }
    process.exit(0)
  }

  if (sub === 'list' || !sub) {
    const all = await getAllCredentials()
    const keys = PUBLIC_CREDENTIAL_KEYS.filter((storedKey) => {
      const value = all[storedKey]
      return typeof value === 'string' && value.length > 0
    })
    if (keys.length === 0) {
      console.log('  (no credentials stored)')
    } else {
      for (const k of keys) {
        const v = all[k] ?? ''
        console.log(`  ${k}  ${maskSecret(v)}`)
      }
    }
    console.log(`\n  File: ${getCredentialsPath()}`)
    process.exit(0)
  }

  console.error(`  Unknown credentials subcommand: ${sub}`)
}

// ── push subcommand (independent repo push) ──────────────────────────────────
if (args[0] === 'push') {
  const { execSync } = await import('child_process')
  console.log('  Pushing UNAXIS to dedicated remote (github.com/makeouthillx32/unaxis)...')
  try {
    execSync('git subtree push --prefix=src/ink unaxis main', { stdio: 'inherit' })
    console.log('✓ UNAXIS pushed successfully!')
    process.exit(0)
  } catch (err: any) {
    console.error('✗ Push failed:', err?.message || err)
    process.exit(1)
  }
}

// ── Early .env load before any bundled TUI modules can initialize ─────────────
ensureRuntimeEnv(true)

// Boot TUI
// Dynamic import: Ink/React/yoga-wasm-web only initialize when this line
// executes. Fast-path exits above never trigger the TUI load.
await import('../main.js')
