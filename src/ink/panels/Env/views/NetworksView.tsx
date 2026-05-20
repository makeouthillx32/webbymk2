// src/ink/panels/Env/views/NetworksView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Scrollable network list. System networks (bridge/host/none) can be toggled.
//
// Keyboard:
//   ↑↓/jk   scroll
//   f        toggle filter (hide/show system networks — default: hide)
//   R        refresh
//   q/←      back
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput }                     from "ink";

import { fetchNetworks }          from "../../../agent-client.ts";
import type { NetworkSummary }    from "../../../agent-client.ts";
import { Spinner }                from "../../../components/Spinner.tsx";
import { Divider }                from "../../../components/Divider.tsx";
import { KeyHints }               from "../../../components/KeyHint.tsx";
import type { UnaxisEnvironment } from "../../../environment-store.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

const SYSTEM_NETWORKS = new Set(["bridge", "host", "none"]);

function isSystem(n: NetworkSummary): boolean {
  return SYSTEM_NETWORKS.has(n.Name);
}

function trunc(s: string, len: number): string {
  return s.length > len ? s.slice(0, len - 1) + "…" : s;
}

function stackLabel(n: NetworkSummary): string {
  return n.Labels?.["com.docker.compose.project"] ?? "";
}

function subnet(n: NetworkSummary): string {
  return n.IPAM?.Config?.[0]?.Subnet ?? "—";
}

function gateway(n: NetworkSummary): string {
  return n.IPAM?.Config?.[0]?.Gateway ?? "—";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NetworksView({
  env,
  onBack,
}: {
  env:    UnaxisEnvironment;
  onBack: () => void;
}) {
  const [networks,     setNetworks]     = useState<NetworkSummary[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [selected,     setSelected]     = useState(0);
  const [hideSystem,   setHideSystem]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const data = await fetchNetworks(env);
    setLoading(false);
    if (data) {
      setNetworks(data);
    } else {
      setError("Failed to fetch networks from agent.");
    }
  }, [env]);

  useEffect(() => { load(); }, [load]);

  const visible = hideSystem ? networks.filter((n) => !isSystem(n)) : networks;

  useInput((input, key) => {
    if (key.leftArrow || input === "q") { onBack(); return; }
    if (key.upArrow   || input === "k") { setSelected((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(visible.length - 1, s + 1));
      return;
    }
    if (input === "f") {
      setHideSystem((h) => !h);
      setSelected(0);
      return;
    }
    if (input === "R") { load(); return; }
  });

  const hints = [
    { k: "↑↓/jk", label: "scroll" },
    { k: "f",      label: hideSystem ? "show system" : "hide system" },
    { k: "R",      label: "refresh" },
    { k: "q/←",   label: "back" },
  ];

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} gap={0}>
      {/* Header */}
      <Box gap={2} alignItems="center">
        <Text bold color="cyan">Networks</Text>
        <Box borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold color="white">{visible.length}</Text>
        </Box>
        {hideSystem && <Text dimColor>(system hidden)</Text>}
        <Text dimColor>on {env.name}</Text>
      </Box>

      <Divider />

      {loading && (
        <Box gap={1} paddingX={1}>
          <Spinner />
          <Text color="yellow">Loading networks…</Text>
        </Box>
      )}
      {error && !loading && <Text color="red">{error}</Text>}
      {!loading && !error && visible.length === 0 && (
        <Text dimColor>No networks to show. Press [f] to show system networks.</Text>
      )}

      {!loading && visible.map((n, i) => {
        const isSel = i === selected;
        const stack = stackLabel(n);
        const sys   = isSystem(n);
        return (
          <Box key={n.Id} gap={1} paddingX={isSel ? 0 : 1} flexDirection="row">
            {isSel && <Text color="cyan">▶</Text>}
            {sys && <Text dimColor>[System]</Text>}
            <Text bold={isSel} color={isSel ? "cyan" : "white"}>
              {trunc(n.Name, 25)}
            </Text>
            {stack && <Text dimColor>{trunc(stack, 18)}</Text>}
            <Text dimColor>{n.Driver}</Text>
            <Text dimColor>{subnet(n)}</Text>
            <Text dimColor>{gateway(n)}</Text>
          </Box>
        );
      })}

      <KeyHints hints={hints} />
    </Box>
  );
}
