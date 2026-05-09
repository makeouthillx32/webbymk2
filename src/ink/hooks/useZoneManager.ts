// src/ink/hooks/useZoneManager.ts
// ─────────────────────────────────────────────────────────────────────────────
// Owns zone data, Docker status polling, and infra health checks.
//
// Responsibilities:
//   • Load zones from Supabase on mount (via zone-store.ts cache)
//   • Poll Docker every 5 s for zone + proxy container status
//   • Run ad-hoc infra health checks (checkInfra)
//
// Zone list loading is managed by useResource — no manual useState/useEffect
// for the fetch lifecycle.
//
// executeAction lives in ZonesView (closer to the UI that triggers it), so
// this hook stays focused on data-fetching and background polling only.
//
// handleNpmToggle has moved into NpmPanel (self-contained now).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";

import type { Zone }          from "../../config/zones.ts";
import type { Status }        from "../docker.ts";
import type { ServiceResult } from "../infra.ts";

import { loadZones }                    from "../zone-store.ts";
import { pollAll }                      from "../docker.ts";
import { INFRA_SERVICES, checkService } from "../infra.ts";
import { useResource }                  from "./useResource.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

type StatusMap = Record<string, Status>;
type InfraMap  = Record<number, ServiceResult>;

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
    const id = setInterval(refreshZones, STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshZones, pollEnabled]);

  // ── Infra health checks ────────────────────────────────────────────────────
  const [infraResults,  setInfraResults]  = useState<InfraMap>({});
  const [infraChecking, setInfraChecking] = useState(false);

  const checkInfra = useCallback(async (indices?: number[]) => {
    if (infraChecking) return;

    const targets = indices ?? INFRA_SERVICES.map((_, i) => i);
    setInfraChecking(true);
    setInfraResults((prev) => {
      const next = { ...prev };
      for (const i of targets) next[i] = { status: "checking", ms: null, code: null };
      return next;
    });

    await Promise.all(
      targets.map(async (i) => {
        const r = await checkService(INFRA_SERVICES[i]);
        setInfraResults((prev) => ({ ...prev, [i]: r }));
      })
    );

    setInfraChecking(false);
  }, [infraChecking]);

  // ──────────────────────────────────────────────────────────────────────────
  return {
    zones, setZones, zonesLoading,
    refreshZoneList,
    zoneStatuses, proxyStatus,
    refreshZones,
    infraResults,  infraChecking, checkInfra,
  };
}
