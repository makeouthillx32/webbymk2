import React from "react";
import { Box } from "ink";
import { Header } from "./components/Header.js";
import { Tabs } from "./components/Tabs.js";
import { NotificationsPane } from "./components/Notifications.js";
import { DetachedStack } from "./components/DetachedStack.js";

const PANEL_TABS = ["core", "zones", "npm", "db", "infra"] as const;

interface AppShellProps {
  view: string;
  tw: number;
  th: number;
  children: React.ReactNode;
}

export function AppShell({ view, tw, th, children }: AppShellProps) {
  const isPanelView = (PANEL_TABS as readonly string[]).includes(view);

  return (
    <Box flexDirection="column" width={tw} height={th} overflow="hidden">
      {/* ── App header ────────────────────────────────────────────────── */}
      <Header />

      {/* ── Panel tabs (only when on a panel view) ────────────────────── */}
      {isPanelView && (
        <Tabs
          tabs={[...PANEL_TABS]}
          active={view as any}
          marginBottom={0}
        />
      )}

      {/* ── Active view ───────────────────────────────────────────────── */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {children}
      </Box>

      {/* ── Notifications ─────────────────────────────────────────────── */}
      <NotificationsPane />

      {/* ── Background operation stack ────────────────────────────────── */}
      <DetachedStack />
    </Box>
  );
}