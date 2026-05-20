// src/ink/panels/Env/views/ContainersView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Scrollable, keyboard-driven container list with lifecycle actions.
//
// Keyboard:
//   ↑↓/jk     scroll
//   s          stop selected
//   t          start selected
//   r          restart selected
//   k          kill selected
//   d          delete (confirm first — press d again within 2 s)
//   R          refresh
//   q/←        back
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Box, Text, useInput }                              from "ink";

import {
  fetchContainers,
  containerAction,
  removeContainer,
}                            from "../../../agent-client.ts";
import type { ContainerSummary } from "../../../agent-client.ts";
import { Spinner }           from "../../../components/Spinner.tsx";
import { Divider }           from "../../../components/Divider.tsx";
import { KeyHints }          from "../../../components/KeyHint.tsx";
import type { UnaxisEnvironment } from "../../../environment-store.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function containerName(c: ContainerSummary): string {
  const raw = c.Names[0] ?? c.Id.slice(0, 12);
  return raw.startsWith("/") ? raw.slice(1) : raw;
}

function stackLabel(c: ContainerSummary): string {
  return c.Labels["com.docker.compose.project"] ?? "";
}

type BadgeColor = "green" | "yellow" | "red" | "gray";

function stateBadge(c: ContainerSummary): { dot: string; color: BadgeColor; bold: boolean } {
  const health = (c.Labels["com.docker.healthcheck.status"] ?? "").toLowerCase();
  switch (c.State.toLowerCase()) {
    case "running":
      if (health === "healthy")   return { dot: "●", color: "green",  bold: true  };
      if (health === "unhealthy") return { dot: "●", color: "red",    bold: true  };
      return                             { dot: "●", color: "green",  bold: false };
    case "paused":      return { dot: "●", color: "yellow", bold: false };
    case "restarting":  return { dot: "●", color: "yellow", bold: false };
    case "exited":
    case "stopped":
    case "dead":        return { dot: "●", color: "red",    bold: false };
    default:            return { dot: "●", color: "gray",   bold: false };
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContainersView({
  env,
  onBack,
}: {
  env:    UnaxisEnvironment;
  onBack: () => void;
}) {
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
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
    const data = await fetchContainers(env);
    setLoading(false);
    if (data) {
      setContainers(data);
      setSelected((s) => Math.min(s, Math.max(0, data.length - 1)));
    } else {
      setError("Failed to fetch containers from agent.");
    }
  }, [env]);

  useEffect(() => { load(); }, [load]);

  // Clear confirm-delete flag after 2 s
  const armConfirm = useCallback(() => {
    setConfirmDel(true);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirmDel(false), 2000);
  }, []);

  const doAction = useCallback(async (action: "start" | "stop" | "restart" | "kill") => {
    const c = containers[selected];
    if (!c) return;
    setActing(true);
    setStatus(`${action}ing ${containerName(c)}…`);
    const ok = await containerAction(env, c.Id, action);
    setStatus(ok ? `${action} sent` : `${action} failed`);
    setActing(false);
    await load();
  }, [containers, selected, env, load]);

  const doDelete = useCallback(async () => {
    const c = containers[selected];
    if (!c) return;
    if (!confirmDel) { armConfirm(); setStatus("Press [d] again to confirm delete"); return; }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    setConfirmDel(false);
    setActing(true);
    setStatus(`removing ${containerName(c)}…`);
    const ok = await removeContainer(env, c.Id, true);
    setStatus(ok ? "container removed" : "remove failed");
    setActing(false);
    await load();
  }, [containers, selected, env, confirmDel, armConfirm, load]);

  useInput((input, key) => {
    if (acting) return;
    if (key.leftArrow || input === "q") { onBack(); return; }
    if (key.upArrow   || input === "k") { setSelected((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(containers.length - 1, s + 1));
      return;
    }
    if (input === "R") { load(); return; }
    if (input === "s") { doAction("stop");    return; }
    if (input === "t") { doAction("start");   return; }
    if (input === "r") { doAction("restart"); return; }
    if (input === "k") { doAction("kill");    return; }
    if (input === "d") { doDelete();          return; }
  });

  const hints = [
    { k: "↑↓/jk", label: "scroll" },
    { k: "t/s/r/k", label: "start/stop/restart/kill" },
    { k: "d", label: confirmDel ? "confirm delete!" : "delete" },
    { k: "R", label: "refresh" },
    { k: "q/←", label: "back" },
  ];

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} gap={0}>
      {/* Header */}
      <Box gap={2} alignItems="center" marginBottom={0}>
        <Text bold color="cyan">Containers</Text>
        <Box borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold color="white">{containers.length}</Text>
        </Box>
        <Text dimColor>on {env.name}</Text>
        {status && <Text color={confirmDel ? "yellow" : "cyan"}>{status}</Text>}
        {acting  && <Spinner />}
      </Box>

      <Divider />

      {/* Body */}
      {loading && (
        <Box gap={1} paddingX={1}>
          <Spinner />
          <Text color="yellow">Loading containers…</Text>
        </Box>
      )}
      {error && !loading && <Text color="red">{error}</Text>}

      {!loading && !error && containers.length === 0 && (
        <Text dimColor>No containers found.</Text>
      )}

      {!loading && containers.map((c, i) => {
        const badge = stateBadge(c);
        const isSel = i === selected;
        const stack = stackLabel(c);
        return (
          <Box key={c.Id} gap={1} paddingX={isSel ? 0 : 1}>
            {isSel && <Text color="cyan">▶</Text>}
            <Text color={badge.color} bold={badge.bold}>{badge.dot}</Text>
            <Text
              bold={isSel}
              color={isSel ? "cyan" : "white"}
            >
              {trunc(containerName(c), 30)}
            </Text>
            {stack && <Text dimColor>{trunc(stack, 20)}</Text>}
            <Text dimColor>{trunc(c.Image, 35)}</Text>
          </Box>
        );
      })}

      <KeyHints hints={hints} />
    </Box>
  );
}
