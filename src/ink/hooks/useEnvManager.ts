// src/ink/hooks/useEnvManager.ts
// ─────────────────────────────────────────────────────────────────────────────
// OWNERSHIP: environment topology only.
//
//   ✓  Active environment resolution and polling
//   ✓  Infra health checks (targets derived from the active environment)
//   ✓  Env staleness tracking (data age, last error, stale flag)
//   ✗  Zone definitions — that is useZoneManager
//   ✗  Docker container polling — that is useZoneManager
//   ✗  Background operation lifecycle — that is useBackgroundOps
//
// Design principle: resolve the active environment ONCE here (in state) and
// pass it down.  Call sites must never do their own `getActiveEnvironment()`
// fetch — they should receive activeEnv as a prop or from this hook.
// Hidden async resolution at call sites creates ordering bugs and makes the
// source of truth ambiguous.
//
// Staleness principle (from the Portainer audit):
//   Every cache, fallback, and switch must say what it is doing.
//   If the TUI is showing stale data, it must say so.
//   Silent fallback is how you ship lies.
//
//   envStale = true when:
//     - The last poll failed (lastPollError is non-null), OR
//     - The data is older than STALE_THRESHOLD_MS (2× TTL = 2 min)
//   envDataAge = ms since the last SUCCESSFUL fetch (0 = never fetched)
//
// InfraPanel receives activeEnv as a prop and builds its service list from it,
// so the displayed hostnames always match what was actually checked.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useRef } from "react";

import {
  loadEnvironments,
  invalidateEnvironmentCache,
  getLastEnvironmentFetchTime,
  getLastEnvironmentError,
  type UnaxisEnvironment,
}                            from "../environment-store.ts";
import { buildInfraServices, INFRA_SERVICES, checkService } from "../infra.ts";
import type { ServiceResult } from "../infra.ts";

// ── Constants ─────────────────────────────────────────────────────────────────

const CACHE_TTL_MS      = 60_000;
const STALE_THRESHOLD_MS = 2 * CACHE_TTL_MS;  // 2 minutes — 2× TTL

// ── Types ─────────────────────────────────────────────────────────────────────

type InfraMap = Record<number, ServiceResult>;

// Source of the service list used for the last check run — surfaced to the
// UI so InfraPanel can show "Env: prod [local-docker]" vs "fallback config".
export type InfraSource =
  | { kind: "env";      name: string; type: string }
  | { kind: "fallback"; reason: string };

interface UseEnvManagerParams {
  /** How often to re-poll the active environment record. Default: 60 000 ms. */
  pollIntervalMs?: number;
}

export interface UseEnvManagerResult {
  activeEnv:    UnaxisEnvironment | null;
  envsLoading:  boolean;

  // ── Staleness signals ────────────────────────────────────────────────────
  /** True when data is old (>2× TTL) or the last poll errored. */
  envStale:     boolean;
  /** ms since last successful fetch from Supabase.  0 = never fetched. */
  envDataAge:   number;
  /** Error message from the last failed poll, or null. */
  lastEnvError: string | null;

  // ── Infra health ─────────────────────────────────────────────────────────
  infraResults:  InfraMap;
  infraChecking: boolean;
  infraSource:   InfraSource | null;

  /** Re-check all (indices === undefined) or specific service indices. */
  checkInfra:   (indices?: number[]) => void;

  /** Bust the env cache and reload immediately. */
  refreshEnvs:  () => Promise<void>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useEnvManager({
  pollIntervalMs = CACHE_TTL_MS,
}: UseEnvManagerParams = {}): UseEnvManagerResult {

  const [activeEnv,    setActiveEnv]    = useState<UnaxisEnvironment | null>(null);
  const [envsLoading,  setEnvsLoading]  = useState(true);
  const [lastPollError, setLastPollError] = useState<string | null>(null);
  // envDataAge is derived on every render from the module-level _fetchedAt
  // via getLastEnvironmentFetchTime().  No state needed — always current.

  const [infraResults,  setInfraResults]  = useState<InfraMap>({});
  const [infraChecking, setInfraChecking] = useState(false);
  const [infraSource,   setInfraSource]   = useState<InfraSource | null>(null);

  const infraBusyRef = useRef(false);

  // ── Poll helper ───────────────────────────────────────────────────────────
  // Called by the initial load and by the interval. Reads the error state from
  // environment-store after each call (live binding via getter).

  async function doPoll(force = false): Promise<void> {
    const all = await loadEnvironments(force);
    const err = getLastEnvironmentError();
    setLastPollError(err);
    if (!err) {
      // Successful fetch — update active env
      const active = all.find((e) => e.active) ?? null;
      setActiveEnv(active);
    }
    // On error: keep the previous activeEnv value so the TUI
    // doesn't suddenly show null — but envStale will be true.
  }

  // ── refreshEnvs — public API for forced reload ────────────────────────────
  const refreshEnvs = useCallback(async () => {
    setEnvsLoading(true);
    invalidateEnvironmentCache();
    await doPoll(true);
    setEnvsLoading(false);
  // doPoll is stable (no captured reactive state) so eslint-disable is fine
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mount: initial load + polling interval ────────────────────────────────
  // We use a ref guard against double-mount in dev-mode strict-mode React,
  // matching the pattern used in useZoneManager and EnvPanel.

  const didInit = useRef(false);

  if (!didInit.current) {
    didInit.current = true;

    // Initial load — fire and forget
    doPoll().then(() => setEnvsLoading(false)).catch(() => setEnvsLoading(false));

    // Polling interval
    const id = setInterval(() => { doPoll(); }, pollIntervalMs);

    // Cleanup on process exit (TUI never remounts App, so this is acceptable)
    if (typeof process !== "undefined") {
      process.once("exit", () => clearInterval(id));
    }
  }

  // ── Derived staleness values (computed fresh on every render) ─────────────
  const envDataAge  = getLastEnvironmentFetchTime() > 0
    ? Date.now() - getLastEnvironmentFetchTime()
    : Infinity;  // never fetched successfully → always stale

  const envStale = lastPollError !== null || envDataAge > STALE_THRESHOLD_MS;

  // ── Infra health checks ────────────────────────────────────────────────────
  // Snapshots activeEnv at call time — no hidden I/O inside the check path.
  // infraSource records which env (or fallback) was checked so the panel
  // can always display it explicitly.

  const checkInfra = useCallback((indices?: number[]) => {
    if (infraBusyRef.current) return;

    const envSnapshot = activeEnv;
    const services    = envSnapshot ? buildInfraServices(envSnapshot) : INFRA_SERVICES;

    const source: InfraSource = envSnapshot
      ? { kind: "env", name: envSnapshot.name, type: envSnapshot.type }
      : { kind: "fallback", reason: "no active environment — using config.json defaults" };

    setInfraSource(source);

    const targets = indices ?? services.map((_, i) => i);

    infraBusyRef.current = true;
    setInfraChecking(true);

    setInfraResults((prev) => {
      const next = { ...prev };
      for (const i of targets) next[i] = { status: "checking", ms: null, code: null };
      return next;
    });

    Promise.all(
      targets.map(async (i) => {
        const svc = services[i];
        if (!svc) return;
        const r = await checkService(svc);
        setInfraResults((prev) => ({ ...prev, [i]: r }));
      })
    ).finally(() => {
      infraBusyRef.current = false;
      setInfraChecking(false);
    });

  }, [activeEnv]);

  // ──────────────────────────────────────────────────────────────────────────
  return {
    activeEnv,
    envsLoading,
    envStale,
    envDataAge,
    lastEnvError: lastPollError,
    infraResults,
    infraChecking,
    infraSource,
    checkInfra,
    refreshEnvs,
  };
}
