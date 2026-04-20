import { randomBytes } from 'crypto'
import { unwatchFile, watchFile } from 'fs'
import { homedir } from 'os'
import memoize from 'lodash-es/memoize.js'
import pickBy from 'lodash-es/pickBy.js'
import { basename, dirname, join, resolve } from 'path'
import { logForDebugging } from './debug'
import { ConfigParseError, getErrnoCode } from './errors'
import { getFsImplementation } from './fsOperations'
import { stripBOM } from './jsonRead'
import * as lockfile from './lockfile'
import { jsonParse, jsonStringify } from './slowOperations'
import type { ThemeSetting } from './theme'


// ---------------------------------------------------------------------------
// Inline stubs for removed / unavailable imports
// ---------------------------------------------------------------------------

// ── MCP types ───────────────────────────────────────────────────────────────
export type McpServerConfig = {
  command?: string
  url?: string
  type?: string
  args?: string[]
  env?: Record<string, string>
  [key: string]: unknown
}

// ── Memory type ─────────────────────────────────────────────────────────────
export type MemoryType = 'User' | 'Local' | 'Project' | 'Managed' | 'AutoMem'

// ── Model option type ────────────────────────────────────────────────────────
export type ModelOption = {
  id: string
  name: string
  [key: string]: unknown
}

// ── Config home dir ──────────────────────────────────────────────────────────
/** Returns the app config home directory (~/.config/app or equivalent). */
function getConfigHomeDir(): string {
  return join(homedir(), '.config', 'app')
}

/** Returns the global config file path. */
function getGlobalConfigFile(): string {
  return join(getConfigHomeDir(), 'config.json')
}

// ── No-op stubs ──────────────────────────────────────────────────────────────
/** Stub: analytics logEvent — no-op. Override to wire up telemetry. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function logEvent(_name: string, _props: Record<string, unknown>): void { }

/** Stub: log an error — no-op (replace with your own logger). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function logError(_err: unknown): void { }

/** Stub: register a cleanup callback — no-op. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function registerCleanup(_fn: () => Promise<void>): void { }

/** Stub: original cwd — returns process.cwd(). */
function getOriginalCwd(): string {
  return process.cwd()
}

/** Stub: get current working dir. */
function getCwd(): string {
  return process.cwd()
}

/** Stub: session trust accepted — always false. */
function getSessionTrustAccepted(): boolean {
  return false
}

/** Stub: safe JSON parse — returns null on failure. */
function safeParseJSON(text: string): unknown {
  try { return JSON.parse(text) } catch { return null }
}

/** Stub: sync write + flush — falls back to Node fs.writeFileSync. */
function writeFileSyncAndFlush_DEPRECATED(
  file: string,
  data: string,
  options: { encoding: BufferEncoding; mode?: number },
): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs')
  fs.writeFileSync(file, data, options)
}

/** Stub: canonical git root — always returns null (no git detection). */
function findCanonicalGitRoot(_dir: string): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require('child_process') as typeof import('child_process')
    const root = execSync('git rev-parse --show-toplevel', {
      cwd: _dir,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trim()
    return root || null
  } catch {
    return null
  }
}

/** Stub: normalize a filesystem path to use forward slashes. */
function normalizePathForConfigKey(p: string): string {
  return p.replace(/\\/g, '/')
}

/** Stub: managed config file path — returns config home dir. */
function getManagedFilePath(): string {
  return getConfigHomeDir()
}

/**
 * Stub: returns the auto-mem entrypoint path.
 */
function getAutoMemEntrypoint(): string {
  return join(getConfigHomeDir(), 'memory', 'auto.md')
}

/** Stub: check if an env var is truthy. */
function isEnvTruthy(val: string | undefined): boolean {
  return val === '1' || val === 'true' || val === 'yes'
}



// ---------------------------------------------------------------------------
// Re-entrancy guard: prevents getConfig → logEvent → getGlobalConfig → getConfig
// infinite recursion when the config file is corrupted.
// ---------------------------------------------------------------------------
let insideGetConfig = false

// ---------------------------------------------------------------------------
// Pasted-content / history types
// ---------------------------------------------------------------------------

export type ImageDimensions = {
  width: number
  height: number
  originalWidth: number
  originalHeight: number
}

export type PastedContent = {
  id: number
  type: 'text' | 'image'
  content: string
  mediaType?: string
  filename?: string
  dimensions?: ImageDimensions
  sourcePath?: string
}

export interface SerializedStructuredHistoryEntry {
  display: string
  pastedContents?: Record<number, PastedContent>
  pastedText?: string
}

export interface HistoryEntry {
  display: string
  pastedContents: Record<number, PastedContent>
}

export type ReleaseChannel = 'stable' | 'latest'

// ---------------------------------------------------------------------------
// Project config
// ---------------------------------------------------------------------------

export type ProjectConfig = {
  allowedTools: string[]
  mcpContextUris: string[]
  mcpServers?: Record<string, McpServerConfig>
  lastAPIDuration?: number
  lastAPIDurationWithoutRetries?: number
  lastToolDuration?: number
  lastCost?: number
  lastDuration?: number
  lastLinesAdded?: number
  lastLinesRemoved?: number
  lastTotalInputTokens?: number
  lastTotalOutputTokens?: number
  lastTotalCacheCreationInputTokens?: number
  lastTotalCacheReadInputTokens?: number
  lastTotalWebSearchRequests?: number
  lastFpsAverage?: number
  lastFpsLow1Pct?: number
  lastSessionId?: string
  lastModelUsage?: Record<
    string,
    {
      inputTokens: number
      outputTokens: number
      cacheReadInputTokens: number
      cacheCreationInputTokens: number
      webSearchRequests: number
      costUSD: number
    }
  >
  lastSessionMetrics?: Record<string, number>
  exampleFiles?: string[]
  exampleFilesGeneratedAt?: number

  // Trust dialog settings
  hasTrustDialogAccepted?: boolean

  hasCompletedProjectOnboarding?: boolean
  projectOnboardingSeenCount: number
  hasMdExternalIncludesApproved?: boolean
  hasMdExternalIncludesWarningShown?: boolean
  // MCP server approval fields — kept for backward compatibility
  enabledMcpjsonServers?: string[]
  disabledMcpjsonServers?: string[]
  enableAllProjectMcpServers?: boolean
  // List of disabled MCP servers (all scopes) — used for enable/disable toggle
  disabledMcpServers?: string[]
  // Opt-in list for built-in MCP servers that default to disabled
  enabledMcpServers?: string[]
  // Worktree session management
  activeWorktreeSession?: {
    originalCwd: string
    worktreePath: string
    worktreeName: string
    originalBranch?: string
    sessionId: string
    hookBased?: boolean
  }
  /** Spawn mode for remote-control multi-session. */
  remoteControlSpawnMode?: 'same-dir' | 'worktree'
}

const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  allowedTools: [],
  mcpContextUris: [],
  mcpServers: {},
  enabledMcpjsonServers: [],
  disabledMcpjsonServers: [],
  hasTrustDialogAccepted: false,
  projectOnboardingSeenCount: 0,
  hasMdExternalIncludesApproved: false,
  hasMdExternalIncludesWarningShown: false,
}

export type InstallMethod = 'local' | 'native' | 'global' | 'unknown'



// ---------------------------------------------------------------------------
// Global config type
// ---------------------------------------------------------------------------

export type GlobalConfig = {
  /**
   * @deprecated Use settings.apiKeyHelper instead.
   */
  apiKeyHelper?: string
  projects?: Record<string, ProjectConfig>
  numStartups: number
  installMethod?: InstallMethod
  autoUpdates?: boolean
  autoUpdatesProtectedForNative?: boolean
  doctorShownAtSession?: number
  userID?: string
  theme: ThemeSetting
  hasCompletedOnboarding?: boolean
  /** Whether to use a local DMR model provider instead of a remote cloud. */
  useLocalDMR?: boolean
  lastOnboardingVersion?: string
  lastReleaseNotesSeen?: string
  changelogLastFetched?: number
  /** @deprecated Migrated to cache/changelog.md. Keep for migration support. */
  cachedChangelog?: string
  mcpServers?: Record<string, McpServerConfig>
  /** MCP connectors that have successfully connected at least once. */
  mcpEverConnected?: string[]
  preferredNotifChannel: NotificationChannel
  /**
   * @deprecated Use the Notification hook instead.
   */
  customNotifyCommand?: string
  verbose: boolean
  customApiKeyResponses?: {
    approved?: string[]
    rejected?: string[]
  }
  /** Primary API key when no environment variable is set. */
  primaryApiKey?: string
  hasAcknowledgedCostThreshold?: boolean
  oauthAccount?: AccountInfo
  editorMode?: EditorMode
  bypassPermissionsModeAccepted?: boolean
  hasUsedBackslashReturn?: boolean
  autoCompactEnabled: boolean
  showTurnDuration: boolean
  /**
   * @deprecated Use settings.env instead.
   */
  env: { [key: string]: string }
  hasSeenTasksHint?: boolean
  hasUsedStash?: boolean
  hasUsedBackgroundTask?: boolean
  queuedCommandUpHintCount?: number
  diffTool?: DiffTool

  // Terminal setup state tracking
  iterm2SetupInProgress?: boolean
  iterm2BackupPath?: string
  appleTerminalBackupPath?: string
  appleTerminalSetupInProgress?: boolean

  // Key binding setup tracking
  shiftEnterKeyBindingInstalled?: boolean
  optionAsMetaKeyInstalled?: boolean

  // IDE configurations
  autoConnectIde?: boolean
  autoInstallIdeExtension?: boolean

  // IDE dialogs
  hasIdeOnboardingBeenShown?: Record<string, boolean>
  ideHintShownCount?: number
  hasIdeAutoConnectDialogBeenShown?: boolean

  tipsHistory: {
    [tipId: string]: number
  }

  // Feedback survey tracking
  feedbackSurveyState?: {
    lastShownTime?: number
  }

  // Transcript share prompt tracking
  transcriptShareDismissed?: boolean

  // Memory usage tracking
  memoryUsageCount: number

  // Cached feature gate values
  cachedStatsigGates: {
    [gateName: string]: boolean
  }

  // Cached dynamic configs
  cachedDynamicConfigs?: { [configName: string]: unknown }

  // Cached feature flag values
  cachedFeatureFlags?: { [featureName: string]: unknown }

  // Local feature flag overrides
  featureFlagOverrides?: { [featureName: string]: unknown }

  // Emergency tip tracking
  lastShownEmergencyTip?: string

  // File picker gitignore behavior
  respectGitignore: boolean

  // Copy command behavior
  copyFullResponse: boolean

  // Fullscreen in-app text selection behavior
  copyOnSelect?: boolean

  // GitHub repo path mapping for directory switching
  githubRepoPaths?: Record<string, string[]>

  // Terminal emulator to launch for deep links
  deepLinkTerminal?: string

  // Skill usage tracking for autocomplete ranking
  skillUsage?: Record<string, { usageCount: number; lastUsedAt: number }>

  // LSP plugin recommendation preferences
  lspRecommendationDisabled?: boolean
  lspRecommendationNeverPlugins?: string[]
  lspRecommendationIgnoredCount?: number

  /** Plugin hint protocol state. */
  appHints?: {
    plugin?: string[]
    disabled?: boolean
  }

  // Permission explainer configuration
  permissionExplainerEnabled?: boolean

  // Teammate spawn mode
  teammateMode?: 'auto' | 'tmux' | 'in-process'
  teammateDefaultModel?: string | null

  // PR status footer configuration
  prStatusFooterEnabled?: boolean

  // Queue usage tracking
  promptQueueUseCount: number

  // Plan mode usage tracking
  lastPlanModeUse?: number

  // Subscription notice tracking
  subscriptionNoticeCount?: number
  hasAvailableSubscription?: boolean

  // Todo feature configuration
  todoFeatureEnabled: boolean
  showExpandedTodos?: boolean
  showSpinnerTree?: boolean

  // First start time tracking
  firstStartTime?: string

  messageIdleNotifThresholdMs: number

  githubActionSetupCount?: number
  slackAppInstallCount?: number

  // File checkpointing configuration
  fileCheckpointingEnabled: boolean

  // Terminal progress bar configuration (OSC 9;4)
  terminalProgressBarEnabled: boolean

  // Terminal tab status indicator
  showStatusInTerminalTab?: boolean

  // Push-notification toggles
  taskCompleteNotifEnabled?: boolean
  inputNeededNotifEnabled?: boolean
  agentPushNotifEnabled?: boolean

  // Auto-updater tracking
  isAutoUpdaterDisabledByUser?: boolean

  // Model switch callout tracking
  modelSwitchCalloutDismissed?: boolean
  modelSwitchCalloutLastShown?: number
  modelSwitchCalloutVersion?: string

  // Idle-return dialog tracking
  idleReturnDismissed?: boolean

  // Remote callout tracking
  remoteDialogSeen?: boolean

  // Bridge OAuth backoff
  bridgeOauthDeadExpiresAt?: number
  bridgeOauthDeadFailCount?: number

  // Desktop upsell startup dialog tracking
  desktopUpsellSeenCount?: number
  desktopUpsellDismissed?: boolean

  // Remote Control at startup
  remoteControlAtStartup?: boolean

  // Additional model options (fetched during bootstrap)
  additionalModelOptionsCache?: ModelOption[]

  // Version of the last-applied migration set
  migrationVersion?: number
}

// ---------------------------------------------------------------------------
// Default config factory
// ---------------------------------------------------------------------------

function createDefaultGlobalConfig(): GlobalConfig {
  return {
    numStartups: 0,
    installMethod: undefined,
    autoUpdates: undefined,
    theme: 'dark',
    preferredNotifChannel: 'auto',
    verbose: false,
    editorMode: 'normal',
    autoCompactEnabled: true,
    showTurnDuration: true,
    hasSeenTasksHint: false,
    hasUsedStash: false,
    hasUsedBackgroundTask: false,
    queuedCommandUpHintCount: 0,
    diffTool: 'auto',
    customApiKeyResponses: {
      approved: [],
      rejected: [],
    },
    env: {},
    tipsHistory: {},
    memoryUsageCount: 0,
    promptQueueUseCount: 0,
    todoFeatureEnabled: true,
    showExpandedTodos: false,
    messageIdleNotifThresholdMs: 60000,
    autoConnectIde: false,
    autoInstallIdeExtension: true,
    fileCheckpointingEnabled: true,
    terminalProgressBarEnabled: true,
    cachedStatsigGates: {},
    cachedDynamicConfigs: {},
    cachedFeatureFlags: {},
    respectGitignore: true,
    copyFullResponse: false,
  }
}

export const DEFAULT_GLOBAL_CONFIG: GlobalConfig = createDefaultGlobalConfig()

// ---------------------------------------------------------------------------
// Config key lists
// ---------------------------------------------------------------------------

export const GLOBAL_CONFIG_KEYS = [
  'apiKeyHelper',
  'installMethod',
  'autoUpdates',
  'autoUpdatesProtectedForNative',
  'theme',
  'verbose',
  'preferredNotifChannel',
  'shiftEnterKeyBindingInstalled',
  'editorMode',
  'hasUsedBackslashReturn',
  'autoCompactEnabled',
  'showTurnDuration',
  'diffTool',
  'env',
  'tipsHistory',
  'todoFeatureEnabled',
  'showExpandedTodos',
  'messageIdleNotifThresholdMs',
  'autoConnectIde',
  'autoInstallIdeExtension',
  'fileCheckpointingEnabled',
  'terminalProgressBarEnabled',
  'showStatusInTerminalTab',
  'taskCompleteNotifEnabled',
  'inputNeededNotifEnabled',
  'agentPushNotifEnabled',
  'respectGitignore',
  'lspRecommendationDisabled',
  'lspRecommendationNeverPlugins',
  'lspRecommendationIgnoredCount',
  'copyFullResponse',
  'copyOnSelect',
  'permissionExplainerEnabled',
  'prStatusFooterEnabled',
  'remoteControlAtStartup',
  'remoteDialogSeen',
] as const

export type GlobalConfigKey = (typeof GLOBAL_CONFIG_KEYS)[number]

export function isGlobalConfigKey(key: string): key is GlobalConfigKey {
  return GLOBAL_CONFIG_KEYS.includes(key as GlobalConfigKey)
}

export const PROJECT_CONFIG_KEYS = [
  'allowedTools',
  'hasTrustDialogAccepted',
  'hasCompletedProjectOnboarding',
] as const

export type ProjectConfigKey = (typeof PROJECT_CONFIG_KEYS)[number]

// ---------------------------------------------------------------------------
// Trust dialog
// ---------------------------------------------------------------------------

let _trustAccepted = false

export function resetTrustDialogAcceptedCacheForTesting(): void {
  _trustAccepted = false
}

export function checkHasTrustDialogAccepted(): boolean {
  return (_trustAccepted ||= computeTrustDialogAccepted())
}

function computeTrustDialogAccepted(): boolean {
  if (getSessionTrustAccepted()) {
    return true
  }

  const config = getGlobalConfig()
  const projectPath = getProjectPathForConfig()
  const projectConfig = config.projects?.[projectPath]
  if (projectConfig?.hasTrustDialogAccepted) {
    return true
  }

  let currentPath = normalizePathForConfigKey(getCwd())
  while (true) {
    const pathConfig = config.projects?.[currentPath]
    if (pathConfig?.hasTrustDialogAccepted) {
      return true
    }
    const parentPath = normalizePathForConfigKey(resolve(currentPath, '..'))
    if (parentPath === currentPath) {
      break
    }
    currentPath = parentPath
  }

  return false
}

/**
 * Check trust for an arbitrary directory (not the session cwd).
 */
export function isPathTrusted(dir: string): boolean {
  const config = getGlobalConfig()
  let currentPath = normalizePathForConfigKey(resolve(dir))
  while (true) {
    if (config.projects?.[currentPath]?.hasTrustDialogAccepted) return true
    const parentPath = normalizePathForConfigKey(resolve(currentPath, '..'))
    if (parentPath === currentPath) return false
    currentPath = parentPath
  }
}

// ---------------------------------------------------------------------------
// Test stubs
// ---------------------------------------------------------------------------

const TEST_GLOBAL_CONFIG_FOR_TESTING: GlobalConfig = {
  ...DEFAULT_GLOBAL_CONFIG,
  autoUpdates: false,
}
const TEST_PROJECT_CONFIG_FOR_TESTING: ProjectConfig = {
  ...DEFAULT_PROJECT_CONFIG,
}

export function isProjectConfigKey(key: string): key is ProjectConfigKey {
  return PROJECT_CONFIG_KEYS.includes(key as ProjectConfigKey)
}

// ---------------------------------------------------------------------------
// Auth-loss guard
// ---------------------------------------------------------------------------

function wouldLoseAuthState(fresh: {
  oauthAccount?: unknown
  hasCompletedOnboarding?: boolean
}): boolean {
  const cached = globalConfigCache.config
  if (!cached) return false
  const lostOauth =
    cached.oauthAccount !== undefined && fresh.oauthAccount === undefined
  const lostOnboarding =
    cached.hasCompletedOnboarding === true &&
    fresh.hasCompletedOnboarding !== true
  return lostOauth || lostOnboarding
}

// ---------------------------------------------------------------------------
// saveGlobalConfig
// ---------------------------------------------------------------------------

export function saveGlobalConfig(
  updater: (currentConfig: GlobalConfig) => GlobalConfig,
): void {
  if (process.env.NODE_ENV === 'test') {
    const config = updater(TEST_GLOBAL_CONFIG_FOR_TESTING)
    if (config === TEST_GLOBAL_CONFIG_FOR_TESTING) {
      return
    }
    Object.assign(TEST_GLOBAL_CONFIG_FOR_TESTING, config)
    return
  }

  let written: GlobalConfig | null = null
  try {
    const didWrite = saveConfigWithLock(
      getGlobalConfigFile(),
      createDefaultGlobalConfig,
      current => {
        const config = updater(current)
        if (config === current) {
          return current
        }
        written = {
          ...config,
          projects: removeProjectHistory(current.projects),
        }
        return written
      },
    )
    if (didWrite && written) {
      writeThroughGlobalConfigCache(written)
    }
  } catch (error) {
    logForDebugging(`Failed to save config with lock: ${error}`, {
      level: 'error',
    })
    const currentConfig = getConfig(
      getGlobalConfigFile(),
      createDefaultGlobalConfig,
    )
    if (wouldLoseAuthState(currentConfig)) {
      logForDebugging(
        'saveGlobalConfig fallback: re-read config is missing auth that cache has; refusing to write.',
        { level: 'error' },
      )
      logEvent('config_auth_loss_prevented', {})
      return
    }
    const config = updater(currentConfig)
    if (config === currentConfig) {
      return
    }
    written = {
      ...config,
      projects: removeProjectHistory(currentConfig.projects),
    }
    saveConfig(getGlobalConfigFile(), written, DEFAULT_GLOBAL_CONFIG)
    writeThroughGlobalConfigCache(written)
  }
}

// ---------------------------------------------------------------------------
// Global config cache
// ---------------------------------------------------------------------------

let globalConfigCache: { config: GlobalConfig | null; mtime: number } = {
  config: null,
  mtime: 0,
}

let lastReadFileStats: { mtime: number; size: number } | null = null
let configCacheHits = 0
let configCacheMisses = 0
let globalConfigWriteCount = 0

export function getGlobalConfigWriteCount(): number {
  return globalConfigWriteCount
}

export const CONFIG_WRITE_DISPLAY_THRESHOLD = 20

function reportConfigCacheStats(): void {
  const total = configCacheHits + configCacheMisses
  if (total > 0) {
    logEvent('config_cache_stats', {
      cache_hits: configCacheHits,
      cache_misses: configCacheMisses,
      hit_rate: configCacheHits / total,
    })
  }
  configCacheHits = 0
  configCacheMisses = 0
}

// eslint-disable-next-line custom-rules/no-top-level-side-effects
registerCleanup(async () => {
  reportConfigCacheStats()
})

// ---------------------------------------------------------------------------
// Migration helpers
// ---------------------------------------------------------------------------

function migrateConfigFields(config: GlobalConfig): GlobalConfig {
  if (config.installMethod !== undefined) {
    return config
  }

  const legacy = config as GlobalConfig & {
    autoUpdaterStatus?:
    | 'migrated'
    | 'installed'
    | 'disabled'
    | 'enabled'
    | 'no_permissions'
    | 'not_configured'
  }

  let installMethod: InstallMethod = 'unknown'
  let autoUpdates = config.autoUpdates ?? true

  switch (legacy.autoUpdaterStatus) {
    case 'migrated':
      installMethod = 'local'
      break
    case 'installed':
      installMethod = 'native'
      break
    case 'disabled':
      autoUpdates = false
      break
    case 'enabled':
    case 'no_permissions':
    case 'not_configured':
      installMethod = 'global'
      break
    case undefined:
      break
  }

  return {
    ...config,
    installMethod,
    autoUpdates,
  }
}

function removeProjectHistory(
  projects: Record<string, ProjectConfig> | undefined,
): Record<string, ProjectConfig> | undefined {
  if (!projects) {
    return projects
  }

  const cleanedProjects: Record<string, ProjectConfig> = {}
  let needsCleaning = false

  for (const [path, projectConfig] of Object.entries(projects)) {
    const legacy = projectConfig as ProjectConfig & { history?: unknown }
    if (legacy.history !== undefined) {
      needsCleaning = true
      const { history, ...cleanedConfig } = legacy
      void history // suppress unused-var lint
      cleanedProjects[path] = cleanedConfig
    } else {
      cleanedProjects[path] = projectConfig
    }
  }

  return needsCleaning ? cleanedProjects : projects
}

// ---------------------------------------------------------------------------
// Freshness watcher
// ---------------------------------------------------------------------------

const CONFIG_FRESHNESS_POLL_MS = 1000
let freshnessWatcherStarted = false

function startGlobalConfigFreshnessWatcher(): void {
  if (freshnessWatcherStarted || process.env.NODE_ENV === 'test') return
  freshnessWatcherStarted = true
  const file = getGlobalConfigFile()
  watchFile(
    file,
    { interval: CONFIG_FRESHNESS_POLL_MS, persistent: false },
    curr => {
      if (curr.mtimeMs <= globalConfigCache.mtime) return
      void getFsImplementation()
        .readFile(file, { encoding: 'utf-8' })
        .then(content => {
          if (curr.mtimeMs <= globalConfigCache.mtime) return
          const parsed = safeParseJSON(stripBOM(content))
          if (parsed === null || typeof parsed !== 'object') return
          globalConfigCache = {
            config: migrateConfigFields({
              ...createDefaultGlobalConfig(),
              ...(parsed as Partial<GlobalConfig>),
            }),
            mtime: curr.mtimeMs,
          }
          lastReadFileStats = { mtime: curr.mtimeMs, size: curr.size }
        })
        .catch(() => { })
    },
  )
  registerCleanup(async () => {
    unwatchFile(file)
    freshnessWatcherStarted = false
  })
}

function writeThroughGlobalConfigCache(config: GlobalConfig): void {
  globalConfigCache = { config, mtime: Date.now() }
  lastReadFileStats = null
}

// ---------------------------------------------------------------------------
// getGlobalConfig
// ---------------------------------------------------------------------------

export function getGlobalConfig(): GlobalConfig {
  if (process.env.NODE_ENV === 'test') {
    return TEST_GLOBAL_CONFIG_FOR_TESTING
  }

  if (globalConfigCache.config) {
    configCacheHits++
    return globalConfigCache.config
  }

  configCacheMisses++
  try {
    let stats: { mtimeMs: number; size: number } | null = null
    try {
      stats = getFsImplementation().statSync(getGlobalConfigFile())
    } catch {
      // File doesn't exist
    }
    const config = migrateConfigFields(
      getConfig(getGlobalConfigFile(), createDefaultGlobalConfig),
    )
    globalConfigCache = {
      config,
      mtime: stats?.mtimeMs ?? Date.now(),
    }
    lastReadFileStats = stats
      ? { mtime: stats.mtimeMs, size: stats.size }
      : null
    startGlobalConfigFreshnessWatcher()
    return config
  } catch {
    return migrateConfigFields(
      getConfig(getGlobalConfigFile(), createDefaultGlobalConfig),
    )
  }
}

// ---------------------------------------------------------------------------
// getRemoteControlAtStartup
// ---------------------------------------------------------------------------

export function getRemoteControlAtStartup(): boolean {
  const explicit = getGlobalConfig().remoteControlAtStartup
  if (explicit !== undefined) return explicit
  return false
}

// ---------------------------------------------------------------------------
// Custom API key status
// ---------------------------------------------------------------------------

export function getCustomApiKeyStatus(
  truncatedApiKey: string,
): 'approved' | 'rejected' | 'new' {
  const config = getGlobalConfig()
  if (config.customApiKeyResponses?.approved?.includes(truncatedApiKey)) {
    return 'approved'
  }
  if (config.customApiKeyResponses?.rejected?.includes(truncatedApiKey)) {
    return 'rejected'
  }
  return 'new'
}

// ---------------------------------------------------------------------------
// Low-level save helpers
// ---------------------------------------------------------------------------

function saveConfig<A extends object>(
  file: string,
  config: A,
  defaultConfig: A,
): void {
  const dir = dirname(file)
  const fs = getFsImplementation()
  fs.mkdirSync(dir)

  const filteredConfig = pickBy(
    config,
    (value, key) =>
      jsonStringify(value) !== jsonStringify(defaultConfig[key as keyof A]),
  )
  writeFileSyncAndFlush_DEPRECATED(
    file,
    jsonStringify(filteredConfig, null, 2),
    {
      encoding: 'utf-8',
      mode: 0o600,
    },
  )
  if (file === getGlobalConfigFile()) {
    globalConfigWriteCount++
  }
}

function saveConfigWithLock<A extends object>(
  file: string,
  createDefault: () => A,
  mergeFn: (current: A) => A,
): boolean {
  const defaultConfig = createDefault()
  const dir = dirname(file)
  const fs = getFsImplementation()

  fs.mkdirSync(dir)

  let release
  try {
    const lockFilePath = `${file}.lock`
    const startTime = Date.now()
    release = lockfile.lockSync(file, {
      lockfilePath: lockFilePath,
      onCompromised: err => {
        logForDebugging(`Config lock compromised: ${err}`, { level: 'error' })
      },
    })
    const lockTime = Date.now() - startTime
    if (lockTime > 100) {
      logForDebugging(
        'Lock acquisition took longer than expected — another instance may be running',
      )
      logEvent('config_lock_contention', {
        lock_time_ms: lockTime,
      })
    }

    if (lastReadFileStats && file === getGlobalConfigFile()) {
      try {
        const currentStats = fs.statSync(file)
        if (
          currentStats.mtimeMs !== lastReadFileStats.mtime ||
          currentStats.size !== lastReadFileStats.size
        ) {
          logEvent('config_stale_write', {
            read_mtime: lastReadFileStats.mtime,
            write_mtime: currentStats.mtimeMs,
            read_size: lastReadFileStats.size,
            write_size: currentStats.size,
          })
        }
      } catch (e) {
        const code = getErrnoCode(e)
        if (code !== 'ENOENT') {
          throw e
        }
      }
    }

    const currentConfig = getConfig(file, createDefault)
    if (file === getGlobalConfigFile() && wouldLoseAuthState(currentConfig)) {
      logForDebugging(
        'saveConfigWithLock: re-read config is missing auth that cache has; refusing to write. See GH #3117.',
        { level: 'error' },
      )
      logEvent('config_auth_loss_prevented', {})
      return false
    }

    const mergedConfig = mergeFn(currentConfig)

    if (mergedConfig === currentConfig) {
      return false
    }

    const filteredConfig = pickBy(
      mergedConfig,
      (value, key) =>
        jsonStringify(value) !== jsonStringify(defaultConfig[key as keyof A]),
    )

    // Create timestamped backup before writing
    try {
      const fileBase = basename(file)
      const backupDir = getConfigBackupDir()

      try {
        fs.mkdirSync(backupDir)
      } catch (mkdirErr) {
        const mkdirCode = getErrnoCode(mkdirErr)
        if (mkdirCode !== 'EEXIST') {
          throw mkdirErr
        }
      }

      const MIN_BACKUP_INTERVAL_MS = 60_000
      const existingBackups = fs
        .readdirStringSync(backupDir)
        .filter(f => f.startsWith(`${fileBase}.backup.`))
        .sort()
        .reverse()

      const mostRecentBackup = existingBackups[0]
      const mostRecentTimestamp = mostRecentBackup
        ? Number(mostRecentBackup.split('.backup.').pop())
        : 0
      const shouldCreateBackup =
        Number.isNaN(mostRecentTimestamp) ||
        Date.now() - mostRecentTimestamp >= MIN_BACKUP_INTERVAL_MS

      if (shouldCreateBackup) {
        const backupPath = join(backupDir, `${fileBase}.backup.${Date.now()}`)
        fs.copyFileSync(file, backupPath)
      }

      const MAX_BACKUPS = 5
      const backupsForCleanup = shouldCreateBackup
        ? fs
          .readdirStringSync(backupDir)
          .filter(f => f.startsWith(`${fileBase}.backup.`))
          .sort()
          .reverse()
        : existingBackups

      for (const oldBackup of backupsForCleanup.slice(MAX_BACKUPS)) {
        try {
          fs.unlinkSync(join(backupDir, oldBackup))
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch (e) {
      const code = getErrnoCode(e)
      if (code !== 'ENOENT') {
        logForDebugging(`Failed to backup config: ${e}`, {
          level: 'error',
        })
      }
    }

    writeFileSyncAndFlush_DEPRECATED(
      file,
      jsonStringify(filteredConfig, null, 2),
      {
        encoding: 'utf-8',
        mode: 0o600,
      },
    )
    if (file === getGlobalConfigFile()) {
      globalConfigWriteCount++
    }
    return true
  } finally {
    if (release) {
      release()
    }
  }
}

// ---------------------------------------------------------------------------
// enableConfigs
// ---------------------------------------------------------------------------

let configReadingAllowed = false

export function enableConfigs(): void {
  if (configReadingAllowed) {
    return
  }

  configReadingAllowed = true
  getConfig(
    getGlobalConfigFile(),
    createDefaultGlobalConfig,
    true /* throw on invalid */,
  )
}

// ---------------------------------------------------------------------------
// Backup helpers
// ---------------------------------------------------------------------------

function getConfigBackupDir(): string {
  return join(getConfigHomeDir(), 'backups')
}

function findMostRecentBackup(file: string): string | null {
  const fs = getFsImplementation()
  const fileBase = basename(file)
  const backupDir = getConfigBackupDir()

  try {
    const backups = fs
      .readdirStringSync(backupDir)
      .filter(f => f.startsWith(`${fileBase}.backup.`))
      .sort()

    const mostRecent = backups.at(-1)
    if (mostRecent) {
      return join(backupDir, mostRecent)
    }
  } catch {
    // Backup dir doesn't exist yet
  }

  const fileDir = dirname(file)

  try {
    const backups = fs
      .readdirStringSync(fileDir)
      .filter(f => f.startsWith(`${fileBase}.backup.`))
      .sort()

    const mostRecent = backups.at(-1)
    if (mostRecent) {
      return join(fileDir, mostRecent)
    }

    const legacyBackup = `${file}.backup`
    try {
      fs.statSync(legacyBackup)
      return legacyBackup
    } catch {
      // Legacy backup doesn't exist
    }
  } catch {
    // Ignore errors reading directory
  }

  return null
}

// ---------------------------------------------------------------------------
// getConfig (core read)
// ---------------------------------------------------------------------------

function getConfig<A>(
  file: string,
  createDefault: () => A,
  throwOnInvalid?: boolean,
): A {
  if (!configReadingAllowed && process.env.NODE_ENV !== 'test') {
    throw new Error('Config accessed before allowed.')
  }

  const fs = getFsImplementation()

  try {
    const fileContent = fs.readFileSync(file, {
      encoding: 'utf-8',
    })
    try {
      const parsedConfig = jsonParse(stripBOM(fileContent))
      return {
        ...createDefault(),
        ...parsedConfig,
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      throw new ConfigParseError(errorMessage, file, createDefault())
    }
  } catch (error) {
    const errCode = getErrnoCode(error)
    if (errCode === 'ENOENT') {
      const backupPath = findMostRecentBackup(file)
      if (backupPath) {
        process.stderr.write(
          `\nConfiguration file not found at: ${file}\n` +
          `A backup file exists at: ${backupPath}\n` +
          `You can manually restore it by running: cp "${backupPath}" "${file}"\n\n`,
        )
      }
      return createDefault()
    }

    if (error instanceof ConfigParseError && throwOnInvalid) {
      throw error
    }

    if (error instanceof ConfigParseError) {
      logForDebugging(
        `Config file corrupted, resetting to defaults: ${error.message}`,
        { level: 'error' },
      )

      if (!insideGetConfig) {
        insideGetConfig = true
        try {
          logError(error)

          let hasBackup = false
          try {
            fs.statSync(`${file}.backup`)
            hasBackup = true
          } catch {
            // No backup
          }
          logEvent('config_parse_error', {
            has_backup: hasBackup,
          })
        } finally {
          insideGetConfig = false
        }
      }

      process.stderr.write(
        `\nConfiguration file at ${file} is corrupted: ${error.message}\n`,
      )

      const fileBase = basename(file)
      const corruptedBackupDir = getConfigBackupDir()

      try {
        fs.mkdirSync(corruptedBackupDir)
      } catch (mkdirErr) {
        const mkdirCode = getErrnoCode(mkdirErr)
        if (mkdirCode !== 'EEXIST') {
          throw mkdirErr
        }
      }

      const existingCorruptedBackups = fs
        .readdirStringSync(corruptedBackupDir)
        .filter(f => f.startsWith(`${fileBase}.corrupted.`))

      let corruptedBackupPath: string | undefined
      let alreadyBackedUp = false

      const currentContent = fs.readFileSync(file, { encoding: 'utf-8' })
      for (const backup of existingCorruptedBackups) {
        try {
          const backupContent = fs.readFileSync(
            join(corruptedBackupDir, backup),
            { encoding: 'utf-8' },
          )
          if (currentContent === backupContent) {
            alreadyBackedUp = true
            break
          }
        } catch {
          // Ignore read errors on backups
        }
      }

      if (!alreadyBackedUp) {
        corruptedBackupPath = join(
          corruptedBackupDir,
          `${fileBase}.corrupted.${Date.now()}`,
        )
        try {
          fs.copyFileSync(file, corruptedBackupPath)
          logForDebugging(
            `Corrupted config backed up to: ${corruptedBackupPath}`,
            {
              level: 'error',
            },
          )
        } catch {
          // Ignore backup errors
        }
      }

      const backupPath = findMostRecentBackup(file)
      if (corruptedBackupPath) {
        process.stderr.write(
          `The corrupted file has been backed up to: ${corruptedBackupPath}\n`,
        )
      } else if (alreadyBackedUp) {
        process.stderr.write(`The corrupted file has already been backed up.\n`)
      }

      if (backupPath) {
        process.stderr.write(
          `A backup file exists at: ${backupPath}\n` +
          `You can manually restore it by running: cp "${backupPath}" "${file}"\n\n`,
        )
      } else {
        process.stderr.write(`\n`)
      }
    }

    return createDefault()
  }
}

// ---------------------------------------------------------------------------
// Project path resolution
// ---------------------------------------------------------------------------

export const getProjectPathForConfig = memoize((): string => {
  const originalCwd = getOriginalCwd()
  const gitRoot = findCanonicalGitRoot(originalCwd)

  if (gitRoot) {
    return normalizePathForConfigKey(gitRoot)
  }

  return normalizePathForConfigKey(resolve(originalCwd))
})

// ---------------------------------------------------------------------------
// Project config accessors
// ---------------------------------------------------------------------------

export function getCurrentProjectConfig(): ProjectConfig {
  if (process.env.NODE_ENV === 'test') {
    return TEST_PROJECT_CONFIG_FOR_TESTING
  }

  const absolutePath = getProjectPathForConfig()
  const config = getGlobalConfig()

  if (!config.projects) {
    return DEFAULT_PROJECT_CONFIG
  }

  const projectConfig = config.projects[absolutePath] ?? DEFAULT_PROJECT_CONFIG
  if (typeof projectConfig.allowedTools === 'string') {
    projectConfig.allowedTools =
      (safeParseJSON(projectConfig.allowedTools) as string[]) ?? []
  }

  return projectConfig
}

export function saveCurrentProjectConfig(
  updater: (currentConfig: ProjectConfig) => ProjectConfig,
): void {
  if (process.env.NODE_ENV === 'test') {
    const config = updater(TEST_PROJECT_CONFIG_FOR_TESTING)
    if (config === TEST_PROJECT_CONFIG_FOR_TESTING) {
      return
    }
    Object.assign(TEST_PROJECT_CONFIG_FOR_TESTING, config)
    return
  }
  const absolutePath = getProjectPathForConfig()

  let written: GlobalConfig | null = null
  try {
    const didWrite = saveConfigWithLock(
      getGlobalConfigFile(),
      createDefaultGlobalConfig,
      current => {
        const currentProjectConfig =
          current.projects?.[absolutePath] ?? DEFAULT_PROJECT_CONFIG
        const newProjectConfig = updater(currentProjectConfig)
        if (newProjectConfig === currentProjectConfig) {
          return current
        }
        written = {
          ...current,
          projects: {
            ...current.projects,
            [absolutePath]: newProjectConfig,
          },
        }
        return written
      },
    )
    if (didWrite && written) {
      writeThroughGlobalConfigCache(written)
    }
  } catch (error) {
    logForDebugging(`Failed to save config with lock: ${error}`, {
      level: 'error',
    })

    const config = getConfig(getGlobalConfigFile(), createDefaultGlobalConfig)
    if (wouldLoseAuthState(config)) {
      logForDebugging(
        'saveCurrentProjectConfig fallback: re-read config is missing auth that cache has; refusing to write. See GH #3117.',
        { level: 'error' },
      )
      logEvent('config_auth_loss_prevented', {})
      return
    }
    const currentProjectConfig =
      config.projects?.[absolutePath] ?? DEFAULT_PROJECT_CONFIG
    const newProjectConfig = updater(currentProjectConfig)
    if (newProjectConfig === currentProjectConfig) {
      return
    }
    written = {
      ...config,
      projects: {
        ...config.projects,
        [absolutePath]: newProjectConfig,
      },
    }
    saveConfig(getGlobalConfigFile(), written, DEFAULT_GLOBAL_CONFIG)
    writeThroughGlobalConfigCache(written)
  }
}

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------

export function isAutoUpdaterDisabled(): boolean {
  return getAutoUpdaterDisabledReason() !== null
}

export function shouldSkipPluginAutoupdate(): boolean {
  return (
    isAutoUpdaterDisabled() &&
    !isEnvTruthy(process.env.FORCE_AUTOUPDATE_PLUGINS)
  )
}

export type AutoUpdaterDisabledReason =
  | { type: 'development' }
  | { type: 'env'; envVar: string }
  | { type: 'config' }

export function formatAutoUpdaterDisabledReason(
  reason: AutoUpdaterDisabledReason,
): string {
  switch (reason.type) {
    case 'development':
      return 'development build'
    case 'env':
      return `${reason.envVar} set`
    case 'config':
      return 'config'
  }
}

export function getAutoUpdaterDisabledReason(): AutoUpdaterDisabledReason | null {
  if (process.env.NODE_ENV === 'development') {
    return { type: 'development' }
  }
  if (isEnvTruthy(process.env.DISABLE_AUTOUPDATER)) {
    return { type: 'env', envVar: 'DISABLE_AUTOUPDATER' }
  }
  const config = getGlobalConfig()
  if (
    config.autoUpdates === false &&
    (config.installMethod !== 'native' ||
      config.autoUpdatesProtectedForNative !== true)
  ) {
    return { type: 'config' }
  }
  return null
}

// ---------------------------------------------------------------------------
// User ID
// ---------------------------------------------------------------------------

export function getOrCreateUserID(): string {
  const config = getGlobalConfig()
  if (config.userID) {
    return config.userID
  }

  const userID = randomBytes(32).toString('hex')
  saveGlobalConfig(current => ({ ...current, userID }))
  return userID
}

// ---------------------------------------------------------------------------
// First start time
// ---------------------------------------------------------------------------

export function recordFirstStartTime(): void {
  const config = getGlobalConfig()
  if (!config.firstStartTime) {
    const firstStartTime = new Date().toISOString()
    saveGlobalConfig(current => ({
      ...current,
      firstStartTime: current.firstStartTime ?? firstStartTime,
    }))
  }
}

// ---------------------------------------------------------------------------
// Memory paths
// ---------------------------------------------------------------------------

export function getMemoryPath(memoryType: MemoryType): string {
  const cwd = getOriginalCwd()

  switch (memoryType) {
    case 'User':
      return join(getConfigHomeDir(), 'MEMORY.md')
    case 'Local':
      return join(cwd, 'APP.local.md')
    case 'Project':
      return join(cwd, 'APP.md')
    case 'Managed':
      return join(getManagedFilePath(), 'APP.md')
    case 'AutoMem':
      return getAutoMemEntrypoint()
  }
  return ''
}

export function getManagedRulesDir(): string {
  return join(getManagedFilePath(), '.app', 'rules')
}

export function getUserRulesDir(): string {
  return join(getConfigHomeDir(), 'rules')
}

// ---------------------------------------------------------------------------
// Testing exports
// ---------------------------------------------------------------------------

export const _getConfigForTesting = getConfig
export const _wouldLoseAuthStateForTesting = wouldLoseAuthState
export function _setGlobalConfigCacheForTesting(
  config: GlobalConfig | null,
): void {
  globalConfigCache.config = config
  globalConfigCache.mtime = config ? Date.now() : 0
}
