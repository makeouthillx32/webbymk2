"use client";

import { useEffect, useMemo, useState } from "react";
import type { CameraDirectorySnapshot, DiscoveredCamera } from "../contracts";

export function useTankCameras() {
  const [snapshot, setSnapshot] = useState<CameraDirectorySnapshot | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/tank/cameras", { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as CameraDirectorySnapshot;
        if (active) setSnapshot(next);
      } catch {
        // keep last known snapshot
      }
    };
    void load();
    const timer = window.setInterval(load, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

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
