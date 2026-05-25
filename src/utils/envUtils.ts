import memoize from 'lodash-es/memoize.js'
import { homedir } from 'os'
import { join } from 'path'

export const getConfigHomeDir = memoize(
  (): string => {
    // UNAXIS_CONFIG_DIR takes priority; UNENTER_CONFIG_DIR is kept for backwards compat.
    return (
      process.env.UNAXIS_CONFIG_DIR ??
      process.env.UNENTER_CONFIG_DIR ??
      join(homedir(), '.unaxis', 'unenter')
    ).normalize('NFC')
  },
  () => process.env.UNAXIS_CONFIG_DIR ?? process.env.UNENTER_CONFIG_DIR,
)

export const getUnaxisConfigHomeDir = getConfigHomeDir

export function isEnvTruthy(envVar: string | boolean | undefined): boolean {
  if (!envVar) return false
  if (typeof envVar === 'boolean') return envVar
  const normalizedValue = envVar.toLowerCase().trim()
  return ['1', 'true', 'yes', 'on'].includes(normalizedValue)
}

export function isEnvDefinedFalsy(
  envVar: string | boolean | undefined,
): boolean {
  if (envVar === undefined) return false
  if (typeof envVar === 'boolean') return !envVar
  if (!envVar) return false
  const normalizedValue = envVar.toLowerCase().trim()
  return ['0', 'false', 'no', 'off'].includes(normalizedValue)
}

export function parseEnvVars(
  rawEnvArgs: string[] | undefined,
): Record<string, string> {
  const parsedEnv: Record<string, string> = {}
  if (rawEnvArgs) {
    for (const envStr of rawEnvArgs) {
      const [key, ...valueParts] = envStr.split('=')
      if (!key || valueParts.length === 0) {
        throw new Error(
          `Invalid environment variable format: ${envStr}`,
        )
      }
      parsedEnv[key] = valueParts.join('=')
    }
  }
  return parsedEnv
}
