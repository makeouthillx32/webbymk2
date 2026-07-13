// src/ink/panels/Env/index.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Environment panel — multi-node infrastructure board.
//
// ALL registered environments are live infrastructure nodes running
// simultaneously.  There is no "one active environment."
// is_default_target (★) marks the node the wizard pre-selects for new zones.
//
// Each card shows:
//   - Machine name + role + connection type
//   - Agent status dot (online / offline / unknown)
//   - Agent URL or install command if agent missing
//   - Docker endpoint URL
//   - is_default_target badge (★ default)
//
// Keyboard:
//   [↑↓/jk]  navigate
//   [p]       ping agent /health + save result
//   [d]       set as default deploy target
//   [r]       refresh from Supabase
//   [q/←]     back
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput }                             from "../../runtimeInk.js";

import {
  loadEnvironments,
  setActiveEnvironment,
  invalidateEnvironmentCache,
  environmentTypeColor,
  pingAgentHealth,
  saveAgentStatus,
  type UnaxisEnvironment,
  type AgentStatus,
}                               from "../../environment-store.ts";
import { buildAndPushAgent, updateRemoteAgent } from "../../agent-ops.ts";
import { probeEnvironments, probeStateTile, type EnvProbeResult } from "../../env-probe.ts";
import { KeyHints }             from "../../components/KeyHint.tsx";
import { LoadingState }         from "../../components/design-system/index.ts";

// ── Props ─────────────────────────────────────────────────────────────────────

interface EnvPanelProps {
  onGoBack:           () => void;
  addNotification:    (msg: string, type?: "success" | "error" | "info") => void;
  runOp?:             (title: string, op: (onLine: (l: string) => void) => Promise<number>) => void;
  onAddEnvironment?:  () => void;
  onSelectEnv?:       (env: UnaxisEnvironment) => void;
  envStale?:          boolean;
  lastEnvError?:      string | null;
  envDataAge?:        number;
  /** Pre-seeded environment list for snapshot-view — skips the Supabase fetch. */
  initialEnvs?:       UnaxisEnvironment[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeLabel(t: UnaxisEnvironment["type"]): string {
  switch (t) {
    case "local-docker":  return "Local";
    case "remote-docker": return "Remote";
    case "azure":         return "Azure";
    case "edge":          return "Edge";
  }
}

/** Dot + label for agent health */
function agentDot(status: AgentStatus): { dot: string; color: string; label: string } {
  switch (status) {
    case "online":  return { dot: "●", color: "green",  label: "agent online"  };
    case "offline": return { dot: "●", color: "red",    label: "agent offline" };
    case "unknown": return { dot: "●", color: "gray",   label: "agent unknown" };
  }
}

/** Shorten docker_url for display */
function shortDockerUrl(url: string): string {
  if (!url) return "—";
  if (url.startsWith("unix://")) return url.replace("unix://", "");
  if (url.startsWith("tcp://"))  return url.replace("tcp://", "");
  return url;
}

function ageLabel(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 90) return `${secs}s old`;
  return `${Math.floor(secs / 60)}m old`;
}


const HINTS = [
  { k: "↑↓/jk", label: "navigate" },
  { k: "Enter",  label: "open" },
  { k: "a",      label: "add environment" },
  { k: "p",      label: "ping agent" },
  { k: "u",      label: "update agent" },
  { k: "d",      label: "set default target" },
  { k: "r",      label: "refresh" },
  { k: "q/←",   label: "back" },
];

// ── Environment card ──────────────────────────────────────────────────────────

function EnvCard({ env, focused, pinging, updating, expanded, pingError, probe }: {
  env:       UnaxisEnvironment;
  focused:   boolean;
  pinging:   boolean;
  updating:  boolean;
  expanded:  boolean;
  pingError: string | null;
  probe:     EnvProbeResult | null;
}) {
  const typeClr   = environmentTypeColor(env.type) as any;
  const borderClr = focused ? "cyan" : env.isDefaultTarget ? "#D4A27F" : "gray";
  const agent     = agentDot(env.agentStatus);
  const hasAgent  = !!env.agentUrl;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderClr}
      paddingX={1}
      paddingY={0}
      marginBottom={1}
    >
      {/* ── Row 1: focus + name + type + role + default badge ─────────── */}
      <Box gap={2}>
        <Text color="cyan" bold={focused}>{focused ? "▶" : " "}</Text>

        <Text bold color={focused ? "cyan" : "white"}>{env.name}</Text>

        <Text color={typeClr}>{typeLabel(env.type)}</Text>

        {env.machineRole && <Text dimColor>{env.machineRole}</Text>}

        {/* Deep state tile — online / busy / sleeping / wedged / restarting */}
        {probe && (() => {
          const tile = probeStateTile(probe.state);
          return <Text color={tile.color} bold>{tile.icon} {tile.label}</Text>;
        })()}

        {/* Default target badge */}
        {env.isDefaultTarget && (
          <Text color="#D4A27F" bold>★ default</Text>
        )}

        {pinging  && focused && <Text color="yellow">pinging…</Text>}
        {updating && focused && <Text color="magenta">updating agent…</Text>}
      </Box>

      {/* ── Row 2: endpoint tiles (host / agent / engine) ─────────────── */}
      {probe && (
        <Box gap={2} paddingLeft={3}>
          <Text dimColor>host</Text>
          <Text color={probe.host === "up" ? "green" : probe.host === "down" ? "red" : "gray"}>
            {probe.host}
          </Text>
          <Text dimColor>agent</Text>
          <Text color={probe.agent === "up" ? "green" : probe.agent === "down" ? "red" : "gray"}>
            {probe.agent}
          </Text>
          <Text dimColor>engine</Text>
          <Text color={
            probe.engine === "up" ? "green"
            : probe.engine === "wedged" ? "red"
            : probe.engine === "off" ? "blue"
            : "gray"
          }>
            {probe.engine}
          </Text>
          {probe.engineLatencyMs != null && <Text dimColor>{probe.engineLatencyMs}ms</Text>}
          <Text dimColor wrap="truncate">{probe.detail}</Text>
        </Box>
      )}

      {/* ── Row 3: agent status + URL ──────────────────────────────────── */}
      <Box gap={2} paddingLeft={3}>
        {/* Agent dot */}
        <Text color={agent.color}>{agent.dot}</Text>

        {hasAgent ? (
          <>
            <Text dimColor>{env.agentUrl}</Text>
            {env.agentVersion && <Text dimColor>v{env.agentVersion}</Text>}
            {env.agentLastSeenAt && (
              <Text dimColor>
                last seen {new Date(env.agentLastSeenAt).toLocaleTimeString()}
              </Text>
            )}
          </>
        ) : (
          <Text color="yellow">agent not configured — press [p] to see setup</Text>
        )}
      </Box>

      {/* ── Row 3: docker URL + NPM + proxy + domain ───────────────────── */}
      <Box gap={3} paddingLeft={3}>
        {env.dockerUrl && <Text dimColor>{shortDockerUrl(env.dockerUrl)}</Text>}
        {env.npmHost   && <Text dimColor>NPM {env.npmHost}:{env.npmPort}</Text>}
        {env.proxyHost && <Text dimColor>proxy {env.proxyHost}:{env.proxyPort}</Text>}
        {env.domain    && <Text dimColor>{env.domain}</Text>}
      </Box>

      {/* ── Row 4: vault secrets ───────────────────────────────────────── */}
      {env.npmSecretId && (
        <Box paddingLeft={3}>
          <Text color="green" dimColor>npm-password ✓</Text>
        </Box>
      )}

      {/* ── No agent hint ──────────────────────────────────────────────── */}
      {!hasAgent && focused && (
        <Box paddingLeft={3}>
          <Text dimColor>press <Text color="cyan">[a]</Text> to add this environment's agent</Text>
        </Box>
      )}

      {/* ── Ping failure detail (Portainer-style) ──────────────────────── */}
      {pingError && (
        <Box flexDirection="column" paddingLeft={3} marginTop={0} gap={0}>
          <Text color="red" bold>Failure</Text>
          <Text color="red" wrap="wrap">{pingError}</Text>
        </Box>
      )}
    </Box>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function EnvPanel({
  onGoBack, addNotification, runOp, onAddEnvironment, onSelectEnv,
  envStale, lastEnvError, envDataAge, initialEnvs,
}: EnvPanelProps) {
  const [envs,       setEnvs]       = useState<UnaxisEnvironment[]>(initialEnvs ?? []);
  const [loading,    setLoading]    = useState(initialEnvs === undefined);
  const [pinging,    setPinging]    = useState(false);
  const [updating,   setUpdating]   = useState(false);
  const [selected,   setSelected]   = useState(0);
  const [expanded,   setExpanded]   = useState<number | null>(null);
  /** Per-env last ping failure detail — cleared on successful ping. */
  const [pingErrors, setPingErrors] = useState<Record<string, string>>({});
  /** Deep probe results (online/busy/sleeping/wedged/…) — polled every 15 s. */
  const [probes,     setProbes]     = useState<Record<string, EnvProbeResult>>({});

  const didInit = useRef(false);
  // Skip the initial Supabase fetch when pre-seeded (e.g. from snapshot-view).
  const seededRef = useRef(initialEnvs !== undefined);

  const refresh = useCallback(async () => {
    setLoading(true);
    invalidateEnvironmentCache();
    const all = await loadEnvironments(true);
    setEnvs(all);
    setLoading(false);
    setSelected((s) => Math.min(s, Math.max(0, all.length - 1)));
  }, []);

  useEffect(() => {
    if (seededRef.current) return;  // already have data — skip initial fetch
    if (!didInit.current) {
      didInit.current = true;
      refresh();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Deep state probes (host / agent / engine tiles) ─────────────────────
  // Probe all environments on mount and every 15 s. Parallel, bounded
  // timeouts inside probeEnvironments — worst case a cycle takes ~10 s.
  useEffect(() => {
    if (envs.length === 0) return;
    let cancelled = false;

    const runProbes = async () => {
      const results = await probeEnvironments(envs);
      if (cancelled) return;
      setProbes((prev) => {
        const next = { ...prev };
        for (const [id, r] of results) next[id] = r;
        return next;
      });
    };

    runProbes();
    const timer = setInterval(runProbes, 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [envs]);

  const handlePing = useCallback(async () => {
    const target = envs[selected];
    if (!target) return;
    if (!target.agentUrl) {
      // No agent — send to wizard instead
      onAddEnvironment?.();
      return;
    }
    setPinging(true);
    const result = await pingAgentHealth(target);
    await saveAgentStatus(target.id, result);
    setPinging(false);
    if (result.online) {
      addNotification(`✓ ${target.name} agent online${result.version ? ` v${result.version}` : ""}`, "success");
      // Clear any previous failure on success
      setPingErrors((prev) => { const next = { ...prev }; delete next[target.id]; return next; });
    } else {
      addNotification(`✗ ${target.name} unreachable`, "error");
      // Store full error detail for display on the card
      setPingErrors((prev) => ({ ...prev, [target.id]: result.detail ?? "unknown error" }));
    }
    // Refresh to get updated agent_status from DB
    const all = await loadEnvironments(true);
    setEnvs(all);
  }, [envs, selected, addNotification]);

  const handleUpdate = useCallback(() => {
    const target = envs[selected];
    if (!target) return;
    if (!runOp) {
      addNotification("Update agent not available in this context", "error");
      return;
    }

    // ── Update routing ─────────────────────────────────────────────────────────
    //
    // remote-docker (L0V3): standalone unaxis_agent — two-phase update.
    //   Phase 1: build + push agent-node + updater images to GHCR (on POWER)
    //   Phase 2: POST /self-update → agent pulls new image, spawns updater container,
    //            updater replaces running container with rollback safety,
    //            TUI polls /health until new version responds (120s timeout)
    //
    // local-docker (POWER): agent is embedded inside unt_proxy (proxy/server.js).
    //   proxy/server.js is bind-mounted + node --watch → code changes deploy instantly.
    //   Proxy image rebuild/update is handled via [b] in the core panel (home → core).
    //   [u] here builds + pushes the standalone agent image for use on remote nodes.
    //   TODO: wire [u] on local-docker to buildAndPushProxy() + proxy self-update
    //         once unt_proxy has a GHCR image and POST /self-update endpoint.
    //
    const isRemote = !!target.agentUrl && target.type === "remote-docker";

    if (isRemote) {
      runOp(`Update agent → ${target.name}`, async (onLine) => {
        onLine(`Phase 1/2 — build + push ...`);
        const buildCode = await buildAndPushAgent(onLine);
        if (buildCode !== 0) return buildCode;

        onLine(`Phase 2/2 — deploy to ${target.name} ...`);
        return updateRemoteAgent(target, onLine);
      });
    } else {
      // POWER: build + push the standalone agent image (keeps GHCR up to date
      // for deploying to new remote nodes). Proxy version is managed via core panel.
      runOp("Build + push agent image", (onLine) => buildAndPushAgent(onLine));
    }
  }, [envs, selected, runOp, addNotification]);

  const handleSetDefault = useCallback(async () => {
    const target = envs[selected];
    if (!target) return;
    if (target.isDefaultTarget) {
      addNotification(`${target.name} is already the default target`, "info");
      return;
    }
    // Reuse setActiveEnvironment which also flips is_default_target via backfill
    // TODO: add a dedicated setDefaultTarget RPC when the wizard is wired
    const result = await setActiveEnvironment(target.id);
    if (result) {
      addNotification(`★ ${result.name} set as default deploy target`, "success");
      await refresh();
    } else {
      addNotification(`✗ Failed to update default target`, "error");
    }
  }, [envs, selected, addNotification, refresh]);

  useInput((input, key) => {
    if (pinging || updating) return;
    if (input === "q" || key.leftArrow) { onGoBack(); return; }
    if (input === "a")                  { onAddEnvironment?.(); return; }
    if (input === "r")                  { refresh(); return; }
    if (input === "p")                  { handlePing(); return; }
    if (input === "u")                  { handleUpdate(); return; }
    if (input === "d")                  { handleSetDefault(); return; }
    if (key.upArrow   || input === "k") {
      setSelected((s) => Math.max(0, s - 1));
      setExpanded(null);
      return;
    }
    if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(envs.length - 1, s + 1));
      setExpanded(null);
      return;
    }
    if (key.return) {
      const target = envs[selected];
      if (target) onSelectEnv?.(target);
      return;
    }
  });

  const onlineCount = envs.filter((e) => e.agentStatus === "online").length;

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">

      {/* ── Stale banner ──────────────────────────────────────────────── */}
      {envStale && (
        <Box paddingX={1} marginBottom={1} gap={2}>
          <Text color="yellow" bold>⚠ stale data</Text>
          {lastEnvError ? (
            <Text dimColor>{lastEnvError.slice(0, 80)}</Text>
          ) : envDataAge !== undefined && envDataAge !== Infinity ? (
            <Text dimColor>last fetch: {ageLabel(envDataAge)} — Supabase may be unreachable</Text>
          ) : (
            <Text dimColor>environment data has never loaded from Supabase</Text>
          )}
        </Box>
      )}

      {/* ── Header ────────────────────────────────────────────────────── */}
      <Box paddingX={1} marginBottom={1} gap={2}>
        <Text bold color="cyan">Environments</Text>
        {loading  && <Text dimColor>loading…</Text>}
        {!loading && (
          <>
            <Text dimColor>{envs.length} node{envs.length !== 1 ? "s" : ""}</Text>
            {onlineCount > 0 && (
              <Text color="green">{onlineCount} agent{onlineCount !== 1 ? "s" : ""} online</Text>
            )}
          </>
        )}
        {pinging  && <Text color="yellow">pinging agent…</Text>}
        {updating && <Text color="magenta">updating agent…</Text>}
      </Box>

      {/* ── Cards ─────────────────────────────────────────────────────── */}
      {loading && (
        <Box paddingX={1}>
          <LoadingState message="loading environments…" />
        </Box>
      )}

      {!loading && envs.length === 0 && (
        <Box paddingX={1}>
          <Text dimColor>No environments configured. Add rows to the environments table in Supabase.</Text>
        </Box>
      )}

      {!loading && envs.map((env, idx) => (
        <EnvCard
          key={env.id}
          env={env}
          focused={idx === selected}
          pinging={pinging}
          updating={updating}
          expanded={expanded === idx}
          pingError={pingErrors[env.id] ?? null}
          probe={probes[env.id] ?? null}
        />
      ))}

      <KeyHints hints={HINTS} />
    </Box>
  );
}
