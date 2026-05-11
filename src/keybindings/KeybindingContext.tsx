/**
 * KeybindingContext — React 18 / Ink-compatible context for the keybinding system.
 *
 * Restored from the React 19 Compiler artifact to plain React 18 by replacing
 * the _c() / useMemoCache pattern with standard useMemo + useLayoutEffect.
 * Logic is identical to the original — no behavior changes.
 */

import React, {
  createContext,
  type RefObject,
  useContext,
  useLayoutEffect,
  useMemo,
} from 'react'
import type { Key } from '../ink.js'
import {
  type ChordResolveResult,
  getBindingDisplayText,
  resolveKeyWithChordState,
} from './resolver.js'
import type {
  KeybindingContextName,
  ParsedBinding,
  ParsedKeystroke,
} from './types.js'

// ── Types ────────────────────────────────────────────────────────────────────

type HandlerRegistration = {
  action:  string
  context: KeybindingContextName
  handler: () => void
}

type KeybindingContextValue = {
  resolve: (
    input: string,
    key: Key,
    activeContexts: KeybindingContextName[],
  ) => ChordResolveResult
  setPendingChord:          (pending: ParsedKeystroke[] | null) => void
  getDisplayText:           (action: string, context: KeybindingContextName) => string | undefined
  bindings:                 ParsedBinding[]
  pendingChord:             ParsedKeystroke[] | null
  activeContexts:           Set<KeybindingContextName>
  registerActiveContext:    (context: KeybindingContextName) => void
  unregisterActiveContext:  (context: KeybindingContextName) => void
  registerHandler:          (registration: HandlerRegistration) => () => void
  invokeAction:             (action: string) => boolean
}

// ── Context ──────────────────────────────────────────────────────────────────

const KeybindingContext = createContext<KeybindingContextValue | null>(null)

// ── Provider ─────────────────────────────────────────────────────────────────

type ProviderProps = {
  bindings:                 ParsedBinding[]
  pendingChordRef:          RefObject<ParsedKeystroke[] | null>
  pendingChord:             ParsedKeystroke[] | null
  setPendingChord:          (pending: ParsedKeystroke[] | null) => void
  activeContexts:           Set<KeybindingContextName>
  registerActiveContext:    (context: KeybindingContextName) => void
  unregisterActiveContext:  (context: KeybindingContextName) => void
  handlerRegistryRef:       RefObject<Map<string, Set<HandlerRegistration>>>
  children:                 React.ReactNode
}

export function KeybindingProvider({
  bindings,
  pendingChordRef,
  pendingChord,
  setPendingChord,
  activeContexts,
  registerActiveContext,
  unregisterActiveContext,
  handlerRegistryRef,
  children,
}: ProviderProps): React.ReactNode {
  const value = useMemo<KeybindingContextValue>(() => {
    const getDisplay = (action: string, context: KeybindingContextName) =>
      getBindingDisplayText(action, context, bindings)

    const registerHandler = (registration: HandlerRegistration) => {
      const registry = handlerRegistryRef.current
      if (!registry) return () => {}
      if (!registry.has(registration.action)) {
        registry.set(registration.action, new Set())
      }
      registry.get(registration.action)!.add(registration)
      return () => {
        const handlers = registry.get(registration.action)
        if (handlers) {
          handlers.delete(registration)
          if (handlers.size === 0) registry.delete(registration.action)
        }
      }
    }

    const invokeAction = (action: string): boolean => {
      const registry = handlerRegistryRef.current
      if (!registry) return false
      const handlers = registry.get(action)
      if (!handlers || handlers.size === 0) return false
      for (const reg of handlers) {
        if (activeContexts.has(reg.context)) {
          reg.handler()
          return true
        }
      }
      return false
    }

    return {
      resolve: (input, key, contexts) =>
        resolveKeyWithChordState(input, key, contexts, bindings, pendingChordRef.current),
      setPendingChord,
      getDisplayText:          getDisplay,
      bindings,
      pendingChord,
      activeContexts,
      registerActiveContext,
      unregisterActiveContext,
      registerHandler,
      invokeAction,
    }
  }, [
    bindings,
    pendingChordRef,
    pendingChord,
    setPendingChord,
    activeContexts,
    registerActiveContext,
    unregisterActiveContext,
    handlerRegistryRef,
  ])

  return (
    <KeybindingContext.Provider value={value}>
      {children}
    </KeybindingContext.Provider>
  )
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useKeybindingContext(): KeybindingContextValue {
  const ctx = useContext(KeybindingContext)
  if (!ctx) throw new Error('useKeybindingContext must be used within KeybindingProvider')
  return ctx
}

export function useOptionalKeybindingContext(): KeybindingContextValue | null {
  return useContext(KeybindingContext)
}

/**
 * Register a keybinding context as active while the component is mounted.
 * Bindings in this context take precedence over Global while active.
 */
export function useRegisterKeybindingContext(
  context: KeybindingContextName,
  isActive = true,
): void {
  const keybindingContext = useOptionalKeybindingContext()
  useLayoutEffect(() => {
    if (!keybindingContext || !isActive) return
    keybindingContext.registerActiveContext(context)
    return () => { keybindingContext.unregisterActiveContext(context) }
  }, [context, keybindingContext, isActive])
}
