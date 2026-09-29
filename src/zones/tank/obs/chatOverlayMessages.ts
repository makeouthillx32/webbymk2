export type TimedOverlayMessage<T extends { id: string }> = T & { receivedAt: number };

/**
 * Merge history into chats that may already have arrived over Realtime.
 *
 * The initial HTTP request and the Realtime subscription start together. A
 * late HTTP response must not replace a newer live message that is already on
 * screen. History is placed first and live messages win duplicate ids.
 */
export function mergeInitialOverlayMessages<T extends { id: string }>(
  history: TimedOverlayMessage<T>[],
  live: TimedOverlayMessage<T>[],
  limit: number,
): TimedOverlayMessage<T>[] {
  const merged = new Map<string, TimedOverlayMessage<T>>();
  for (const message of history) merged.set(message.id, message);
  for (const message of live) merged.set(message.id, message);
  return Array.from(merged.values()).slice(-Math.max(1, limit));
}
