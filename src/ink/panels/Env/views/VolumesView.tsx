// src/ink/panels/Env/views/VolumesView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Scrollable volume list. Cross-references containers to detect unused volumes.
//
// Keyboard:
//   ↑↓/jk   scroll
//   d        remove selected (only if unused)
//   R        refresh
//   q/←      back
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput }                              from "ink";

import {
  fetchVolumes,
  fetchContainers,
  removeVolume,
}                              from "../../../agent-client.ts";
import type {
  VolumeSummary,
  ContainerSummary,
}                              from "../../../agent-client.ts";
import { Spinner }             from "../../../components/Spinner.tsx";
import { Divider }             from "../../../components/Divider.tsx";
import { KeyHints }            from "../../../components/KeyHint.tsx";
import type { UnaxisEnvironment } from "../../../environment-store.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function stackLabel(v: VolumeSummary): string {
  return v.Labels?.["com.docker.compose.project"] ?? "";
}

/** Build the set of volume names that are mounted by at least one container. */
function usedVolumeNames(containers: ContainerSummary[]): Set<string> {
  const used = new Set<string>();
  for (const c of containers) {
    for (const m of c.Mounts ?? []) {
      if (m.Type === "volume" && m.Name) used.add(m.Name);
    }
  }
  return used;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VolumesView({
  env,
  onBack,
}: {
  env:    UnaxisEnvironment;
  onBack: () => void;
}) {
  const [volumes,    setVolumes]    = useState<VolumeSummary[]>([]);
  const [usedNames,  setUsedNames]  = useState<Set<string>>(new Set());
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [selected,   setSelected]   = useState(0);
  const [status,     setStatus]     = useState<string | null>(null);
  const [acting,     setActing]     = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [vols, containers] = await Promise.all([
      fetchVolumes(env),
      fetchContainers(env),
    ]);
    setLoading(false);
    if (vols) {
      setVolumes(vols);
      setSelected((s) => Math.min(s, Math.max(0, vols.length - 1)));
    } else {
      setError("Failed to fetch volumes from agent.");
    }
    if (containers) {
      setUsedNames(usedVolumeNames(containers));
    }
  }, [env]);

  useEffect(() => { load(); }, [load]);

  const armConfirm = useCallback(() => {
    setConfirmDel(true);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDel(false), 2000);
  }, []);

  const doDelete = useCallback(async () => {
    const v = volumes[selected];
    if (!v) return;
    if (usedNames.has(v.Name)) {
      setStatus("Volume is in use — cannot remove.");
      return;
    }
    if (!confirmDel) { armConfirm(); setStatus("Press [d] again to confirm delete"); return; }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmDel(false);
    setActing(true);
    setStatus(`removing ${v.Name}…`);
    const ok = await removeVolume(env, v.Name);
    setStatus(ok ? "volume removed" : "remove failed");
    setActing(false);
    await load();
  }, [volumes, selected, env, usedNames, confirmDel, armConfirm, load]);

  useInput((input, key) => {
    if (acting) return;
    if (key.leftArrow || input === "q") { onBack(); return; }
    if (key.upArrow   || input === "k") { setSelected((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(volumes.length - 1, s + 1));
      return;
    }
    if (input === "R") { load(); return; }
    if (input === "d") { doDelete(); return; }
  });

  const hints = [
    { k: "↑↓/jk", label: "scroll" },
    { k: "d",      label: confirmDel ? "confirm delete!" : "remove unused" },
    { k: "R",      label: "refresh" },
    { k: "q/←",   label: "back" },
  ];

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} gap={0}>
      {/* Header */}
      <Box gap={2} alignItems="center">
        <Text bold color="cyan">Volumes</Text>
        <Box borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold color="white">{volumes.length}</Text>
        </Box>
        <Text dimColor>on {env.name}</Text>
        {status && <Text color={confirmDel ? "yellow" : "cyan"}>{status}</Text>}
        {acting  && <Spinner />}
      </Box>

      <Divider />

      {loading && (
        <Box gap={1} paddingX={1}>
          <Spinner />
          <Text color="yellow">Loading volumes…</Text>
        </Box>
      )}
      {error && !loading && <Text color="red">{error}</Text>}
      {!loading && !error && volumes.length === 0 && (
        <Text dimColor>No volumes found.</Text>
      )}

      {!loading && volumes.map((v, i) => {
        const isSel  = i === selected;
        const isUsed = usedNames.has(v.Name);
        const stack  = stackLabel(v);
        return (
          <Box key={v.Name} gap={1} paddingX={isSel ? 0 : 1} flexDirection="row">
            {isSel && <Text color="cyan">▶</Text>}
            {!isUsed && <Text dimColor>[Unused]</Text>}
            <Text bold={isSel} color={isSel ? "cyan" : "white"}>
              {trunc(v.Name, 30)}
            </Text>
            {stack && <Text dimColor>{trunc(stack, 20)}</Text>}
            <Text dimColor>{v.Driver}</Text>
            <Text dimColor>{trunc(v.Mountpoint, 30)}</Text>
          </Box>
        );
      })}

      <KeyHints hints={hints} />
    </Box>
  );
}
