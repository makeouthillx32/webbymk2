// src/ink/components/AppShell.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Persistent chrome that wraps every main-layout view.
//
// Renders (top → bottom):
//   Header           — app title · running op summary · clock
//   Tabs             — [zones] npm  db  infra  (only on panel views)
//   {children}       — the active view
//   NotificationsPane — auto-expiring toast messages
//   DetachedStack    — background op stack (shown when stackOpen && ops exist)
// ─────────────────────────────────────────────────────────────────────────────

import React                         from "react";
import { Box }                       from "ink";
import { useTermHeight }             from "../hooks/useTermWidth.ts";

import type { StackOp }              from "./DetachedStack.tsx";
import type { Notification }         from "./Notifications.tsx";
import { PANEL_TABS, type View }     from "../hooks/useAppRouter.ts";

import { Header }                    from "./Header.tsx";
import type { EnvironmentType }      from "../environment-store.ts";
import { Tabs }                      from "./Tabs.tsx";
import { NotificationsPane }         from "./Notifications.tsx";
import { DetachedStack }             from "./DetachedStack.tsx";
import { Breadcrumbs }               from "./Breadcrumbs.tsx";

// ── Props ─────────────────────────────────────────────────────────────────────

interface AppShellProps {
  view:          string;
  history:       readonly View[];
  subCrumbs:     string[];
  bgOps:         StackOp[];
  stackOpen:     boolean;
  stackFocused:  boolean;
  stackFocusId:  number | null;
  notifications: Notification[];
  didCopy:       boolean;
  children:      React.ReactNode;

  /** Active environment — shown as a badge in the header. */
  activeEnvName?: string;
  activeEnvType?: EnvironmentType;

  onStackUp?:         () => void;
  onStackDown?:       () => void;
  onStackEnter?:      () => void;
  onStackDismiss?:    () => void;
  onStackDismissAll?: () => void;
  onStackPopout?:     () => void;
  onStackCopy?:       () => void;
  onStackCopyTail?:   () => void;
  onStackClose?:      () => void;
  onStackHide?:       () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AppShell({
  view, history, subCrumbs, bgOps, stackOpen, stackFocused, stackFocusId,
  notifications, didCopy, children, activeEnvName, activeEnvType,
  onStackUp, onStackDown, onStackEnter,
  onStackDismiss, onStackDismissAll, onStackPopout,
  onStackCopy, onStackCopyTail, onStackClose, onStackHide,
}: AppShellProps) {
  const isPanelView = (PANEL_TABS as readonly string[]).includes(view);
  const th          = useTermHeight();

  return (
    <Box flexDirection="column" height={th} overflow="hidden">

      {/* ── App header ──────────────────────────────────────────────────── */}
      <Header
        ops={bgOps}
        stackOpen={stackOpen}
        stackFocused={stackFocused}
        activeEnvName={activeEnvName}
        activeEnvType={activeEnvType}
      />

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

      {/* ── Background op stack — only when open and ops exist ──────────── */}
      {stackOpen && bgOps.length > 0 && (
        <DetachedStack
          ops={bgOps}
          focusedId={stackFocusId}
          didCopy={didCopy}
          isActive={stackFocused}
          onUp={onStackUp}
          onDown={onStackDown}
          onEnter={onStackEnter}
          onDismiss={onStackDismiss}
          onDismissAll={onStackDismissAll}
          onPopout={onStackPopout}
          onCopy={onStackCopy}
          onCopyTail={onStackCopyTail}
          onClose={onStackClose}
          onHide={onStackHide}
        />
      )}
    </Box>
  );
}
