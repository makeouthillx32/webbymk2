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
import { getSetting, setSetting, getCredential, setCredential,
         getAllSettings, getAllCredentials,
         getCredentialsPath, getSettingsPath }       from '../utils/secureStorage/index.js'
import type { CredentialKey }                        from '../utils/secureStorage/index.js'
import { existsSync }                               from 'fs'
import { join, resolve }                            from 'path'

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

if (args.includes('--version') || args.includes('-v')) {
  process.stdout.write(UNAXIS_VERSION + '\n')
  process.exit(0)
}

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(
    '\n' +
    '  UNAXIS — unified infrastructure manager\n' +
    '\n' +
    '  Usage:\n' +
    '    unaxis                                       launch the TUI\n' +
    '    unaxis --version                             print version\n' +
    '    unaxis --help                                show this message\n' +
    '\n' +
    '  Project commands  (requires TUI to be running):\n' +
    '    unaxis <slug>                                show project info\n' +
    '    unaxis <slug> status                         confirm TUI is alive\n' +
    '    unaxis <slug> version                        TUI + agent versions\n' +
    '    unaxis <slug> zones list                     list zones\n' +
    '    unaxis <slug> dev <zone>                     start/stop dev container\n' +
    '    unaxis <slug> restart <zone>                 hard restart dev container\n' +
    '    unaxis <slug> logs proxy --tail 120          proxy logs\n' +
    '    unaxis <slug> logs db --tail 120             db logs\n' +
    '    unaxis <slug> zone <zone> status             one zone status\n' +
    '    unaxis <slug> zone <zone> logs --tail 120    zone logs\n' +
    '    unaxis <slug> zone <zone> dev start|stop     zone dev container\n' +
    '    unaxis <slug> session                        TUI session snapshot\n' +
    '    unaxis <slug> stack                          TUI stack items\n' +
    '    unaxis <slug> watch begin --label <text>     start watch session\n' +
    '    unaxis <slug> watch note <text>              add watch note\n' +
    '    unaxis <slug> watch snapshot                 record snapshot\n' +
    '    unaxis <slug> watch end                      end watch session\n' +
    '    unaxis <slug> db backup --reason <text>      DB backup\n' +
    '    unaxis <slug> preflight edit --zone <zone>   pre-edit validation\n' +
    '    unaxis <slug> env list                       list environments\n' +
    '    unaxis <slug> env ping [<name>]              ping environment agents\n' +
    '    unaxis <slug> env containers [<name>]        list containers\n' +
    '    unaxis <slug> env update <name>              update agent\n' +
    '\n' +
    '  UNAXIS global commands:\n' +
    '    unaxis project list                          list known project roots\n' +
    '    unaxis project add [<path>]                  register a project\n' +
    '    unaxis project remove <slug>                 remove from registry\n' +
    '    unaxis connect <uaxc_key>                    connect to remote TUI\n' +
    '                                                   (generate key: press K in picker)\n' +
    '    unaxis disconnect                            remove remote session\n' +
    '    unaxis version                               print installed version\n' +
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
  process.stdout.write(`UNAXIS  ${UNAXIS_VERSION}\n`)
  process.exit(0)
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

// ── <slug> <command…> — project-scoped IPC routing ───────────────────────────
// All TUI commands are namespaced under the project slug:
//   unaxis unenter status
//   unaxis unenter zones list
//   unaxis unenter dev <zone>
//
// The slug is resolved against the known-projects registry.  If a remote
// session is active (unaxis connect <key>), commands route through the bridge.

const GLOBAL_SUBCOMMANDS = new Set([
  'project', 'connect', 'disconnect', 'config', 'credentials', 'creds', 'version',
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
  const isKnownSlug  = localProject !== null || isRemoteSlug

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
    process.exit(await sendIpcCommand(subArgs))
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
  console.error('  Try: unaxis credentials set|get|list')
  process.exit(1)
}

// ── Early .env load before any bundled TUI modules can initialize ─────────────
ensureRuntimeEnv(true)

// Boot TUI
// Dynamic import: Ink/React/yoga-wasm-web only initialize when this line
// executes. Fast-path exits above never trigger the TUI load.
await import('../main.js')
