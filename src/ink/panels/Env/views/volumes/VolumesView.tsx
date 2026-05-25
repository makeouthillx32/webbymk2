// src/ink/panels/Env/views/volumes/VolumesView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Docker volumes view for an environment.
// Mirrors: Portainer volumes_list.go dangling-filter pattern for unused detection.
//
// Keyboard:
//   [↑↓/jk]  navigate
//   [a]       add volume
//   [d]       remove dangling (unused) volume (confirm)
//   [r]       refresh
//   [q/←]     back
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "../../../../runtimeInk.js";

import {
  fetchVolumes,
  removeVolume,
  type VolumeSummary,
} from "../../../../agent-client.ts";
import { Divider } from "../../../../components/Divider.tsx";
import { KeyHints } from "../../../../components/KeyHint.tsx";
import { Spinner } from "../../../../components/Spinner.tsx";
import { useTermHeight } from "../../../../hooks/useTermWidth.ts";
import type { UnaxisEnvironment } from "../../../../environment-store.ts";
import { CreateVolumeView } from "./volumes.create.tsx";

interface VolumesViewProps {
  env:    UnaxisEnvironment;
  onBack: () => void;
}

const HINTS = [
  { k: "↑↓/jk", label: "navigate" },
  { k: "a",      label: "add" },
  { k: "d",      label: "remove unused" },
  { k: "r",      label: "refresh" },
  { k: "q/←",    label: "back" },
];

function truncate(text: string, max = 30): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function stackName(volume: VolumeSummary): string {
  return volume.Labels?.["com.docker.compose.project"] || "—";
}

function fmtCreated(iso: string): string {
  if (!iso) return "—";
  try {
    const ms = new Date(iso).getTime();
    const diff = Date.now() - ms;
    const day = 86_400_000;
    if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
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

export function VolumesView({ env, onBack }: VolumesViewProps) {
  const [volumes, setVolumes] = useState<VolumeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [status,  setStatus]  = useState<string | null>(null);
  const [selected,      setSelected]      = useState(0);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [showCreate,    setShowCreate]    = useState(false);

  const termHeight = useTermHeight();
  const listSize = Math.max(5, termHeight - 18);

  const refresh = useCallback(async () => {
    if (!env.agentUrl) {
      setLoading(false);
      setError("Agent URL is missing for this environment.");
      setVolumes([]);
      return;
    }

    setLoading(true);
    setError(null);
    setStatus(null);
    setPendingDelete(null);

    // fetchVolumes runs two parallel dangling-filter calls (Portainer pattern)
    // and tags each VolumeSummary with dangling: true/false
    const list = await fetchVolumes(env);
    if (!list) {
      setVolumes([]);
      setError("Failed to fetch volumes from the agent.");
    } else {
      const sorted = [...list].sort((a, b) => a.Name.toLowerCase().localeCompare(b.Name.toLowerCase()));
      setVolumes(sorted);
    }
    setLoading(false);
  }, [env]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, volumes.length - 1)));
  }, [volumes.length]);

  useEffect(() => {
    setPendingDelete(null);
  }, [selected]);

  const selectedVolume = volumes[selected] ?? null;
  const visible = useMemo(
    () => windowSlice(volumes, selected, listSize),
    [listSize, selected, volumes],
  );

  const unusedCount = volumes.filter((v) => v.dangling).length;

  const confirmDelete = useCallback(async () => {
    const target = selectedVolume;
    if (!target) return;
    if (!target.dangling) {
      setStatus(`Volume ${target.Name} is in use. Cannot remove.`);
      setPendingDelete(null);
      return;
    }

    if (pendingDelete !== target.Name) {
      setPendingDelete(target.Name);
      setStatus(`Press d again to remove ${target.Name}.`);
      return;
    }

    setBusy(true);
    const ok = await removeVolume(env, target.Name);
    setBusy(false);
    setPendingDelete(null);

    if (ok) {
      setStatus(`✓ Removed volume ${target.Name}`);
      await refresh();
    } else {
      setStatus(`✗ Failed to remove volume ${target.Name}`);
    }
  }, [env, pendingDelete, refresh, selectedVolume]);

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
      setSelected((value) => Math.min(Math.max(0, volumes.length - 1), value + 1));
      setPendingDelete(null);
      return;
    }
    if (input === "a") { setShowCreate(true); return; }
    if (input === "r") { void refresh(); return; }
    if (input === "d") { void confirmDelete(); return; }
  });

  if (showCreate) {
    return (
      <CreateVolumeView
        env={env}
        onDone={(created) => {
          setShowCreate(false);
          if (created) {
            setStatus("✓ Volume created");
            void refresh();
          }
        }}
      />
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box paddingX={1} gap={2} marginBottom={0}>
        <Text bold color="cyan">Volumes</Text>
        <Text dimColor>{env.name}</Text>
        <Text dimColor>• {volumes.length} total</Text>
        {unusedCount > 0 && <Text color="yellow">{unusedCount} unused</Text>}
      </Box>

      <Divider />

      {loading && (
        <Box paddingX={1} marginTop={1}>
          <Spinner message="Loading volumes…" />
        </Box>
      )}

      {!loading && error && (
        <Box paddingX={1} marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {!loading && !error && volumes.length === 0 && (
        <Box paddingX={1} marginTop={1}>
          <Text dimColor>No volumes found.  Press [a] to add one.</Text>
        </Box>
      )}

      {!loading && !error && volumes.length > 0 && (
        <Box flexDirection="column" gap={0}>
          <Box paddingX={1} marginTop={1} marginBottom={0} gap={2}>
            <Box width={3}><Text dimColor> </Text></Box>
            <Box width={22}><Text dimColor>Name</Text></Box>
            <Box width={10}><Text dimColor>Filter</Text></Box>
            <Box width={18}><Text dimColor>Stack</Text></Box>
            <Box width={12}><Text dimColor>Driver</Text></Box>
            <Box width={14}><Text dimColor>Created</Text></Box>
            <Box width={10}><Text dimColor>Ownership</Text></Box>
            <Box flexGrow={1}><Text dimColor>Mountpoint</Text></Box>
          </Box>

          {visible.start > 0 && (
            <Box paddingX={1}><Text dimColor>↑ {visible.start} more</Text></Box>
          )}

          {visible.rows.map((volume, idx) => {
            const actualIndex = visible.start + idx;
            const selectedRow = actualIndex === selected;
            const unused = volume.dangling;

            return (
              <Box key={volume.Name} paddingX={1} gap={2}>
                <Box width={3}>
                  <Text color={unused ? "yellow" : "green"} bold={selectedRow}>
                    {selectedRow ? "▶" : unused ? "○" : "●"}
                  </Text>
                </Box>
                <Box width={22}>
                  <Text color={selectedRow ? "cyan" : undefined} bold={selectedRow}>
                    {truncate(volume.Name, 20)}
                  </Text>
                </Box>
                <Box width={10}>
                  <Text color={unused ? "yellow" : "green"} dimColor={!unused && !selectedRow}>
                    {unused ? "unused" : "in use"}
                  </Text>
                </Box>
                <Box width={18}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {truncate(stackName(volume), 16)}
                  </Text>
                </Box>
                <Box width={12}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {truncate(volume.Driver, 10)}
                  </Text>
                </Box>
                <Box width={14}>
                  <Text dimColor color={selectedRow ? "gray" : undefined}>
                    {fmtCreated(volume.CreatedAt)}
                  </Text>
                </Box>
                <Box width={10}>
                  <Text dimColor>Public</Text>
                </Box>
                <Box flexGrow={1}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {truncate(volume.Mountpoint, 38)}
                  </Text>
                </Box>
              </Box>
            );
          })}

          {visible.end < volumes.length && (
            <Box paddingX={1}><Text dimColor>↓ {volumes.length - visible.end} more</Text></Box>
          )}
        </Box>
      )}

      {selectedVolume && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          paddingX={2}
          paddingY={1}
          marginTop={1}
        >
          <Box gap={2}>
            <Text bold color="cyan">{selectedVolume.Name}</Text>
            <Text color={selectedVolume.dangling ? "yellow" : "green"} bold={selectedVolume.dangling}>
              {selectedVolume.dangling ? "unused" : "in use"}
            </Text>
            <Text dimColor>{selectedVolume.Driver}</Text>
            <Text dimColor>Public</Text>
          </Box>
          <Text dimColor>stack: {stackName(selectedVolume)}</Text>
          <Text dimColor>mountpoint: {selectedVolume.Mountpoint}</Text>
          <Text dimColor>scope: {selectedVolume.Scope}</Text>
          <Text dimColor>created: {selectedVolume.CreatedAt}</Text>
          {selectedVolume.Labels && Object.keys(selectedVolume.Labels).length > 0 && (
            <Text dimColor>
              labels: {truncate(Object.entries(selectedVolume.Labels).map(([k, v]) => `${k}=${v}`).join(", "), 72)}
            </Text>
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
