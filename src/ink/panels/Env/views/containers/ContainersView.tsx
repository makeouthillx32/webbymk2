// src/ink/panels/Env/views/containers/ContainersView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Live Docker containers view for an environment.
// Mirrors: Portainer containerController.js
//
// Columns: Name · State · Stack · Image · Created · IP Address · Published Ports
//
// Keyboard:
//   [↑↓/jk]  navigate
//   [a]       add container
//   [n]       inspect (JSON)
//   [s]       stop
//   [t]       start / resume
//   [r]       restart
//   [k]       kill
//   [d]       delete (confirm)
//   [i]       stats (CPU/RAM snapshot)
//   [l]       logs (last 80 lines)
//   [R]       refresh
//   [q/←]     back
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Box, Text, useInput } from "../../../../runtimeInk.js";
import { useScrollIntoView }                          from "../../../../components/ScrollBox.js";
import type { DOMElement }                            from "../../../../dom.js";

import {
  fetchContainers,
  containerAction,
  removeContainer,
  fetchContainerStats,
  fetchContainerLogs,
  type ContainerSummary,
  type ContainerStats,
} from "../../../../agent-client.ts";
import { Divider } from "../../../../components/Divider.tsx";
import { KeyHints } from "../../../../components/KeyHint.tsx";
import { Spinner } from "../../../../components/Spinner.tsx";
import { useTermHeight } from "../../../../hooks/useTermWidth.ts";
import type { UnaxisEnvironment } from "../../../../environment-store.ts";
import { CreateContainerView } from "./containers.create.tsx";
import { ContainerInspectView } from "./containers.inspect.tsx";

interface ContainersViewProps {
  env:    UnaxisEnvironment;
  onBack: () => void;
}

const HINTS = [
  { k: "↑↓/jk", label: "navigate" },
  { k: "a",      label: "add" },
  { k: "n",      label: "inspect" },
  { k: "s",      label: "stop" },
  { k: "t",      label: "start" },
  { k: "r",      label: "restart" },
  { k: "k",      label: "kill" },
  { k: "d",      label: "delete" },
  { k: "i",      label: "stats" },
  { k: "l",      label: "logs" },
  { k: "R",      label: "refresh" },
  { k: "q/←",    label: "back" },
];

function fmtBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function fmtCreated(created: number): string {
  if (!created) return "—";
  const ms = created * 1000;
  const diff = Date.now() - ms;
  const hour = 3_600_000;
  const day = 86_400_000;
  if (diff < hour) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < day)  return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ms).toLocaleDateString();
}

function truncate(text: string, max = 30): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function containerName(container: ContainerSummary): string {
  const raw = container.Names?.[0] ?? container.Id;
  return raw.replace(/^\//, "");
}

function stackName(container: ContainerSummary): string {
  return container.Labels?.["com.docker.compose.project"] || "—";
}

/** Mirrors Portainer: IP from NetworkSettings.Networks[NetworkName].IPAddress */
function ipAddress(container: ContainerSummary): string {
  if (!container.NetworkSettings?.Networks) return "—";
  const nets = Object.values(container.NetworkSettings.Networks);
  for (const net of nets) {
    if (net?.IPAddress) return net.IPAddress;
  }
  return "—";
}

/** Mirrors Portainer: public:private port pairs */
function publishedPorts(container: ContainerSummary): string {
  if (!container.Ports?.length) return "—";
  const pairs = container.Ports
    .filter((p) => p.PublicPort)
    .map((p) => `${p.PublicPort}:${p.PrivatePort}`);
  if (pairs.length === 0) return "—";
  return pairs.join(", ");
}

function stateTone(container: ContainerSummary): { color: string; bold: boolean; label: string } {
  const state = (container.State || "").toLowerCase();
  const status = (container.Status || "").toLowerCase();

  if (state === "running") {
    if (status.includes("unhealthy")) return { color: "red", bold: true, label: "unhealthy" };
    if (status.includes("healthy"))   return { color: "green", bold: true, label: "healthy" };
    if (status.includes("restarting")) return { color: "yellow", bold: false, label: "restarting" };
    return { color: "green", bold: false, label: "running" };
  }

  if (state === "paused")     return { color: "yellow", bold: false, label: "paused" };
  if (state === "restarting") return { color: "yellow", bold: false, label: "restarting" };
  if (state === "created")    return { color: "red", bold: false, label: "created" };
  if (state === "dead")       return { color: "red", bold: true, label: "dead" };
  if (state === "exited")     return { color: "red", bold: false, label: "exited" };

  return { color: "gray", bold: false, label: state || "unknown" };
}

function displayImage(container: ContainerSummary): string {
  return container.Image || container.ImageID || "—";
}

/** Mirrors Portainer: exitCode extracted via /\((\d+)\)/ from Status string */
function exitCode(container: ContainerSummary): number | null {
  if (container.State !== "exited" && container.State !== "dead") return null;
  const m = /\((\d+)\)/.exec(container.Status ?? "");
  return m ? parseInt(m[1], 10) : null;
}

function windowSlice<T>(items: T[], selected: number, size: number): { start: number; end: number; rows: T[] } {
  if (items.length <= size) {
    return { start: 0, end: items.length, rows: items };
  }
  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(selected - half, items.length - size));
  const end = Math.min(items.length, start + size);
  return { start, end, rows: items.slice(start, end) };
}

export function ContainersView({ env, onBack }: ContainersViewProps) {
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  const infoBoxRef = useRef<DOMElement>(null);
  useScrollIntoView(infoBoxRef, containers.length > 0 && selected >= 0, 0, selected);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [logs, setLogs] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showInspect, setShowInspect] = useState(false);

  const termHeight = useTermHeight();
  const listSize = Math.max(5, termHeight - 18);

  const refresh = useCallback(async () => {
    if (!env.agentUrl) {
      setLoading(false);
      setError("Agent URL is missing for this environment.");
      setContainers([]);
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);
    setPendingDelete(null);

    const list = await fetchContainers(env);
    if (!list) {
      setContainers([]);
      setError("Failed to fetch containers from the agent.");
    } else {
      const sorted = [...list].sort((a, b) => {
        const stackA = stackName(a).toLowerCase();
        const stackB = stackName(b).toLowerCase();
        if (stackA !== stackB) return stackA.localeCompare(stackB);
        return containerName(a).toLowerCase().localeCompare(containerName(b).toLowerCase());
      });
      setContainers(sorted);
    }
    setLoading(false);
  }, [env]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, containers.length - 1)));
  }, [containers.length]);

  useEffect(() => {
    setPendingDelete(null);
    setStats(null);
    setLogs(null);
    setShowLogs(false);
  }, [selected]);

  const selectedContainer = containers[selected] ?? null;
  const runningCount = containers.filter((c) => c.State === "running").length;
  const pausedCount = containers.filter((c) => c.State === "paused").length;

  const visible = useMemo(
    () => windowSlice(containers, selected, listSize),
    [containers, listSize, selected],
  );

  const selectedTone = selectedContainer ? stateTone(selectedContainer) : null;

  const runAction = useCallback(
    async (verb: "start" | "stop" | "restart" | "kill" | "pause" | "resume", label: string) => {
      const target = selectedContainer;
      if (!target) return;
      setBusy(true);
      setStatus(`Sending ${label} to ${containerName(target)}…`);
      const ok = await containerAction(env, target.Id, verb);
      setBusy(false);
      if (ok) {
        setStatus(`✓ ${label} ${containerName(target)}`);
        await refresh();
      } else {
        setStatus(`✗ Failed to ${label} ${containerName(target)}`);
      }
    },
    [env, refresh, selectedContainer],
  );

  const confirmDelete = useCallback(async () => {
    const target = selectedContainer;
    if (!target) return;
    if (target.State === "running" || target.State === "paused" || target.State === "restarting") {
      setStatus(`Stop ${containerName(target)} before deleting it.`);
      setPendingDelete(null);
      return;
    }

    if (pendingDelete !== target.Id) {
      setPendingDelete(target.Id);
      setStatus(`Press d again to delete ${containerName(target)}.`);
      return;
    }

    setBusy(true);
    const ok = await removeContainer(env, target.Id);
    setBusy(false);
    setPendingDelete(null);

    if (ok) {
      setStatus(`✓ Deleted ${containerName(target)}`);
      await refresh();
    } else {
      setStatus(`✗ Failed to delete ${containerName(target)}`);
    }
  }, [env, pendingDelete, refresh, selectedContainer]);

  const fetchStats = useCallback(async () => {
    const target = selectedContainer;
    if (!target || target.State !== "running") {
      setStatus("Stats only available for running containers.");
      return;
    }
    setStatsLoading(true);
    setStats(null);
    const s = await fetchContainerStats(env, target.Id);
    setStatsLoading(false);
    if (s) {
      setStats(s);
    } else {
      setStatus("Failed to fetch stats.");
    }
  }, [env, selectedContainer]);

  const fetchLogs = useCallback(async () => {
    const target = selectedContainer;
    if (!target) return;
    setLogsLoading(true);
    setLogs(null);
    setShowLogs(true);
    const text = await fetchContainerLogs(env, target.Id, 80);
    setLogsLoading(false);
    setLogs(text !== null ? text : "(failed to fetch logs)");
  }, [env, selectedContainer]);

  useInput((input, key) => {
    if (showCreate || showInspect) return;
    if (busy) return;
    if (showLogs) {
      if (key.escape || input === "q" || key.leftArrow) { setShowLogs(false); setLogs(null); return; }
      return;
    }
    if (key.escape || input === "q" || key.leftArrow) { onBack(); return; }
    if (key.upArrow || input === "k") {
      setSelected((value) => Math.max(0, value - 1));
      setPendingDelete(null);
      return;
    }
    if (key.downArrow || input === "j") {
      setSelected((value) => Math.min(Math.max(0, containers.length - 1), value + 1));
      setPendingDelete(null);
      return;
    }
    if (input === "R") { void refresh(); return; }
    if (input === "a") { setShowCreate(true); return; }
    if (!selectedContainer) return;

    if (input === "n") { setShowInspect(true); return; }
    if (input === "s") { void runAction("stop", "stopped"); return; }
    if (input === "t") {
      const verb = selectedContainer.State === "paused" ? "resume" : "start";
      void runAction(verb, verb === "resume" ? "resumed" : "started");
      return;
    }
    if (input === "r") { void runAction("restart", "restarted"); return; }
    if (input === "k") { void runAction("kill", "killed"); return; }
    if (input === "d") { void confirmDelete(); return; }
    if (input === "i") { void fetchStats(); return; }
    if (input === "l") { void fetchLogs(); return; }
  });

  // ── Overlays ─────────────────────────────────────────────────────────────────
  if (showCreate) {
    return (
      <CreateContainerView
        env={env}
        onDone={(created) => {
          setShowCreate(false);
          if (created) {
            setStatus("✓ Container created and started");
            void refresh();
          }
        }}
      />
    );
  }

  if (showInspect && selectedContainer) {
    return (
      <ContainerInspectView
        env={env}
        containerId={selectedContainer.Id}
        containerName={containerName(selectedContainer)}
        onDone={() => setShowInspect(false)}
      />
    );
  }

  // ── Logs overlay ─────────────────────────────────────────────────────────────
  if (showLogs) {
    const logLines = logs?.split("\n") ?? [];
    return (
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        <Box paddingX={1} gap={2} marginBottom={0}>
          <Text bold color="cyan">Logs</Text>
          <Text dimColor>{selectedContainer ? containerName(selectedContainer) : ""}</Text>
          <Text dimColor>last 80 lines</Text>
        </Box>
        <Divider />
        {logsLoading && (
          <Box paddingX={1} marginTop={1}><Spinner message="Fetching logs…" /></Box>
        )}
        {!logsLoading && (
          <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingX={1} marginTop={1}>
            {logLines.filter(Boolean).map((line, i) => (
              <Text key={i} dimColor wrap="truncate">{line}</Text>
            ))}
          </Box>
        )}
        <KeyHints hints={[{ k: "q/←/esc", label: "back" }]} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box paddingX={1} gap={2} marginBottom={0}>
        <Text bold color="cyan">Containers</Text>
        <Text dimColor>{env.name}</Text>
        <Text dimColor>• {containers.length} total</Text>
        <Text color="green">{runningCount} running</Text>
        {pausedCount > 0 && <Text color="yellow">{pausedCount} paused</Text>}
      </Box>

      <Divider />

      {loading && (
        <Box paddingX={1} marginTop={1}>
          <Spinner message="Loading containers…" />
        </Box>
      )}

      {!loading && error && (
        <Box paddingX={1} marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {!loading && !error && containers.length === 0 && (
        <Box paddingX={1} marginTop={1}>
          <Text dimColor>No containers found.  Press [a] to add one.</Text>
        </Box>
      )}

      {!loading && !error && containers.length > 0 && (
        <Box flexDirection="column" gap={0}>
          {/* Portainer columns: Name · State · Stack · Image · Created · IP · Ports */}
          <Box paddingX={1} marginTop={1} marginBottom={0} gap={2}>
            <Box width={3}><Text dimColor> </Text></Box>
            <Box width={22}><Text dimColor>Name</Text></Box>
            <Box width={12}><Text dimColor>State</Text></Box>
            <Box width={16}><Text dimColor>Stack</Text></Box>
            <Box width={22}><Text dimColor>Image</Text></Box>
            <Box width={12}><Text dimColor>Created</Text></Box>
            <Box width={16}><Text dimColor>IP Address</Text></Box>
            <Box flexGrow={1}><Text dimColor>Ports</Text></Box>
          </Box>

          {visible.start > 0 && (
            <Box paddingX={1}><Text dimColor>↑ {visible.start} more</Text></Box>
          )}

          {visible.rows.map((container, idx) => {
            const actualIndex = visible.start + idx;
            const selectedRow = actualIndex === selected;
            const tone = stateTone(container);
            const cName = containerName(container);
            const stack = stackName(container);

            return (
              <Box key={container.Id} paddingX={1} gap={2}>
                <Box width={3}>
                  <Text color={tone.color} bold={tone.bold}>{selectedRow ? "▶" : "●"}</Text>
                </Box>
                <Box width={22}>
                  <Text color={selectedRow ? "cyan" : undefined} bold={selectedRow}>
                    {truncate(cName, 20)}
                  </Text>
                </Box>
                <Box width={12}>
                  <Text color={tone.color} bold={tone.bold && selectedRow}>
                    {tone.label}
                  </Text>
                </Box>
                <Box width={16}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {truncate(stack, 14)}
                  </Text>
                </Box>
                <Box width={22}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {truncate(displayImage(container), 20)}
                  </Text>
                </Box>
                <Box width={12}>
                  <Text dimColor color={selectedRow ? "gray" : undefined}>
                    {fmtCreated(container.Created ?? 0)}
                  </Text>
                </Box>
                <Box width={16}>
                  <Text dimColor color={selectedRow ? "gray" : undefined}>
                    {truncate(ipAddress(container), 14)}
                  </Text>
                </Box>
                <Box flexGrow={1}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {truncate(publishedPorts(container), 28)}
                  </Text>
                </Box>
              </Box>
            );
          })}

          {visible.end < containers.length && (
            <Box paddingX={1}><Text dimColor>↓ {containers.length - visible.end} more</Text></Box>
          )}
        </Box>
      )}

      {selectedContainer && (
        <Box
          ref={infoBoxRef}
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={2}
          paddingY={1}
          marginTop={1}
        >
          <Box gap={2}>
            <Text bold color="cyan">{containerName(selectedContainer)}</Text>
            {selectedTone && (
              <Text color={selectedTone.color} bold={selectedTone.bold}>
                {selectedTone.label}
              </Text>
            )}
            <Text dimColor>{stackName(selectedContainer)}</Text>
          </Box>
          <Text dimColor>{truncate(displayImage(selectedContainer), 72)}</Text>
          <Box gap={4}>
            <Text dimColor>{selectedContainer.Status}</Text>
            {exitCode(selectedContainer) !== null && (
              <Text color={exitCode(selectedContainer) === 0 ? "green" : "red"}>
                exit {exitCode(selectedContainer)}
              </Text>
            )}
            {ipAddress(selectedContainer) !== "—" && (
              <Text dimColor>IP: <Text color="white">{ipAddress(selectedContainer)}</Text></Text>
            )}
          </Box>
          {publishedPorts(selectedContainer) !== "—" && (
            <Text dimColor>ports: <Text color="white">{publishedPorts(selectedContainer)}</Text></Text>
          )}
          {!!selectedContainer.Mounts?.length && (
            <Text dimColor>mounts: {selectedContainer.Mounts.length}</Text>
          )}
          {statsLoading && (
            <Box marginTop={1}><Spinner message="Fetching stats…" /></Box>
          )}
          {stats && (
            <Box gap={3} marginTop={1}>
              <Text color="cyan">CPU <Text bold>{stats.cpuPercent.toFixed(1)}%</Text></Text>
              <Text color="cyan">
                MEM <Text bold>{fmtBytes(stats.memUsed)}</Text>
                <Text dimColor> / {fmtBytes(stats.memLimit)}</Text>
                <Text dimColor> ({stats.memPercent.toFixed(1)}%)</Text>
              </Text>
            </Box>
          )}
        </Box>
      )}

      {status && (
        <Box paddingX={1} marginTop={1}>
          <Text dimColor>{status}</Text>
        </Box>
      )}

      <KeyHints hints={HINTS} />
    </Box>
  );
}
