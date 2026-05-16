import { useContext, useEffect, useRef } from 'react'
import stripAnsi from 'strip-ansi'
import { OSC, osc } from '../termio/osc.js'
import { TerminalWriteContext } from '../useTerminalNotification.js'

const CLEAR_TITLE_OSC = osc(OSC.SET_TITLE_AND_ICON, '')

/**
 * Declaratively set the terminal tab/window title.
 *
 * Pass a string to set the title. ANSI escape sequences are stripped
 * automatically so callers don't need to know about terminal encoding.
 * Pass `null` to opt out — the hook becomes a no-op and leaves the
 * terminal title untouched.
 *
 * On Windows, uses `process.title` (classic conhost doesn't support OSC).
 * Elsewhere, writes OSC 0 (set title+icon) via Ink's stdout.
 *
 * Restore-on-exit: captures the original title on first mount and restores
 * it on unmount. gracefulShutdown also clears the title on process exit as
 * a belt-and-suspenders measure.
 */
export function useTerminalTitle(title: string | null): void {
  const writeRaw    = useContext(TerminalWriteContext)
  const originalRef = useRef<string | null>(null)

  useEffect(() => {
    if (title === null || !writeRaw) return

    // Capture original title the first time this hook fires.
    if (originalRef.current === null) {
      originalRef.current = process.title ?? ''
    }

    const clean = stripAnsi(title)

    if (process.platform === 'win32') {
      process.title = clean
    } else {
      writeRaw(osc(OSC.SET_TITLE_AND_ICON, clean))
    }

    // Restore original on unmount or when title prop becomes null.
    return () => {
      const orig = originalRef.current
      if (orig === null) return
      if (process.platform === 'win32') {
        process.title = orig
      } else {
        writeRaw(orig ? osc(OSC.SET_TITLE_AND_ICON, orig) : CLEAR_TITLE_OSC)
      }
    }
  }, [title, writeRaw])
}
