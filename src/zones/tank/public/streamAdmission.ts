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

// Slots opened beyond the starting allowance, granted over time.
//
// The original cap was a one-shot number, which meant a player that lost the
// initial race waited forever: nothing ever released a slot, so on any device
// with more tiles than slots the surplus sat on "Tap to watch" permanently.
// iPhones hit this every time — Safari exposes no Network Information API, so
// they land on the cautious "unknown" profile and then never recover from it.
//
// Ramping fixes the real goal, which was never "show fewer cameras" but "do
// not open seven sockets at once and starve the page". Start narrow, widen
// while nothing is complaining, and everything ends up live in its own time.
let rampBonus = 0;
let rampTimer: ReturnType<typeof setInterval> | null = null;

const RAMP_INTERVAL_MS = 4000;

function rampCeiling(): number {
  const profile = detectNetworkProfile();
  // A connection we have measured as thin keeps a hard ceiling: there the cap
  // is protecting a real limit, not guessing at one.
  if (profile.constrained) return profile.maxConcurrentStreams + 2;
  // Unknown or fast: no ceiling. Every tile is expected to reach live.
  return Number.POSITIVE_INFINITY;
}

function capacity(): number {
  const base = detectNetworkProfile().maxConcurrentStreams;
  return Math.min(base + rampBonus, rampCeiling());
}

function ensureRamp() {
  if (rampTimer) return;
  rampTimer = setInterval(() => {
    // Stop widening once everyone waiting has a slot; restart if more arrive.
    if (granted.size >= waiters.length || capacity() >= rampCeiling()) {
      if (rampTimer) { clearInterval(rampTimer); rampTimer = null; }
      return;
    }
    rampBonus += 1;
    rebalance();
  }, RAMP_INTERVAL_MS);
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

// Admission (above) answers "may this player ever connect" — it says yes to
// everyone the instant a fast/unconstrained profile grants 8 slots, which
// covers this house's whole camera count. That still lets every tile fire
// its WHEP negotiation or HLS manifest fetch in the exact same synchronous
// tick, which competes for ICE gathering time, decode budget, and the
// browser's per-origin connection limit — the hero loses that race right
// along with the thumbnails it was supposed to have priority over.
// Confirmed live 2026-08-23: a director grid with several cameras plus an
// active OBS/RTMP room showed long, compounding latency on the one tile the
// director actually had selected, with every tile connecting at once and
// none of them favored.
//
// This is a separate, additive concern from admission: a thumbnail is still
// admitted immediately (so it does not sit on a permanent "waiting" state on
// a fast connection) — it just doesn't START negotiating until a short beat
// after the hero has already had the network and the CPU to itself.
const THUMBNAIL_STAGGER_MS = 250;
let activeThumbnailMounts = 0;

/** Head start, in ms, before this player should begin its own connect. Hero
 * always gets 0. Concurrently-mounting thumbnails stagger off one another so
 * a whole grid doesn't fire in the same tick either. */
export function useConnectDelay(priority: StreamPriority): number {
  // Assigned once at mount and never reshuffled — same reasoning as before,
  // this is purely "which order did concurrently-mounting thumbnails start
  // in", independent of whatever priority this player holds later.
  const [thumbnailDelay] = useState(() => activeThumbnailMounts++ * THUMBNAIL_STAGGER_MS);

  useEffect(() => {
    return () => {
      activeThumbnailMounts = Math.max(0, activeThumbnailMounts - 1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The bug this replaced: freezing the RETURNED delay at mount meant a
  // camera promoted from thumbnail to hero (a room switch reusing the same
  // player instance, or a director click) kept whatever stagger it was
  // assigned back when it was a thumbnail — the exact "why does switching
  // to the room I clicked still feel delayed" symptom reported live
  // 2026-08-24. Hero must react to priority changing, not just its value
  // at mount; the thumbnail stagger order itself still only needs to be
  // assigned once.
  if (priority === "hero") return 0;
  return thumbnailDelay;
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
    // Anyone not admitted immediately is queued, not rejected.
    if (!granted.has(id)) ensureRamp();

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
