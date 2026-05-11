// src/utils/install/pathCheck.ts
// ─────────────────────────────────────────────────────────────────────────────
// PATH validation utility — detects whether the UNAXIS bin location is on
// the user's PATH and generates add instructions if not.
//
// Not wired yet. Intended for: unaxis doctor, post-install output.
// Do not auto-mutate PATH or shell startup files.
// ─────────────────────────────────────────────────────────────────────────────

import { delimiter } from 'path'

/**
 * Returns true if dir appears in the current process PATH.
 * Comparison is case-insensitive on Windows.
 */
export function isOnPath(dir: string): boolean {
  const pathEnv = process.env['PATH'] ?? ''
  const entries = pathEnv.split(delimiter)
  const normalize = (s: string) =>
    process.platform === 'win32' ? s.toLowerCase().replace(/\\/g, '/') : s
  return entries.some(e => normalize(e) === normalize(dir))
}

/**
 * Returns human-readable instructions for adding dir to PATH.
 * Printed to stdout, never executed automatically.
 */
export function pathAddInstructions(dir: string): string {
  if (process.platform === 'win32') {
    return [
      '',
      '  Add this folder to your User PATH:',
      '    ' + dir,
      '',
      '  How:',
      '    Settings -> System -> Advanced system settings',
      '    -> Environment Variables -> User variables -> Path -> Edit',
      '',
    ].join('\n')
  }
  return [
    '',
    '  Add this to ~/.zshrc or ~/.bashrc:',
    '    export PATH="' + dir + ':$PATH"',
    '',
  ].join('\n')
}
