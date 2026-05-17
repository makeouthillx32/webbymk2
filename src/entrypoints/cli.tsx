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
    '  UNAXIS — unenter infrastructure manager\n' +
    '\n' +
    '  Usage:\n' +
    '    unaxis                                  launch the TUI\n' +
    '    unaxis --version                        print version\n' +
    '    unaxis --help                           show this message\n' +
    '\n' +
    '  TUI commands (requires TUI to be running):\n' +
    '    unaxis dev <zone>                       start/stop dev container for zone\n' +
    '    unaxis restart <zone>                   hard restart dev container for zone\n' +
    '    unaxis list                             list zones and their dev status\n' +
    '    unaxis zones                            list zones and their dev status\n' +
    '    unaxis logs proxy --tail 120            show bounded proxy logs\n' +
    '    unaxis logs db --tail 120               show bounded db logs\n' +
    '    unaxis zone <zone> status               show one zone status\n' +
    '    unaxis zone <zone> logs --tail 120      show bounded zone logs\n' +
    '    unaxis zone <zone> dev start            start one zone dev container\n' +
    '    unaxis zone <zone> dev stop             stop one zone dev container\n' +
    '    unaxis zone <zone> dev restart          restart one zone dev container\n' +
    '    unaxis zone <zone> dev logs --tail 120  show bounded zone dev logs\n' +
    '    unaxis session                          show attached TUI session snapshot\n' +
    '    unaxis stack                            show current TUI stack items\n' +
    '    unaxis watch begin --label <text>       start an agent watch session\n' +
    '    unaxis watch status                     show active watch session\n' +
    '    unaxis watch note <text>                add a note to active watch\n' +
    '    unaxis watch snapshot --reason <text>   record session/stack/zone snapshot\n' +
    '    unaxis watch end                        end active watch session\n' +
    '    unaxis db backup --reason <text>        run DB backup through the TUI\n' +
    '    unaxis preflight edit --zone <zone>     validate before editing a zone\n' +
    '    unaxis status                           confirm TUI is alive\n' +
    '\n' +
    '  Config (non-secret settings):\n' +
    '    unaxis config set default_project <path>   set default project root\n' +
    '    unaxis config get default_project          show current project root\n' +
    '    unaxis config list                         show all settings\n' +
    '\n' +
    '  Credentials (secrets, stored in ~/.unaxis/.credentials.json):\n' +
    '    unaxis credentials set npm_token <token>   store npm publish token\n' +
    '    unaxis credentials get npm_token           show masked token value\n' +
    '    unaxis credentials list                    list credential keys\n' +
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

const IPC_COMMANDS = ['dev', 'restart', 'list', 'zones', 'logs', 'zone', 'session', 'stack', 'watch', 'db', 'preflight', 'status'] as const
if (args.length > 0 && IPC_COMMANDS.includes(args[0] as typeof IPC_COMMANDS[number])) {
  const { sendIpcCommand } = await import('../ink/ipc-client.js')
  process.exit(await sendIpcCommand(args))
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
