import memoize from 'lodash-es/memoize.js'
import { homedir } from 'os'
import { join } from 'path'
import { isRunningWithBun } from './bundledMode.js'
import { getConfigHomeDir, isEnvTruthy } from './envUtils.js'
import { findExecutable } from './findExecutable.js'
import { getFsImplementation } from './fsOperations.js'
import { which } from './which.js'

type Platform = 'win32' | 'darwin' | 'linux'

// Config and data paths
export const getGlobalConfigFile = memoize((): string => {
  // Legacy fallback for backwards compatibility
  if (
    getFsImplementation().existsSync(
      join(getConfigHomeDir(), '.config.json'),
    )
  ) {
    return join(getConfigHomeDir(), '.config.json')
  }

  const filename = '.config.json'
  return join(process.env.UNENTER_CONFIG_DIR || homedir(), filename)
})

const hasInternetAccess = memoize(async (): Promise<boolean> => {
  try {
    const { default: axiosClient } = await import('axios')
    await axiosClient.head('http://1.1.1.1', {
      signal: AbortSignal.timeout(1000),
    })
    return true
  } catch {
    return false
  }
})

async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    return !!(await which(command))
  } catch {
    return false
  }
}

const detectPackageManagers = memoize(async (): Promise<string[]> => {
  const packageManagers = []
  if (await isCommandAvailable('npm')) packageManagers.push('npm')
  if (await isCommandAvailable('yarn')) packageManagers.push('yarn')
  if (await isCommandAvailable('pnpm')) packageManagers.push('pnpm')
  return packageManagers
})

const detectRuntimes = memoize(async (): Promise<string[]> => {
  const runtimes = []
  if (await isCommandAvailable('bun')) runtimes.push('bun')
  if (await isCommandAvailable('deno')) runtimes.push('deno')
  if (await isCommandAvailable('node')) runtimes.push('node')
  return runtimes
})

const isWslEnvironment = memoize((): boolean => {
  try {
    return getFsImplementation().existsSync(
      '/proc/sys/fs/binfmt_misc/WSLInterop',
    )
  } catch {
    return false
  }
})

const isNpmFromWindowsPath = memoize((): boolean => {
  try {
    if (!isWslEnvironment()) return false
    const { cmd } = findExecutable('npm', [])
    return cmd.startsWith('/mnt/c/')
  } catch {
    return false
  }
})

export const JETBRAINS_IDES = [
  'pycharm', 'intellij', 'webstorm', 'phpstorm', 'rubymine', 
  'clion', 'goland', 'rider', 'datagrip', 'appcode', 
  'dataspell', 'aqua', 'gateway', 'fleet', 'jetbrains', 'androidstudio'
]

function detectTerminal(): string | null {
  if (process.env.CURSOR_TRACE_ID) return 'cursor'
  if (process.env.VSCODE_GIT_ASKPASS_MAIN?.includes('cursor')) return 'cursor'
  if (process.env.VSCODE_GIT_ASKPASS_MAIN?.includes('windsurf')) return 'windsurf'
  if (process.env.VSCODE_GIT_ASKPASS_MAIN?.includes('antigravity')) return 'antigravity'
  
  const bundleId = process.env.__CFBundleIdentifier?.toLowerCase()
  if (bundleId?.includes('vscodium')) return 'codium'
  if (bundleId?.includes('windsurf')) return 'windsurf'
  if (bundleId?.includes('com.google.android.studio')) return 'androidstudio'
  
  if (bundleId) {
    for (const ide of JETBRAINS_IDES) {
      if (bundleId.includes(ide)) return ide
    }
  }

  if (process.env.VisualStudioVersion) return 'visualstudio'
  if (process.env.TERMINAL_EMULATOR === 'JetBrains-JediTerm') return 'pycharm'
  if (process.env.TERM === 'xterm-ghostty') return 'ghostty'
  if (process.env.TERM?.includes('kitty')) return 'kitty'
  if (process.env.TERM_PROGRAM) return process.env.TERM_PROGRAM
  if (process.env.TMUX) return 'tmux'
  if (process.env.STY) return 'screen'
  if (process.env.WT_SESSION) return 'windows-terminal'
  
  if (process.env.TERM) {
    const term = process.env.TERM
    if (term.includes('alacritty')) return 'alacritty'
    if (term.includes('rxvt')) return 'rxvt'
    if (term.includes('termite')) return 'termite'
    return process.env.TERM
  }

  if (!process.stdout.isTTY) return 'non-interactive'
  return null
}

export const detectDeploymentEnvironment = memoize((): string => {
  if (isEnvTruthy(process.env.GITHUB_ACTIONS)) return 'github-actions'
  if (isEnvTruthy(process.env.VERCEL)) return 'vercel'
  if (process.env.KUBERNETES_SERVICE_HOST) return 'kubernetes'
  
  try {
    if (getFsImplementation().existsSync('/.dockerenv')) return 'docker'
  } catch { }

  if (process.platform === 'darwin') return 'unknown-darwin'
  if (process.platform === 'linux') return 'unknown-linux'
  if (process.platform === 'win32') return 'unknown-win32'

  return 'unknown'
})

export const env = {
  hasInternetAccess,
  isCI: isEnvTruthy(process.env.CI),
  platform: (['win32', 'darwin'].includes(process.platform)
    ? process.platform
    : 'linux') as Platform,
  arch: process.arch,
  nodeVersion: process.version,
  terminal: detectTerminal(),
  getPackageManagers: detectPackageManagers,
  getRuntimes: detectRuntimes,
  isRunningWithBun: memoize(isRunningWithBun),
  isWslEnvironment,
  isNpmFromWindowsPath,
  detectDeploymentEnvironment,
}

export function getHostPlatformForAnalytics(): Platform {
  const override = process.env.HOST_PLATFORM_OVERRIDE
  if (override === 'win32' || override === 'darwin' || override === 'linux') {
    return override
  }
  return env.platform
}
