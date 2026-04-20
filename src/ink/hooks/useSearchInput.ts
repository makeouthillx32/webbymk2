import { useCallback, useState } from 'react'
import { KeyboardEvent } from '../events/keyboard-event.js'
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- backward-compat bridge until consumers wire handleKeyDown to <Box onKeyDown>
import { useInput } from '../../ink.js'

type UseSearchInputOptions = {
  isActive: boolean
  onExit: () => void
  /** Esc + Ctrl+C abandon (distinct from onExit = Enter commit). When
   *  provided: single-Esc calls this directly (no clear-first-then-exit
   *  two-press). When absent: current behavior — Esc clears non-empty
   *  query, exits on empty; Ctrl+C silently swallowed (no switch case). */
  onCancel?: () => void
  onExitUp?: () => void
  columns?: number
  passthroughCtrlKeys?: string[]
  initialQuery?: string
  /** Backspace (and ctrl+h) on empty query calls onCancel ?? onExit — the
   *  less/vim "delete past the /" convention. Dialogs that want Esc-only
   *  cancel set this false so a held backspace doesn't eject the user. */
  backspaceExitsOnEmpty?: boolean
}

type UseSearchInputReturn = {
  query: string
  setQuery: (q: string) => void
  cursorOffset: number
  handleKeyDown: (e: KeyboardEvent) => void
}

// Special key names that fall through the explicit handlers above the
// text-input branch (return/escape/arrows/home/end/tab/backspace/delete
// all early-return). Reject these so e.g. PageUp doesn't leak 'pageup'
// as literal text. The length>=1 check below is intentionally loose —
// batched input like stdin.write('abc') arrives as one multi-char e.key,
// matching the old useInput(input) behavior where cursor.insert(input)
// inserted the full chunk.
const UNHANDLED_SPECIAL_KEYS = new Set([
  'pageup',
  'pagedown',
  'insert',
  'wheelup',
  'wheeldown',
  'mouse',
  'f1',
  'f2',
  'f3',
  'f4',
  'f5',
  'f6',
  'f7',
  'f8',
  'f9',
  'f10',
  'f11',
  'f12',
])

export function useSearchInput({
  isActive,
  onExit,
  onCancel,
  onExitUp,
  passthroughCtrlKeys = [],
  initialQuery = '',
  backspaceExitsOnEmpty = true,
}: UseSearchInputOptions): UseSearchInputReturn {
  const [query, setQueryState] = useState(initialQuery)
  const [cursorOffset, setCursorOffset] = useState(initialQuery.length)

  const setQuery = useCallback((q: string) => {
    setQueryState(q)
    setCursorOffset(q.length)
  }, [])

  const handleKeyDown = (e: KeyboardEvent): void => {
    if (!isActive) return

    // Check passthrough ctrl keys
    if (e.ctrl && passthroughCtrlKeys.includes(e.key.toLowerCase())) {
      return
    }

    // Exit conditions
    if (e.key === 'return' || e.key === 'down') {
      e.preventDefault()
      onExit()
      return
    }
    if (e.key === 'up') {
      e.preventDefault()
      if (onExitUp) {
        onExitUp()
      }
      return
    }
    if (e.key === 'escape') {
      e.preventDefault()
      if (onCancel) {
        onCancel()
      } else if (query.length > 0) {
        setQueryState('')
        setCursorOffset(0)
      } else {
        onExit()
      }
      return
    }

    // Backspace/Delete
    if (e.key === 'backspace') {
      e.preventDefault()
      if (query.length === 0) {
        if (backspaceExitsOnEmpty) (onCancel ?? onExit)()
        return
      }
      if (cursorOffset > 0) {
        const newQuery = query.slice(0, cursorOffset - 1) + query.slice(cursorOffset)
        setQueryState(newQuery)
        setCursorOffset(cursorOffset - 1)
      }
      return
    }

    if (e.key === 'delete') {
      e.preventDefault()
      if (cursorOffset < query.length) {
        const newQuery = query.slice(0, cursorOffset) + query.slice(cursorOffset + 1)
        setQueryState(newQuery)
      }
      return
    }

    // Plain arrow keys
    if (e.key === 'left') {
      e.preventDefault()
      setCursorOffset(Math.max(0, cursorOffset - 1))
      return
    }
    if (e.key === 'right') {
      e.preventDefault()
      setCursorOffset(Math.min(query.length, cursorOffset + 1))
      return
    }

    // Home/End
    if (e.key === 'home') {
      e.preventDefault()
      setCursorOffset(0)
      return
    }
    if (e.key === 'end') {
      e.preventDefault()
      setCursorOffset(query.length)
      return
    }

    // Ctrl key bindings
    if (e.ctrl) {
      e.preventDefault()
      switch (e.key.toLowerCase()) {
        case 'a':
          setCursorOffset(0)
          return
        case 'e':
          setCursorOffset(query.length)
          return
        case 'b':
          setCursorOffset(Math.max(0, cursorOffset - 1))
          return
        case 'f':
          setCursorOffset(Math.min(query.length, cursorOffset + 1))
          return
        case 'd': {
          if (query.length === 0) {
            ; (onCancel ?? onExit)()
            return
          }
          if (cursorOffset < query.length) {
            const newQuery = query.slice(0, cursorOffset) + query.slice(cursorOffset + 1)
            setQueryState(newQuery)
          }
          return
        }
        case 'h': {
          if (query.length === 0) {
            if (backspaceExitsOnEmpty) (onCancel ?? onExit)()
            return
          }
          if (cursorOffset > 0) {
            const newQuery = query.slice(0, cursorOffset - 1) + query.slice(cursorOffset)
            setQueryState(newQuery)
            setCursorOffset(cursorOffset - 1)
          }
          return
        }
        case 'k': {
          const newQuery = query.slice(0, cursorOffset)
          setQueryState(newQuery)
          return
        }
        case 'u': {
          const newQuery = query.slice(cursorOffset)
          setQueryState(newQuery)
          setCursorOffset(0)
          return
        }
        case 'g':
        case 'c':
          if (onCancel) {
            onCancel()
            return
          }
      }
      return
    }

    // Meta key bindings
    if (e.meta) {
      e.preventDefault()
      return
    }

    // Tab: ignore
    if (e.key === 'tab') {
      return
    }

    // Regular character input.
    if (e.key.length >= 1 && !UNHANDLED_SPECIAL_KEYS.has(e.key)) {
      e.preventDefault()
      const newQuery = query.slice(0, cursorOffset) + e.key + query.slice(cursorOffset)
      setQueryState(newQuery)
      setCursorOffset(cursorOffset + e.key.length)
    }
  }

  // Backward-compat bridge
  useInput(
    (_input, _key, event) => {
      handleKeyDown(new KeyboardEvent(event.keypress))
    },
    { isActive },
  )

  return { query, setQuery, cursorOffset, handleKeyDown }
}
