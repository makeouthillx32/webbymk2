// src/ink/panels/Env/views/StacksView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Stack list derived by grouping containers on com.docker.compose.project.
//
// Keyboard:
//   ↑↓/jk     scroll
//   Enter      drill-in (shows filtered container list for that stack)
//   R          refresh
//   q/←        back (or back from drill-in)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput }                     from "ink";

import { fetchContainers }          from "../../../agent-client.ts";
import type { ContainerSummary }    from "../../../agent-client.ts";
import { Spinner }                  from "../../../components/Spinner.tsx";
import { Divider }                  from "../../../components/Divider.tsx";
import { KeyHints }                 from "../../../components/KeyHint.tsx";
import type { UnaxisEnvironment }   from "../../../environment-store.ts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StackInfo {
  name:       string;
  total:      number;
  running:    number;
  stopped:    number;
  containers: ContainerSummary[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function deriveStacks(containers: ContainerSummary[]): StackInfo[] {
  const map = new Map<string, ContainerSummary[]>();
  for (const c of containers) {
    const project = c.Labels["com.docker.compose.project"] ?? "__standalone__";
    if (!map.has(project)) map.set(project, []);
    map.get(project)!.push(c);
  }
  const stacks: StackInfo[] = [];
  for (const [name, cs] of map) {
    const running = cs.filter((c) => c.State === "running").length;
    stacks.push({ name, total: cs.length, running, stopped: cs.length - running, containers: cs });
  }
  return stacks.sort((a, b) => a.name.localeCompare(b.name));
}

function stackStatus(s: StackInfo): { label: string; color: "green" | "yellow" | "red" } {
  if (s.running === s.total) return { label: "Total",   color: "green"  };
  if (s.running === 0)       return { label: "Stopped", color: "red"    };
  return                            { label: "Limited", color: "yellow" };
}

function containerName(c: ContainerSummary): string {
  const raw = c.Names[0] ?? c.Id.slice(0, 12);
  return raw.startsWith("/") ? raw.slice(1) : raw;
}

// ── Drill-in: filtered container list for a stack ─────────────────────────────

function StackContainersView({
  stack,
  onBack,
}: {
  stack:  StackInfo;
  onBack: () => void;
}) {
  const [sel, setSel] = useState(0);

  useInput((input, key) => {
    if (key.leftArrow || input === "q") { onBack(); return; }
    if (key.upArrow   || input === "k") { setSel((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow || input === "j") {
      setSel((s) => Math.min(stack.containers.length - 1, s + 1));
      return;
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} gap={0}>
      <Box gap={2} alignItems="center">
        <Text bold color="cyan">{stack.name}</Text>
        <Box borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold>{stack.total}</Text>
        </Box>
        <Text color="green">{stack.running} running</Text>
        <Text color="red">{stack.stopped} stopped</Text>
      </Box>
      <Divider />
      {stack.containers.map((c, i) => {
        const isSel = i === sel;
        const state = c.State.toLowerCase();
        const color = state === "running" ? "green" : state === "paused" ? "yellow" : "red";
        return (
          <Box key={c.Id} gap={1} paddingX={isSel ? 0 : 1}>
            {isSel && <Text color="cyan">▶</Text>}
            <Text color={color}>●</Text>
            <Text bold={isSel} color={isSel ? "cyan" : "white"}>
              {trunc(containerName(c), 35)}
            </Text>
            <Text dimColor>{trunc(c.Image, 30)}</Text>
          </Box>
        );
      })}
      <KeyHints hints={[{ k: "↑↓/jk", label: "scroll" }, { k: "q/←", label: "back" }]} />
    </Box>
  );
}

// ── Main StacksView ───────────────────────────────────────────────────────────

export function StacksView({
  env,
  onBack,
}: {
  env:    UnaxisEnvironment;
  onBack: () => void;
}) {
  const [stacks,   setStacks]   = useState<StackInfo[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [drillIn,  setDrillIn]  = useState<StackInfo | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const data = await fetchContainers(env);
    setLoading(false);
    if (data) {
      const derived = deriveStacks(data);
      setStacks(derived);
      setSelected((s) => Math.min(s, Math.max(0, derived.length - 1)));
    } else {
      setError("Failed to fetch containers from agent.");
    }
  }, [env]);

  useEffect(() => { load(); }, [load]);

  useInput((input, key) => {
    if (drillIn) return; // drill-in handles its own input
    if (key.leftArrow || input === "q") { onBack(); return; }
    if (key.upArrow   || input === "k") { setSelected((s) => Math.max(0, s - 1)); return; }
    if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(stacks.length - 1, s + 1));
      return;
    }
    if (key.return) {
      const s = stacks[selected];
      if (s) setDrillIn(s);
      return;
    }
    if (input === "R") { load(); return; }
  });

  if (drillIn) {
    return <StackContainersView stack={drillIn} onBack={() => setDrillIn(null)} />;
  }

  const hints = [
    { k: "↑↓/jk", label: "scroll" },
    { k: "Enter",  label: "drill in" },
    { k: "R",      label: "refresh" },
    { k: "q/←",   label: "back" },
  ];

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} gap={0}>
      <Box gap={2} alignItems="center">
        <Text bold color="cyan">Stacks</Text>
        <Box borderStyle="round" borderColor="gray" paddingX={1}>
          <Text bold color="white">{stacks.length}</Text>
        </Box>
        <Text dimColor>on {env.name}</Text>
      </Box>

      <Divider />

      {loading && (
        <Box gap={1} paddingX={1}>
          <Spinner />
          <Text color="yellow">Loading stacks…</Text>
        </Box>
      )}
      {error && !loading && <Text color="red">{error}</Text>}
      {!loading && !error && stacks.length === 0 && (
        <Text dimColor>No stacks found.</Text>
      )}

      {!loading && stacks.map((s, i) => {
        const isSel = i === selected;
        const st    = stackStatus(s);
        return (
          <Box key={s.name} gap={2} paddingX={isSel ? 0 : 1}>
            {isSel && <Text color="cyan">▶</Text>}
            <Text bold={isSel} color={isSel ? "cyan" : "white"}>
              {trunc(s.name, 30)}
            </Text>
            <Text color={st.color} dimColor={!isSel}>{st.label}</Text>
            <Text dimColor>{s.total} containers</Text>
            <Text color="green" dimColor>{s.running} up</Text>
            {s.stopped > 0 && <Text color="red" dimColor>{s.stopped} down</Text>}
          </Box>
        );
      })}

      <KeyHints hints={hints} />
    </Box>
  );
}
