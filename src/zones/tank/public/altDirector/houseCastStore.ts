// The live house cast on the client (see vision/houseCast.ts).
//
// Deliberately NOT React state: it changes once a second, and the only reader
// is the alt director's render loop, which polls it each frame. Putting it in
// useServerDirector's state would re-render every page holding that hook (all
// of Tank) every second.

import { parseHouseCast, type CastMember } from "../../vision/houseCast";

/** No broadcast for this long (the server re-sends every 10 s) = the feed is gone. */
export const HOUSE_CAST_STALE_MS = 25_000;

let members: CastMember[] = [];
let receivedAt = 0;
let fetched = false;
const listeners = new Set<() => void>();
let key = "";

export function publishHouseCast(raw: unknown, now = Date.now()) {
  const state = parseHouseCast(raw);
  if (!state) return;
  members = state.members;
  receivedAt = now;
  const nextKey = members.map((m) => m.id).join(",");
  if (nextKey !== key) {
    key = nextKey;
    listeners.forEach((fn) => fn());
  }
}

/** The members to mirror right now; empty when nothing is tracked or the feed went quiet. */
export function readHouseCast(now = Date.now()): CastMember[] {
  return now - receivedAt > HOUSE_CAST_STALE_MS ? [] : members;
}

/** Fires only when WHO is mirrored changes (not on every move). */
export function subscribeHouseCastRoster(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The ids being mirrored, as a stable string (for useSyncExternalStore). */
export function houseCastRosterKey(now = Date.now()): string {
  return now - receivedAt > HOUSE_CAST_STALE_MS ? "" : key;
}

/** One catch-up GET per page load; broadcasts carry it from there. */
export function loadHouseCastOnce() {
  if (fetched || typeof fetch === "undefined") return;
  fetched = true;
  fetch("/api/tank/house-cast", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => {
      if (json && receivedAt === 0) publishHouseCast(json);
    })
    .catch(() => {
      fetched = false;
    });
}

/** Tests only. */
export function resetHouseCastStore() {
  members = [];
  receivedAt = 0;
  fetched = false;
  key = "";
  listeners.clear();
}
