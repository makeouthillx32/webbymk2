"use client";

import { useEffect, useMemo, useState } from "react";
import type { CameraDirectorySnapshot, DiscoveredCamera } from "../contracts";

export function useTankCameras() {
  const [snapshot, setSnapshot] = useState<CameraDirectorySnapshot | null>(null);

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
        const response = await fetch("/api/tank/cameras", { cache: "no-store" });
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
