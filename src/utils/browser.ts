import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

function validateUrl(url: string): void {
  let parsedUrl: URL

  try {
    parsedUrl = new URL(url)
  } catch (_error) {
    throw new Error(`Invalid URL format: ${url}`)
  }

  // Validate URL protocol for security
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Invalid URL protocol: must use http:// or https://, got ${parsedUrl.protocol}`,
    )
  }
}

/**
 * Open a file or folder path using the system's default handler.
 * Uses `open` on macOS, `explorer` on Windows, `xdg-open` on Linux.
 */
export async function openPath(path: string): Promise<boolean> {
  try {
    const platform = process.platform
    if (platform === 'win32') {
      await execFileAsync('explorer', [path])
      return true
    }
    const command = platform === 'darwin' ? 'open' : 'xdg-open'
    await execFileAsync(command, [path])
    return true
  } catch (_) {
    return false
  }
}

export async function openBrowser(url: string): Promise<boolean> {
  try {
    // Parse and validate the URL
    validateUrl(url)

    const browserEnv = process.env.BROWSER
    const platform = process.platform

    if (platform === 'win32') {
      if (browserEnv) {
        // browsers require shell, else they will treat this as a file:/// handle
        await execFileAsync(browserEnv, [`"${url}"`], { shell: true })
        return true
      }
      await execFileAsync('rundll32', ['url,OpenURL', url])
      return true
    } else {
      const command =
        browserEnv || (platform === 'darwin' ? 'open' : 'xdg-open')
      await execFileAsync(command, [url])
      return true
    }
  } catch (_) {
    return false
  }
}

