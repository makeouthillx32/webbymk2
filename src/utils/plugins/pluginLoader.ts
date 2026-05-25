import { readdir, readFile, stat } from 'fs/promises'
import { join } from 'path'

export type UnaxisPluginManifest = {
  name: string
  version?: string
  description?: string
  runtime?: 'tui' | 'web' | 'zone' | 'unknown'
}

export type LoadedPlugin = {
  name: string
  path: string
  manifest: UnaxisPluginManifest
}

export type PluginError = {
  path: string
  message: string
}

export type PluginLoadResult = {
  plugins: LoadedPlugin[]
  errors: PluginError[]
}

export function getPluginCachePath(): string {
  return join(process.cwd(), '.unaxis', 'plugins', 'cache')
}

export async function loadPluginsFromDirectory(
  directory: string,
): Promise<PluginLoadResult> {
  const plugins: LoadedPlugin[] = []
  const errors: PluginError[] = []

  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch (error) {
    return {
      plugins,
      errors: [{ path: directory, message: errorMessage(error) }],
    }
  }

  for (const entry of entries) {
    const pluginPath = join(directory, entry)
    try {
      const info = await stat(pluginPath)
      if (!info.isDirectory()) continue

      const manifest = await readPluginManifest(pluginPath)
      plugins.push({
        name: manifest.name,
        path: pluginPath,
        manifest,
      })
    } catch (error) {
      errors.push({ path: pluginPath, message: errorMessage(error) })
    }
  }

  return { plugins, errors }
}

export async function readPluginManifest(
  pluginPath: string,
): Promise<UnaxisPluginManifest> {
  const manifestPath = join(pluginPath, 'plugin.json')
  const content = await readFile(manifestPath, 'utf-8')
  const parsed = JSON.parse(content) as Partial<UnaxisPluginManifest>

  if (!parsed.name || typeof parsed.name !== 'string') {
    throw new Error('plugin.json must include a string name')
  }

  return {
    name: parsed.name,
    version: parsed.version,
    description: parsed.description,
    runtime: parsed.runtime ?? 'unknown',
  }
}

export async function loadPlugins(): Promise<PluginLoadResult> {
  return loadPluginsFromDirectory(join(process.cwd(), '.unaxis', 'plugins'))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
