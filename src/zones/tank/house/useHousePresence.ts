"use client";

import { useEffect, useState } from "react";

// Staff-only roll-up from the server heartbeat ledger. This never joins a room
// as a viewer, so opening House Console cannot inflate audience counts.
export type HousePresenceViewer = {
  userId: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: string;
  level?: number;
  xp?: number;
  tokens?: number;
  rank?: string;
  connectionType?: string;
  isCellular?: boolean;
  lastSeenAt?: string;
};

export type HousePresenceState = {
  counts: Map<string, number>;
  viewersByRoom: Map<string, HousePresenceViewer[]>;
  total: number;
};

export function useHousePresence(roomKeys: string[] = []): HousePresenceState {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [viewersByRoom, setViewersByRoom] = useState<Map<string, HousePresenceViewer[]>>(new Map());
  const keysSignature = roomKeys.join(",");

  useEffect(() => {
    const keys = Array.from(new Set(["director", ...keysSignature.split(",").filter(Boolean)]));
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/tank/presence/rooms?rooms=${encodeURIComponent(keys.join(","))}`, { cache: "no-store" });
        const json = await response.json();
        if (!active || !response.ok || !json.success) return;
        const nextViewers = new Map<string, HousePresenceViewer[]>();
        keys.forEach((key) => nextViewers.set(key, []));
        for (const viewer of json.viewers ?? []) {
          const list = nextViewers.get(viewer.roomKey) ?? [];
          list.push(viewer);
          nextViewers.set(viewer.roomKey, list);
        }
        setViewersByRoom(nextViewers);
        setCounts(new Map(Array.from(nextViewers, ([key, viewers]) => [key, viewers.length])));
      } catch {}
    };
    void refresh();
    const timer = window.setInterval(refresh, 10_000);

    return () => {
      active = false;
      window.clearInterval(timer);
      setCounts(new Map());
      setViewersByRoom(new Map());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSignature]);

  const total = Array.from(counts.values()).reduce((sum, n) => sum + n, 0);
  return { counts, viewersByRoom, total };
}
export default useHousePresence;
