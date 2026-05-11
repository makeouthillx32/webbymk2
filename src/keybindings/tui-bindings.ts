/**
 * TUI runtime default keybindings.
 *
 * These bindings mirror the key logic currently hard-coded in useInput
 * handlers across App.tsx, ZonesView, InfraPanel, DbPanel, NpmPanel,
 * SettingsScreen, and OperationOverlay.  Having them here lets:
 *
 *  1. The ChordInterceptor build a correct prefix table (chord support).
 *  2. useKeybinding / useKeybindings hooks resolve by action name.
 *  3. Help/hints UI query display text via getDisplayText().
 *
 * Action naming convention:  <scope>:<verb>
 * Contexts match the strings passed to useRegisterKeybindingContext().
 *
 * Last binding wins inside a context — put overrides after defaults.
 */

import { parseBindings } from './parser.js'
import type { ParsedBinding } from './types.js'

export const TUI_BINDINGS: ParsedBinding[] = parseBindings([
  // ── Global ──────────────────────────────────────────────────────────────
  // These fire regardless of which panel/screen is active.
  {
    context: 'Global',
    bindings: {
      'tab':       'app:nextPanel',
      'shift+tab': 'app:prevPanel',
      'q':         'app:back',
      '←':         'app:back',
      'ctrl+c':    'app:quit',
    },
  },

  // ── Overlay ─────────────────────────────────────────────────────────────
  // OperationOverlay — fullscreen progress view.
  {
    context: 'Overlay',
    bindings: {
      'escape': 'overlay:close',
      'q':      'overlay:close',
    },
  },

  // ── Stack ────────────────────────────────────────────────────────────────
  // DetachedStack sidebar — j/k navigate ops, q/escape closes.
  {
    context: 'Stack',
    bindings: {
      'j':      'stack:down',
      'k':      'stack:up',
      '↓':      'stack:down',
      '↑':      'stack:up',
      'escape': 'stack:close',
      'q':      'stack:close',
    },
  },

  // ── Zones ────────────────────────────────────────────────────────────────
  // ZonesView — zone list navigation + actions.
  {
    context: 'Zones',
    bindings: {
      'j':     'zones:down',
      'k':     'zones:up',
      '↓':     'zones:down',
      '↑':     'zones:up',
      'enter': 'zones:action',
      's':     'zones:manage',
      'd':     'zones:delete',
    },
  },

  // ── Db ───────────────────────────────────────────────────────────────────
  // DbPanel — internal section switching.
  {
    context: 'Db',
    bindings: {
      '1': 'db:sectionCore',
      '2': 'db:sectionInstances',
    },
  },

  // ── Npm ──────────────────────────────────────────────────────────────────
  // NpmPanel — internal section switching.
  {
    context: 'Npm',
    bindings: {
      '1': 'npm:section1',
      '2': 'npm:section2',
      '3': 'npm:section3',
      '4': 'npm:section4',
    },
  },

  // ── Infra ─────────────────────────────────────────────────────────────────
  // InfraPanel — internal section switching.
  {
    context: 'Infra',
    bindings: {
      '1': 'infra:section1',
      '2': 'infra:section2',
      '3': 'infra:section3',
    },
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  // SettingsScreen — navigation + section switching.
  {
    context: 'Settings',
    bindings: {
      'j':  'settings:down',
      'k':  'settings:up',
      '↓':  'settings:down',
      '↑':  'settings:up',
      '1':  'settings:section1',
      '2':  'settings:section2',
      '3':  'settings:section3',
    },
  },

  // ── Select ────────────────────────────────────────────────────────────────
  // SelectMenu / any modal picker.
  {
    context: 'Select',
    bindings: {
      'j':      'select:down',
      'k':      'select:up',
      '↓':      'select:down',
      '↑':      'select:up',
      'enter':  'select:confirm',
      'escape': 'select:cancel',
      'q':      'select:cancel',
    },
  },
])
