// src/ink/panels/Env/views/networks/NetworksView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Docker networks view for an environment.
// Mirrors: Portainer networksController.js — unused = Object.keys(Containers).length === 0
//
// Columns: Name · Stack · Driver · Attachable · IPAM Driver · IPv4 Subnet/Gateway · State
//
// Keyboard:
//   [↑↓/jk]  navigate
//   [a]       add network
//   [f]       toggle system network filter
//   [d]       remove unused network (confirm)
//   [r]       refresh
//   [q/←]     back
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "../../../../runtimeInk.js";

import {
  fetchNetworks,
  removeNetwork,
  type NetworkSummary,
} from "../../../../agent-client.ts";
import { Divider } from "../../../../components/Divider.tsx";
import { KeyHints } from "../../../../components/KeyHint.tsx";
import { Spinner } from "../../../../components/Spinner.tsx";
import { useTermHeight } from "../../../../hooks/useTermWidth.ts";
import type { UnaxisEnvironment } from "../../../../environment-store.ts";
import { CreateNetworkView } from "./networks.create.tsx";

interface NetworksViewProps {
  env:    UnaxisEnvironment;
  onBack: () => void;
}

const HINTS = [
  { k: "↑↓/jk", label: "navigate" },
  { k: "a",      label: "add" },
  { k: "f",      label: "toggle sys" },
  { k: "d",      label: "remove unused" },
  { k: "r",      label: "refresh" },
  { k: "q/←",    label: "back" },
];

// Built-in Docker networks that are always present — mirror Portainer's system filter
const SYSTEM_NETWORKS = new Set(["bridge", "host", "none", "ingress"]);

function truncate(text: string, max = 30): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function stackName(network: NetworkSummary): string {
  return network.Labels?.["com.docker.compose.project"] || "—";
}

function isSystemNetwork(network: NetworkSummary): boolean {
  return SYSTEM_NETWORKS.has(network.Name) || network.Driver === "null";
}

/**
 * Mirror Portainer networksController.js:
 *   "if Object.keys(network.Containers).length === 0" → unused
 * System networks (bridge/host/none) are excluded from the unused badge.
 */
function isUnusedNetwork(network: NetworkSummary): boolean {
  if (isSystemNetwork(network)) return false;
  return Object.keys(network.Containers ?? {}).length === 0;
}

function ipv4Subnet(network: NetworkSummary): string {
  const cfg = network.IPAM?.Config ?? [];
  return cfg.find((c) => c.Subnet && !c.Subnet.includes(":"))?.Subnet || "—";
}

function ipv4Gateway(network: NetworkSummary): string {
  const cfg = network.IPAM?.Config ?? [];
  return cfg.find((c) => c.Gateway && !c.Gateway.includes(":"))?.Gateway || "—";
}

function ipv6Subnet(network: NetworkSummary): string {
  const cfg = network.IPAM?.Config ?? [];
  return cfg.find((c) => c.Subnet?.includes(":"))?.Subnet || "—";
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

export function NetworksView({ env, onBack }: NetworksViewProps) {
  const [networks, setNetworks] = useState<NetworkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [status,  setStatus]  = useState<string | null>(null);
  const [selected,      setSelected]      = useState(0);
  const [showSystem,    setShowSystem]    = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showCreate,    setShowCreate]    = useState(false);

  const termHeight = useTermHeight();
  const listSize = Math.max(5, termHeight - 18);

  const refresh = useCallback(async () => {
    if (!env.agentUrl) {
      setLoading(false);
      setError("Agent URL is missing for this environment.");
      setNetworks([]);
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);
    setPendingDelete(null);

    const list = await fetchNetworks(env);
    if (!list) {
      setNetworks([]);
      setError("Failed to fetch networks from the agent.");
    } else {
      const sorted = [...list].sort((a, b) => a.Name.toLowerCase().localeCompare(b.Name.toLowerCase()));
      setNetworks(sorted);
    }
    setLoading(false);
  }, [env]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visibleNetworks = useMemo(
    () => (showSystem ? networks : networks.filter((n) => !isSystemNetwork(n))),
    [networks, showSystem],
  );

  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, visibleNetworks.length - 1)));
  }, [visibleNetworks.length]);

  useEffect(() => {
    setPendingDelete(null);
  }, [selected]);

  const selectedNetwork = visibleNetworks[selected] ?? null;
  const visible = useMemo(
    () => windowSlice(visibleNetworks, selected, listSize),
    [listSize, selected, visibleNetworks],
  );

  const systemCount = networks.filter(isSystemNetwork).length;
  const userCount   = networks.length - systemCount;
  const unusedCount = networks.filter(isUnusedNetwork).length;

  const confirmDelete = useCallback(async () => {
    const target = selectedNetwork;
    if (!target) return;
    if (!isUnusedNetwork(target)) {
      setStatus(`Network ${target.Name} has attached containers. Cannot remove.`);
      setPendingDelete(null);
      return;
    }

    if (pendingDelete !== target.Id) {
      setPendingDelete(target.Id);
      setStatus(`Press d again to remove ${target.Name}.`);
      return;
    }

    setBusy(true);
    const ok = await removeNetwork(env, target.Id);
    setBusy(false);
    setPendingDelete(null);

    if (ok) {
      setStatus(`✓ Removed network ${target.Name}`);
      await refresh();
    } else {
      setStatus(`✗ Failed to remove network ${target.Name}`);
    }
  }, [env, pendingDelete, refresh, selectedNetwork]);

  useInput((input, key) => {
    if (showCreate) return;
    if (busy) return;
    if (key.escape || input === "q" || key.leftArrow) { onBack(); return; }
    if (key.upArrow || input === "k") {
      setSelected((value) => Math.max(0, value - 1));
      setPendingDelete(null);
      return;
    }
    if (key.downArrow || input === "j") {
      setSelected((value) => Math.min(Math.max(0, visibleNetworks.length - 1), value + 1));
      setPendingDelete(null);
      return;
    }
    if (input === "a") { setShowCreate(true); return; }
    if (input === "f") {
      setShowSystem((value) => !value);
      setStatus((!showSystem ? "Showing" : "Hiding") + " system networks");
      return;
    }
    if (input === "r") { void refresh(); return; }
    if (input === "d") { void confirmDelete(); return; }
  });

  if (showCreate) {
    return (
      <CreateNetworkView
        env={env}
        onDone={(created) => {
          setShowCreate(false);
          if (created) {
            setStatus("✓ Network created");
            void refresh();
          }
        }}
      />
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box paddingX={1} gap={2} marginBottom={0}>
        <Text bold color="cyan">Networks</Text>
        <Text dimColor>{env.name}</Text>
        <Text dimColor>• {visibleNetworks.length} shown</Text>
        <Text color="green">{userCount} user</Text>
        <Text dimColor>{systemCount} system</Text>
        {unusedCount > 0 && <Text color="yellow">{unusedCount} unused</Text>}
      </Box>

      <Divider />

      {loading && (
        <Box paddingX={1} marginTop={1}>
          <Spinner message="Loading networks…" />
        </Box>
      )}

      {!loading && error && (
        <Box paddingX={1} marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {!loading && !error && visibleNetworks.length === 0 && (
        <Box paddingX={1} marginTop={1}>
          <Text dimColor>
            {showSystem ? "No networks found." : "No user networks. Press [f] to show system networks or [a] to add one."}
          </Text>
        </Box>
      )}

      {!loading && !error && visibleNetworks.length > 0 && (
        <Box flexDirection="column" gap={0}>
          {/* Portainer columns: Name · Stack · Driver · Attachable · IPAM Driver · IPv4 Subnet · State */}
          <Box paddingX={1} marginTop={1} marginBottom={0} gap={2}>
            <Box width={3}><Text dimColor> </Text></Box>
            <Box width={20}><Text dimColor>Name</Text></Box>
            <Box width={16}><Text dimColor>Stack</Text></Box>
            <Box width={12}><Text dimColor>Driver</Text></Box>
            <Box width={11}><Text dimColor>Attachable</Text></Box>
            <Box width={10}><Text dimColor>IPAM</Text></Box>
            <Box width={18}><Text dimColor>IPv4 Subnet</Text></Box>
            <Box flexGrow={1}><Text dimColor>State</Text></Box>
          </Box>

          {visible.start > 0 && (
            <Box paddingX={1}><Text dimColor>↑ {visible.start} more</Text></Box>
          )}

          {visible.rows.map((network, idx) => {
            const actualIndex = visible.start + idx;
            const selectedRow = actualIndex === selected;
            const system  = isSystemNetwork(network);
            const unused  = isUnusedNetwork(network);
            const attached = Object.keys(network.Containers ?? {}).length;

            return (
              <Box key={network.Id} paddingX={1} gap={2}>
                <Box width={3}>
                  <Text
                    color={system ? "gray" : unused ? "yellow" : "green"}
                    bold={selectedRow}
                  >
                    {selectedRow ? "▶" : system ? "○" : unused ? "○" : "●"}
                  </Text>
                </Box>
                <Box width={20}>
                  <Text color={selectedRow ? "cyan" : undefined} bold={selectedRow}>
                    {truncate(network.Name, 18)}
                  </Text>
                </Box>
                <Box width={16}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {truncate(stackName(network), 14)}
                  </Text>
                </Box>
                <Box width={12}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {truncate(network.Driver, 10)}
                  </Text>
                </Box>
                <Box width={11}>
                  <Text dimColor color={network.Attachable ? "green" : undefined}>
                    {network.Attachable ? "yes" : "no"}
                  </Text>
                </Box>
                <Box width={10}>
                  <Text dimColor>{network.IPAM?.Driver || "default"}</Text>
                </Box>
                <Box width={18}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {truncate(ipv4Subnet(network), 16)}
                  </Text>
                </Box>
                <Box flexGrow={1}>
                  {system ? (
                    <Text dimColor>System</Text>
                  ) : unused ? (
                    <Text color="yellow">Unused</Text>
                  ) : (
                    <Text color="green">{attached} container{attached !== 1 ? "s" : ""}</Text>
                  )}
                </Box>
              </Box>
            );
          })}

          {visible.end < visibleNetworks.length && (
            <Box paddingX={1}><Text dimColor>↓ {visibleNetworks.length - visible.end} more</Text></Box>
          )}
        </Box>
      )}

      {selectedNetwork && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={2}
          paddingY={1}
          marginTop={1}
        >
          <Box gap={2}>
            <Text bold color="cyan">{selectedNetwork.Name}</Text>
            {isSystemNetwork(selectedNetwork) && <Text dimColor>System</Text>}
            {isUnusedNetwork(selectedNetwork) && <Text color="yellow">Unused</Text>}
            {!isSystemNetwork(selectedNetwork) && !isUnusedNetwork(selectedNetwork) && (
              <Text color="green">
                {Object.keys(selectedNetwork.Containers ?? {}).length} container
                {Object.keys(selectedNetwork.Containers ?? {}).length !== 1 ? "s" : ""}
              </Text>
            )}
            <Text dimColor>{selectedNetwork.Driver}</Text>
            {selectedNetwork.Attachable && <Text color="green">attachable</Text>}
          </Box>
          <Text dimColor>stack: {stackName(selectedNetwork)}</Text>
          <Text dimColor>ipv4 subnet: {ipv4Subnet(selectedNetwork)}  gateway: {ipv4Gateway(selectedNetwork)}</Text>
          {ipv6Subnet(selectedNetwork) !== "—" && (
            <Text dimColor>ipv6 subnet: {ipv6Subnet(selectedNetwork)}</Text>
          )}
          <Text dimColor>internal: {selectedNetwork.Internal ? "yes" : "no"}</Text>
          <Text dimColor>scope: {selectedNetwork.Scope}</Text>
          <Text dimColor>ownership: Public</Text>
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
