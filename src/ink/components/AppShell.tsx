// src/ink/components/AppShell.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Persistent chrome that wraps every main-layout view.
//
// Renders (top → bottom):
//   Header           — app title · running op summary · clock
//   Tabs             — [zones] npm  db  infra  (only on panel views)
//   {children}       — the active view (WelcomeScreen / ZonesView / NpmPanel …)
//   NotificationsPane — auto-expiring toast messages
//   DetachedStack    — background op stack (shown when stackOpen && ops exist)
//
// Full-screen views (OperationOverlay, ZoneWizardScreen) bypass AppShell
// entirely — they are rendered directly by App.tsx before this component.
// ─────────────────────────────────────────────────────────────────────────────

import React                         from "react";
import { Box }                       from "ink";
import { useTermHeight }             from "../hooks/useTermWidth.ts";

import type { StackOp }              from "./DetachedStack.tsx";
import type { Notification }         from "./Notifications.tsx";
import type { View }                 from "../hooks/useAppRouter.ts";

import { Header }                    from "./Header.tsx";
import { Tabs }                      from "./Tabs.tsx";
import { NotificationsPane }         from "./Notifications.tsx";
import { DetachedStack }             from "./DetachedStack.tsx";
import { Breadcrumbs }               from "./Breadcrumbs.tsx";

// ── Constants ─────────────────────────────────────────────────────────────────

const PANEL_TABS = ["core", "zones", "npm", "db", "infra", "notes"] as const;

// ── Props ─────────────────────────────────────────────────────────────────────

interface AppShellProps {
  /** Current active view name — used to decide whether to show Tabs */
  view:          string;
  /** Full navigation history — drives the breadcrumb trail */
  history:       readonly View[];
  /** Internal panel sub-navigation crumbs (set by each panel) */
  subCrumbs:     string[];
  /** All background operations (running + done) */
  bgOps:         StackOp[];
  /** Whether the DetachedStack pane is visible */
  stackOpen:     boolean;
  /** Id of the op currently expanded in the stack */
  stackFocusId:  number | null;
  /** Active toast notifications */
  notifications: Notification[];
  /** True for 1.5 s after [c] copy — forwarded to DetachedStack for flash */
  didCopy:       boolean;
  children:      React.ReactNode;

  // ── Stack keyboard callbacks ───────────────────────────────────────────────
  // Threaded through to DetachedStack so it can own useInput while keeping
  // state management co-located with the data in App.tsx.
  onStackUp?:         () => void;
  onStackDown?:       () => void;
  onStackEnter?:      () => void;
  onStackDismiss?:    () => void;
  onStackDismissAll?: () => void;
  onStackPopout?:     () => void;
  onStackCopy?:       () => void;
  onStackClose?:       () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AppShell({
  view, history, subCrumbs, bgOps, stackOpen, stackFocusId,
  notifications, didCopy, children,
  onStackUp, onStackDown, onStackEnter,
  onStackDismiss, onStackDismissAll, onStackPopout, onStackCopy, onStackClose,
}: AppShellProps) {
  const isPanelView = (PANEL_TABS as readonly string[]).includes(view);
  const th          = useTermHeight();

  // height={th} + overflow="hidden" clamp the whole TUI to the visible viewport.
  // Without this, content taller than the terminal spills into the scrollback
  // buffer and Ink's "cursor-up + rewrite" repaints leave ghost frames behind.
  return (
    <Box flexDirection="column" height={th} overflow="hidden">

      {/* ── App header ──────────────────────────────────────────────────── */}
      <Header ops={bgOps} stackOpen={stackOpen} />

      {/* ── Breadcrumb trail (hidden at root / welcome) ──────────────────── */}
      <Breadcrumbs history={history} subCrumbs={subCrumbs} />

      {/* ── Panel tabs (hidden on welcome / settings / wizard) ──────────── */}
      {isPanelView && (
        <Tabs
          tabs={[...PANEL_TABS]}
          active={view}
          marginBottom={1}
        />
      )}

      {/* ── Active view — fills remaining height, clips rather than scrolls */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {children}
      </Box>

      {/* ── Toast notifications ─────────────────────────────────────────── */}
      <NotificationsPane notifications={notifications} />

      {/* ── Background op stack ─────────────────────────────────────────── */}
      {stackOpen && bgOps.length > 0 && (
        <DetachedStack
          ops={bgOps}
          focusedId={stackFocusId}
          didCopy={didCopy}
          onUp={onStackUp}
          onDown={onStackDown}
          onEnter={onStackEnter}
          onDismiss={onStackDismiss}
          onDismissAll={onStackDismissAll}
          onPopout={onStackPopout}
          onCopy={onStackCopy}
          onClose={onStackClose}
        />
      )}

    </Box>
  );
}
