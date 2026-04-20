// src/ink/components/Notifications.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Toast notification bar — shows the last 4 notifications.
// Each auto-expires after 5 s (managed by the caller via addNotification).
// ─────────────────────────────────────────────────────────────────────────────

import React        from "react";
import { Box, Text } from "ink";

export interface Notification {
  id:      number;
  message: string;
  type:    "success" | "error" | "info";
}

const ICON: Record<Notification["type"], string> = {
  success: "✓",
  error:   "✗",
  info:    "ℹ",
};

const COLOR: Record<Notification["type"], string> = {
  success: "green",
  error:   "red",
  info:    "cyan",
};

interface NotificationsPaneProps {
  notifications: Notification[];
}

export function NotificationsPane({ notifications }: NotificationsPaneProps) {
  if (notifications.length === 0) return null;
  return (
    <Box flexDirection="column" marginTop={1}>
      {notifications.slice(-4).map((n) => (
        <Box key={n.id} paddingX={1} gap={1}>
          <Text color={COLOR[n.type]}>{ICON[n.type]}</Text>
          <Text bold color={COLOR[n.type]}>{n.message}</Text>
        </Box>
      ))}
    </Box>
  );
}
