// src/ink/components/Notifications.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Notification system — { current, queue } state machine.
//
// Features:
//   • String keys     — addNotification({ key: 'deploy-fail', ... }) deduplicates
//   • removeNotification(key) — cancel a notification programmatically
//   • Priority levels — 'low' | 'medium' | 'high' | 'immediate'
//                       immediate preempts current and re-queues it
//                       high/medium/low sort within the queue
//   • invalidates     — one notification wipes others on arrival
//   • timeoutMs       — per-notification duration (error=8s, info=3s, success=5s)
//   • fold            — merge same-key notifications instead of stacking
//   • JSX content     — message can be a ReactNode, not just a string
//   • wrap="truncate" — long messages never break TUI layout
//
// Backward-compatible simple API:
//   addNotification("Deploy succeeded", "success")
//
// Full API:
//   addNotification("5 pulls failed", "error", {
//     key: "docker-pull-fail",
//     priority: "high",
//     timeoutMs: 10_000,
//     invalidates: ["docker-start"],
//     fold: (acc) => ({ message: incrementCount(acc.message!, "pulls") }),
//   })
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext, useContext, useRef, useState, useCallback, useEffect,
  type ReactNode,
} from "react";
import { Box, Text } from "ink";

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationType     = "success" | "error" | "info";
export type NotificationPriority = "low" | "medium" | "high" | "immediate";

const DEFAULT_TIMEOUT: Record<NotificationType, number> = {
  success: 5_000,
  error:   8_000,
  info:    3_000,
};

export interface NotificationOptions {
  /** Dedup key. Same-key calls update the existing item instead of stacking. */
  key?:         string;
  priority?:    NotificationPriority;
  /** Override the default timeout for this notification type. */
  timeoutMs?:   number;
  /** Keys to remove from current + queue when this notification is added. */
  invalidates?: string[];
  /** Called when a same-key notification already exists — merge instead of replace. */
  fold?:        (acc: NotificationItem) => Partial<NotificationItem>;
}

export interface NotificationItem {
  id:          number;
  key:         string;           // auto-generated if not provided
  type:        NotificationType;
  /** Plain-string body. Set either message or jsx, not both. */
  message?:    string;
  /** React node body. Set either message or jsx, not both. */
  jsx?:        ReactNode;
  priority:    NotificationPriority;
  timeoutMs:   number;
  invalidates?: string[];
  fold?:        (acc: NotificationItem) => Partial<NotificationItem>;
}

// Legacy type alias for callers that imported `Notification` by name.
export type Notification = NotificationItem;

// ── Context ───────────────────────────────────────────────────────────────────

interface NotificationsState {
  current: NotificationItem | null;
  queue:   NotificationItem[];
}

interface NotificationsContextValue {
  /** Active + queued notifications (for display). */
  notifications:      NotificationItem[];
  current:            NotificationItem | null;
  queue:              NotificationItem[];
  addNotification:    (
    message:  string | ReactNode,
    type?:    NotificationType,
    opts?:    NotificationOptions,
  ) => void;
  removeNotification: (key: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

// ── Queue helpers ─────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<NotificationPriority, number> = {
  immediate: 3,
  high:      2,
  medium:    1,
  low:       0,
};

/** Insert item into queue respecting priority order (stable sort). */
function enqueue(queue: NotificationItem[], item: NotificationItem): NotificationItem[] {
  const insertPrio = PRIORITY_ORDER[item.priority];
  const idx = queue.findIndex((n) => PRIORITY_ORDER[n.priority] < insertPrio);
  if (idx === -1) return [...queue, item];
  return [...queue.slice(0, idx), item, ...queue.slice(idx)];
}

/** Remove all items matching any of the given keys. */
function removeKeys(items: NotificationItem[], keys: string[]): NotificationItem[] {
  if (!keys.length) return items;
  return items.filter((n) => !keys.includes(n.key));
}

// ── Provider ──────────────────────────────────────────────────────────────────

let _autoKey = 0;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const idRef    = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<NotificationsState>({
    current: null,
    queue:   [],
  });

  // Advance: called when current notification expires.
  const advance = useCallback(() => {
    setState((s) => {
      if (s.queue.length === 0) return { current: null, queue: [] };
      const [next, ...rest] = s.queue;
      return { current: next!, queue: rest };
    });
  }, []);

  // When `current` changes, arm its expiry timer.
  useEffect(() => {
    if (!state.current) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(advance, state.current.timeoutMs);
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [state.current?.id, advance]); // eslint-disable-line react-hooks/exhaustive-deps

  const addNotification = useCallback((
    message:  string | ReactNode,
    type:     NotificationType = "info",
    opts:     NotificationOptions = {},
  ) => {
    const {
      key         = `_auto_${++_autoKey}`,
      priority    = "medium",
      timeoutMs   = DEFAULT_TIMEOUT[type],
      invalidates = [],
      fold,
    } = opts;

    setState((s) => {
      let { current, queue } = s;

      // ── invalidate keys ─────────────────────────────────────────────────
      if (invalidates.length) {
        if (current && invalidates.includes(current.key)) current = null;
        queue = removeKeys(queue, invalidates);
      }

      // ── fold: update existing same-key item ─────────────────────────────
      const existingInCurrent = current?.key === key ? current : null;
      const existingIdx       = !existingInCurrent
        ? queue.findIndex((n) => n.key === key)
        : -1;

      if (existingInCurrent && fold) {
        const patch   = fold(existingInCurrent);
        const updated = { ...existingInCurrent, ...patch };
        // Reset timer by bumping id so the useEffect re-arms.
        updated.id = ++idRef.current;
        return { current: updated, queue };
      }

      if (existingIdx !== -1 && fold) {
        const patch   = fold(queue[existingIdx]!);
        const updated = { ...queue[existingIdx]!, ...patch };
        const next    = [...queue];
        next[existingIdx] = updated;
        return { current, queue: next };
      }

      // ── dedup: replace existing same-key item ───────────────────────────
      if (existingInCurrent) {
        const item: NotificationItem = {
          id: ++idRef.current, key, type, priority, timeoutMs, invalidates, fold,
          ...(typeof message === "string" ? { message } : { jsx: message as ReactNode }),
        };
        return { current: item, queue };
      }

      if (existingIdx !== -1) {
        const item: NotificationItem = {
          id: ++idRef.current, key, type, priority, timeoutMs, invalidates, fold,
          ...(typeof message === "string" ? { message } : { jsx: message as ReactNode }),
        };
        const next = [...queue];
        next[existingIdx] = item;
        return { current, queue: next };
      }

      // ── new item ────────────────────────────────────────────────────────
      const item: NotificationItem = {
        id: ++idRef.current, key, type, priority, timeoutMs, invalidates, fold,
        ...(typeof message === "string" ? { message } : { jsx: message as ReactNode }),
      };

      // immediate: preempt current by re-queuing it
      if (priority === "immediate" && current) {
        return { current: item, queue: [current, ...queue] };
      }

      // No current showing — show immediately
      if (!current) {
        return { current: item, queue };
      }

      // Queue behind current
      return { current, queue: enqueue(queue, item) };
    });
  }, []);

  const removeNotification = useCallback((key: string) => {
    setState((s) => {
      const isCurrent = s.current?.key === key;
      const queue     = removeKeys(s.queue, [key]);
      if (!isCurrent) return { ...s, queue };
      // Current removed — advance immediately
      if (queue.length === 0) return { current: null, queue: [] };
      const [next, ...rest] = queue;
      return { current: next!, queue: rest };
    });
  }, []);

  const notifications = state.current
    ? [state.current, ...state.queue]
    : state.queue;

  return (
    <NotificationsContext.Provider value={{
      notifications,
      current:            state.current,
      queue:              state.queue,
      addNotification,
      removeNotification,
    }}>
      {children}
    </NotificationsContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return ctx;
}

// ── Display component ─────────────────────────────────────────────────────────

const ICON: Record<NotificationType, string> = {
  success: "✓",
  error:   "✗",
  info:    "ℹ",
};

const COLOR: Record<NotificationType, string> = {
  success: "green",
  error:   "red",
  info:    "cyan",
};

interface NotificationsPaneProps {
  /** Pass `notifications` from useNotifications() — shows current + up to 3 queued. */
  notifications: NotificationItem[];
}

export function NotificationsPane({ notifications }: NotificationsPaneProps) {
  if (notifications.length === 0) return null;
  const visible = notifications.slice(0, 4);
  return (
    <Box flexDirection="column" marginTop={1}>
      {visible.map((n) => (
        <Box key={n.id} paddingX={1} gap={1}>
          <Text color={COLOR[n.type]}>{ICON[n.type]}</Text>
          {n.jsx != null
            ? <Box flexShrink={1}>{n.jsx}</Box>
            : (
              <Text bold color={COLOR[n.type]} wrap="truncate">
                {n.message}
              </Text>
            )
          }
          {notifications.length > 4 && n === visible[3] && (
            <Text dimColor>{` +${notifications.length - 4} more`}</Text>
          )}
        </Box>
      ))}
    </Box>
  );
}
