"use client";

import { useEffect, useMemo, useState } from "react";
import type { CameraDirectorySnapshot, DiscoveredCamera } from "../contracts";

/**
 * "public" is what viewers get. "staff" (house console only) also carries the
 * rooms switched off for Tank, tagged `offAir` — their cameras are still
 * ingested and tracked, so the staff room keeps seeing them.
 */
export function useTankCameras(scope: "public" | "staff" = "public") {
  const [snapshot, setSnapshot] = useState<CameraDirectorySnapshot | null>(null);
  const endpoint = scope === "staff" ? "/api/tank/staff/cameras" : "/api/tank/cameras";

  useEffect(() => {
    let active = true;
    let loading = false;
    let timer: number | null = null;
    const schedule = () => {
      if (!active) return;
      timer = window.setTimeout(
        load,
        document.visibilityState === "hidden" ? 30_000 : 5_000,
      );
    };
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as CameraDirectorySnapshot;
        if (active) setSnapshot(next);
      } catch {
        // keep last known snapshot
      } finally {
        loading = false;
        schedule();
      }
    };
    const handleVisibilityChange = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      void load();
    };
    void load();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [endpoint]);

  const liveById = useMemo(() => {
    const map = new Map<string, DiscoveredCamera>();
    for (const camera of snapshot?.cameras ?? []) map.set(camera.id, camera);
    return map;
  }, [snapshot]);

  const isOnline = (id: string) => {
    const live = liveById.get(id);
    return live?.presence === "online" || live?.presence === "degraded";
  };

  return {
    snapshot,
    liveById,
    isOnline,
  };
}
