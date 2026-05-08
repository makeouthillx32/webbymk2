// src/ink/hooks/useNotifications.ts
// ─────────────────────────────────────────────────────────────────────────────
// Toast notification state.
//
// Usage:
//   const { notifications, addNotification } = useNotifications();
//   addNotification("Deploy succeeded", "success");
//
// Each notification auto-expires after 5 s.  The NotificationsPane component
// renders the active list.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from "react";
import type { Notification }             from "../components/Notifications.tsx";

export function useNotifications() {
  const notifId = useRef(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((
    message: string,
    type: Notification["type"] = "info",
  ) => {
    const id = ++notifId.current;
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5_000);
  }, []);

  return { notifications, addNotification };
}
