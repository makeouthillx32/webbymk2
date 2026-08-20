"use client";

import { useEffect, useState } from "react";
import { detectNetworkProfile } from "./networkQuality";

// Decides which players are allowed to hold a live connection.
//
// The mobile grid mounts one player per room — seven live streams on a phone.
// On wifi that is merely wasteful; on cellular the streams consume the entire
// link, so the page's own scripts and API calls never finish and the site
// appears to load forever. The video was starving the app that hosts it.
//
// Slots are granted by priority: whatever the viewer is actually watching wins,
// and thumbnails fill what is left. A player without a slot still renders — it
// just shows a still frame instead of opening a connection.

export type StreamPriority = "hero" | "thumbnail";

type Waiter = { id: number; priority: StreamPriority; notify: () => void };

let nextId = 1;
const waiters: Waiter[] = [];
const granted = new Set<number>();

function capacity(): number {
  return detectNetworkProfile().maxConcurrentStreams;
}

function rebalance() {
  const max = capacity();

  // Hero first, then registration order — stable, so tiles don't trade slots
  // back and forth and restart each other's connections.
  const ordered = [...waiters].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === "hero" ? -1 : 1;
    return a.id - b.id;
  });

  const next = new Set(ordered.slice(0, max).map((w) => w.id));

  let changed = next.size !== granted.size;
  if (!changed) {
    for (const id of next) {
      if (!granted.has(id)) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return;

  const affected = new Set<number>([...granted, ...next]);
  granted.clear();
  for (const id of next) granted.add(id);

  for (const w of waiters) {
    if (affected.has(w.id)) w.notify();
  }
}

/**
 * True when this player may open a connection.
 *
 * Always true where the network is unconstrained and there is room, so the
 * desktop experience is unchanged — this only bites when bandwidth is scarce.
 */
export function useStreamSlot(priority: StreamPriority, wantsStream: boolean): boolean {
  const [admitted, setAdmitted] = useState(false);

  useEffect(() => {
    if (!wantsStream) {
      setAdmitted(false);
      return;
    }

    const id = nextId++;
    const waiter: Waiter = {
      id,
      priority,
      notify: () => setAdmitted(granted.has(id)),
    };
    waiters.push(waiter);
    rebalance();
    setAdmitted(granted.has(id));

    return () => {
      const i = waiters.findIndex((w) => w.id === id);
      if (i >= 0) waiters.splice(i, 1);
      granted.delete(id);
      // Releasing a slot should immediately hand it to whoever was waiting.
      rebalance();
    };
  }, [priority, wantsStream]);

  return admitted;
}
