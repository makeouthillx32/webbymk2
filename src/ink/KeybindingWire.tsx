/**
 * KeybindingWire — TUI-native keybinding provider.
 *
 * Drop-in replacement for the broken KeybindingProviderSetup (which imports
 * Claude Code infrastructure that doesn't exist in this runtime).
 *
 * Wraps children in <KeybindingProvider> and registers a <ChordInterceptor>
 * that fires FIRST (before any child useInput) so chord prefix keystrokes
 * never leak into panel handlers.
 *
 * Usage:
 *   render(<KeybindingWire><App /></KeybindingWire>, ...)
 *
 * After mounting, panels can opt into the system via:
 *   useRegisterKeybindingContext('Db')   — declares context as active
 *   useKeybindings({ 'db:sectionCore': () => setSection('core') }, { context: 'Db' })
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import type { InputEvent } from './events/input-event.js'
import { type Key, useInput }           from '../ink.js'
import { KeybindingProvider }           from './KeybindingContext.js'
import { resolveKeyWithChordState }     from '../keybindings/resolver.js'
import { TUI_BINDINGS }                 from '../keybindings/tui-bindings.js'
import type {
  KeybindingContextName,
  ParsedBinding,
  ParsedKeystroke,
} from '../keybindings/types.js'

// ─────────────────────────────────────────────────────────────────────────────

const CHORD_TIMEOUT_MS = 1_000

type Props = { children: React.ReactNode }

type HandlerReg = {
  action:  string
  context: KeybindingContextName
  handler: () => void
}

// ── ChordInterceptor ─────────────────────────────────────────────────────────
// Registers useInput BEFORE children so it sees keystrokes first.
// Responsibilities:
//   • chord_started  → store pending state + stopImmediatePropagation()
//   • match (chord)  → invoke registered handler + stopImmediatePropagation()
//   • chord_cancelled / unbound → clear state + stopImmediatePropagation()
//   • none / match (single key) → pass through (child handlers process)

type InterceptorProps = {
  bindings:           ParsedBinding[]
  pendingChordRef:    React.RefObject<ParsedKeystroke[] | null>
  setPendingChord:    (p: ParsedKeystroke[] | null) => void
  activeContexts:     Set<KeybindingContextName>
  handlerRegistryRef: React.RefObject<Map<string, Set<HandlerReg>>>
}

function ChordInterceptor({
  bindings,
  pendingChordRef,
  setPendingChord,
  activeContexts,
  handlerRegistryRef,
}: InterceptorProps): null {
  const handleInput = useCallback(
    (input: string, key: Key, event: InputEvent) => {
      // Wheel events can never start a chord — skip unless mid-chord
      if ((key.wheelUp || key.wheelDown) && pendingChordRef.current === null) {
        return
      }

      // Build context list from registered handlers + active contexts + Global
      const registry = handlerRegistryRef.current
      const handlerContexts = new Set<KeybindingContextName>()
      if (registry) {
        for (const handlers of registry.values()) {
          for (const reg of handlers) {
            handlerContexts.add(reg.context)
          }
        }
      }
      const contexts: KeybindingContextName[] = [
        ...handlerContexts,
        ...activeContexts,
        'Global',
      ]

      const wasInChord = pendingChordRef.current !== null

      const result = resolveKeyWithChordState(
        input, key, contexts, bindings, pendingChordRef.current,
      )

      switch (result.type) {
        case 'chord_started':
          setPendingChord(result.pending)
          event.stopImmediatePropagation()
          break

        case 'match': {
          setPendingChord(null)
          // Only intercept the completion keystroke of a multi-key chord.
          // Single-key matches propagate normally so existing useInput
          // handlers (which are the source of truth for now) still fire.
          if (wasInChord) {
            const ctxSet = new Set(contexts)
            if (registry) {
              const handlers = registry.get(result.action)
              if (handlers && handlers.size > 0) {
                for (const reg of handlers) {
                  if (ctxSet.has(reg.context)) {
                    reg.handler()
                    event.stopImmediatePropagation()
                    break
                  }
                }
              }
            }
          }
          break
        }

        case 'chord_cancelled':
          setPendingChord(null)
          event.stopImmediatePropagation()
          break

        case 'unbound':
          setPendingChord(null)
          event.stopImmediatePropagation()
          break

        case 'none':
          // No chord involvement — let everything through
          break
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bindings, pendingChordRef, setPendingChord, activeContexts, handlerRegistryRef],
  )

  useInput(handleInput)
  return null
}

// ── KeybindingWire ────────────────────────────────────────────────────────────

export function KeybindingWire({ children }: Props): React.ReactNode {
  const bindings = TUI_BINDINGS

  // Chord state: ref for synchronous access in the interceptor handler,
  // state for triggering re-renders (e.g. a pending-chord UI indicator).
  const pendingChordRef                    = useRef<ParsedKeystroke[] | null>(null)
  const [pendingChord, setPendingChordState] = useState<ParsedKeystroke[] | null>(null)
  const chordTimeoutRef                    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Handler registry shared between KeybindingProvider and ChordInterceptor
  const handlerRegistryRef = useRef(new Map<string, Set<HandlerReg>>())

  // Active context set — ref keeps it synchronous for input handlers
  const activeContextsRef = useRef<Set<KeybindingContextName>>(new Set())

  const registerActiveContext = useCallback((ctx: KeybindingContextName) => {
    activeContextsRef.current.add(ctx)
  }, [])

  const unregisterActiveContext = useCallback((ctx: KeybindingContextName) => {
    activeContextsRef.current.delete(ctx)
  }, [])

  const clearChordTimeout = useCallback(() => {
    if (chordTimeoutRef.current !== null) {
      clearTimeout(chordTimeoutRef.current)
      chordTimeoutRef.current = null
    }
  }, [])

  // Unified chord setter: manages timeout + syncs ref and state
  const setPendingChord = useCallback(
    (pending: ParsedKeystroke[] | null) => {
      clearChordTimeout()
      if (pending !== null) {
        chordTimeoutRef.current = setTimeout(() => {
          pendingChordRef.current = null
          setPendingChordState(null)
        }, CHORD_TIMEOUT_MS)
      }
      pendingChordRef.current = pending
      setPendingChordState(pending)
    },
    [clearChordTimeout],
  )

  // Cleanup on unmount
  useEffect(() => () => clearChordTimeout(), [clearChordTimeout])

  return (
    <KeybindingProvider
      bindings={bindings}
      pendingChordRef={pendingChordRef}
      pendingChord={pendingChord}
      setPendingChord={setPendingChord}
      activeContexts={activeContextsRef.current}
      registerActiveContext={registerActiveContext}
      unregisterActiveContext={unregisterActiveContext}
      handlerRegistryRef={handlerRegistryRef}
    >
      {/* ChordInterceptor mounts before children so its useInput fires first */}
      <ChordInterceptor
        bindings={bindings}
        pendingChordRef={pendingChordRef}
        setPendingChord={setPendingChord}
        activeContexts={activeContextsRef.current}
        handlerRegistryRef={handlerRegistryRef}
      />
      {children}
    </KeybindingProvider>
  )
}
