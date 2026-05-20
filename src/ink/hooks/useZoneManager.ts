// src/ink/hooks/useZoneManager.ts
// ─────────────────────────────────────────────────────────────────────────────
// OWNERSHIP: zone topology and Docker container polling only.
//
//   ✓  Zone definitions — loaded from public.zones via zone-store.ts
//   ✓  Docker container status polling (every STATUS_POLL_INTERVAL_MS)
//   ✓  Proxy container status polling
//   ✗  Active environment resolution — that is useEnvManager
//   ✗  Infra health checks — that is useEnvManager
//   ✗  Environment switching — that is EnvPanel / useEnvManager
//
// Zones = app deployments keyed by container identity.
// Environments = infrastructure targets (host, domain, NPM, proxy).
// These are different concepts and must not bleed into each other.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";

import type { Zone }   from "../../config/zones.ts";
import type { Status } from "../docker.ts";

import { loadZones, invalidateZoneCache } from "../zone-store.ts";
import { pollAll }                         from "../docker.ts";
import { useResource }                     from "./useResource.ts";
import { isScrollActive }                  from "../../bootstrap/state.js";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusMap = Record<string, Status>;

interface ZoneManagerParams {
  addNotification: (msg: string, type?: "success" | "error" | "info") => void;
  pollEnabled?: boolean;
}

const STATUS_POLL_INTERVAL_MS = Number(process.env["POLL_INTERVAL_MS"]) || 10_000;

function sameStatusMap(a: StatusMap, b: StatusMap): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return bKeys.every((key) => a[key] === b[key]);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useZoneManager({
  addNotification: _addNotification,
  pollEnabled = true,
}: ZoneManagerParams) {

  // ── Zone definitions via useResource ──────────────────────────────────────
  const {
    data: zones,
    setData: setZones,
    loading: zonesLoading,
    refresh: refreshZoneList,
  } = useResource<Zone>({ fetch: loadZones });

  // ── Docker status polling ──────────────────────────────────────────────────
  const [zoneStatuses, setZoneStatuses] = useState<StatusMap>({});
  const [proxyStatus,  setProxyStatus]  = useState<Status>("missing");
  const pollingRef = useRef(false);

  const refreshZones = useCallback(async () => {
    if (!pollEnabled || zones.length === 0 || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const { zoneStatuses: zs, proxyStatus: ps } = await pollAll(zones);
      setZoneStatuses((prev) => sameStatusMap(prev, zs) ? prev : zs);
      setProxyStatus((prev) => prev === ps ? prev : ps);
    } finally {
      pollingRef.current = false;
    }
  }, [zones, pollEnabled]);

  useEffect(() => {
    if (!pollEnabled) return;
    refreshZones();
    const id = setInterval(() => { if (!isScrollActive()) refreshZones(); }, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshZones, pollEnabled]);

  // ── Force-refresh zone definitions ───────────────────────────────────────
  // Use this when the DB has changed (e.g. after a settings update) and you
  // don't want to wait out the 60-second cache TTL.
  const forceRefreshZoneList = useCallback(() => {
    invalidateZoneCache();
    refreshZoneList();
  }, [refreshZoneList]);

  // ──────────────────────────────────────────────────────────────────────────
  return {
    zones, setZones, zonesLoading,
    refreshZoneList,
    zoneStatuses, proxyStatus,
    refreshZones,
    forceRefreshZoneList,
  };
}
