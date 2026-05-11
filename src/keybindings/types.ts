/**
 * Core types for the keybinding system.
 *
 * Kept in their own file so that pure-function modules (match, parser,
 * resolver) can share them without pulling in any React or runtime deps.
 */

/** A single parsed keystroke from a binding string like "ctrl+shift+k". */
export type ParsedKeystroke = {
  key: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  super: boolean
}

/** A chord is an ordered sequence of keystrokes (length ≥ 1). */
export type Chord = ParsedKeystroke[]

/** A fully parsed binding ready for matching against Ink input events. */
export type ParsedBinding = {
  chord: Chord
  /** null means the key is explicitly unbound (blocks inherited bindings). */
  action: string | null
  context: KeybindingContextName
}

/** Raw block from a JSON/TS config that maps key strings → action names. */
export type KeybindingBlock = {
  context: KeybindingContextName
  bindings: Record<string, string | null>
}

/**
 * A string identifying a keybinding context.
 * Using string instead of a closed union lets panels define their own
 * contexts without requiring a central registry update.
 */
export type KeybindingContextName = string
