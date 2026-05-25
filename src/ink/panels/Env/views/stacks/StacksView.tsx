// src/ink/panels/Env/views/stacks/StacksView.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Docker Compose stack view for an environment.
// Mirrors: Portainer stackController.js
//
// Keyboard:
//   [↑↓/jk]  navigate stacks / containers
//   [Enter]   drill into selected stack containers
//   [a]       add / deploy new stack
//   [r]       refresh
//   [q/←]     back
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput } from "../../../../runtimeInk.js";

import { fetchContainers, type ContainerSummary } from "../../../../agent-client.ts";
import { Divider } from "../../../../components/Divider.tsx";
import { KeyHints } from "../../../../components/KeyHint.tsx";
import { Spinner } from "../../../../components/Spinner.tsx";
import { useTermHeight } from "../../../../hooks/useTermWidth.ts";
import type { UnaxisEnvironment } from "../../../../environment-store.ts";
import { CreateStackView } from "./stacks.create.tsx";

interface StacksViewProps {
  env:    UnaxisEnvironment;
  onBack: () => void;
}

type StackControl = "Total" | "Limited" | "Orphaned";

interface StackGroup {
  key:        string;
  name:       string;
  containers: ContainerSummary[];
  running:    number;
  stopped:    number;
  control:    StackControl;
}

const LIST_HINTS = [
  { k: "↑↓/jk", label: "navigate" },
  { k: "a",     label: "add stack" },
  { k: "Enter", label: "open stack" },
  { k: "r",     label: "refresh" },
  { k: "q/←",   label: "back" },
];

const DETAIL_HINTS = [
  { k: "↑↓/jk", label: "navigate containers" },
  { k: "r",     label: "refresh" },
  { k: "q/←",   label: "back to stacks" },
];

function truncate(text: string, max = 30): string {
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function containerName(container: ContainerSummary): string {
  const raw = container.Names?.[0] ?? container.Id;
  return raw.replace(/^\//, "");
}

function stackKey(container: ContainerSummary): string {
  return container.Labels?.["com.docker.compose.project"] || "";
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

function windowSlice<T>(items: T[], selected: number, size: number): { start: number; end: number; rows: T[] } {
  if (items.length <= size) {
    return { start: 0, end: items.length, rows: items };
  }
  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(selected - half, items.length - size));
  const end = Math.min(items.length, start + size);
  return { start, end, rows: items.slice(start, end) };
}

function buildStacks(containers: ContainerSummary[]): StackGroup[] {
  const groups = new Map<string, ContainerSummary[]>();

  for (const container of containers) {
    const key = stackKey(container) || "orphaned";
    const list = groups.get(key) ?? [];
    list.push(container);
    groups.set(key, list);
  }

  const stacks: StackGroup[] = [];
  for (const [key, list] of groups.entries()) {
    const name = key === "orphaned" ? "Orphaned" : key;
    const running = list.filter((c) => c.State === "running").length;
    const stopped = list.length - running;
    const control: StackControl = key === "orphaned"
      ? "Orphaned"
      : stopped > 0
        ? "Limited"
        : "Total";

    stacks.push({ key, name, containers: list, running, stopped, control });
  }

  return stacks.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

export function StacksView({ env, onBack }: StacksViewProps) {
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [mode, setMode] = useState<"stacks" | "detail">("stacks");
  const [selected, setSelected] = useState(0);
  const [detailSelected, setDetailSelected] = useState(0);
  const [showCreate, setShowCreate] = useState(false);

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

    const list = await fetchContainers(env);
    if (!list) {
      setContainers([]);
      setError("Failed to fetch containers from the agent.");
    } else {
      const sorted = [...list].sort((a, b) => {
        const stackA = (stackKey(a) || "Orphaned").toLowerCase();
        const stackB = (stackKey(b) || "Orphaned").toLowerCase();
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

  const stacks = useMemo(() => buildStacks(containers), [containers]);
  const selectedStack = stacks[selected] ?? null;
  const detailContainers = selectedStack?.containers ?? [];

  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, stacks.length - 1)));
  }, [stacks.length]);

  useEffect(() => {
    setDetailSelected((current) => Math.min(current, Math.max(0, detailContainers.length - 1)));
  }, [detailContainers.length]);

  const visibleStacks = useMemo(
    () => windowSlice(stacks, selected, listSize),
    [listSize, selected, stacks],
  );
  const visibleContainers = useMemo(
    () => windowSlice(detailContainers, detailSelected, listSize),
    [detailContainers, detailSelected, listSize],
  );

  const selectedStackTone = selectedStack ? (selectedStack.control === "Total"
    ? { color: "green", bold: true }
    : selectedStack.control === "Limited"
      ? { color: "yellow", bold: true }
      : { color: "gray", bold: false }) : null;

  useInput((input, key) => {
    if (showCreate) return;

    if (key.escape || input === "q" || key.leftArrow) {
      if (mode === "detail") {
        setMode("stacks");
        setStatus(null);
        return;
      }
      onBack();
      return;
    }

    if (input === "r") { void refresh(); return; }

    if (mode === "stacks") {
      if (input === "a") { setShowCreate(true); return; }
      if (key.upArrow || input === "k") {
        setSelected((value) => Math.max(0, value - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelected((value) => Math.min(Math.max(0, stacks.length - 1), value + 1));
        return;
      }
      if (key.return && selectedStack) {
        setMode("detail");
        setDetailSelected(0);
        setStatus(`Showing containers for ${selectedStack.name}`);
        return;
      }
      return;
    }

    if (mode === "detail") {
      if (key.upArrow || input === "k") {
        setDetailSelected((value) => Math.max(0, value - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setDetailSelected((value) => Math.min(Math.max(0, detailContainers.length - 1), value + 1));
        return;
      }
    }
  });

  if (showCreate) {
    return (
      <CreateStackView
        env={env}
        onDone={(deployed) => {
          setShowCreate(false);
          if (deployed) {
            setStatus("✓ Stack deployed");
            void refresh();
          }
        }}
      />
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box paddingX={1} gap={2} marginBottom={0}>
        <Text bold color="cyan">Stacks</Text>
        <Text dimColor>{env.name}</Text>
        <Text dimColor>• {stacks.length} stacks</Text>
        <Text color="green">{containers.filter((c) => c.State === "running").length} running containers</Text>
      </Box>

      <Divider />

      {loading && (
        <Box paddingX={1} marginTop={1}>
          <Spinner message="Loading stacks…" />
        </Box>
      )}

      {!loading && error && (
        <Box paddingX={1} marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {!loading && !error && stacks.length === 0 && (
        <Box paddingX={1} marginTop={1}>
          <Text dimColor>No stacks found.  Press [a] to deploy one.</Text>
        </Box>
      )}

      {!loading && !error && stacks.length > 0 && mode === "stacks" && (
        <Box flexDirection="column" gap={0}>
          <Box paddingX={1} marginTop={1} marginBottom={0} gap={2}>
            <Box width={3}><Text dimColor> </Text></Box>
            <Box width={26}><Text dimColor>Stack</Text></Box>
            <Box width={18}><Text dimColor>Containers</Text></Box>
            <Box width={18}><Text dimColor>Running</Text></Box>
            <Box flexGrow={1}><Text dimColor>Control</Text></Box>
          </Box>

          {visibleStacks.start > 0 && (
            <Box paddingX={1}><Text dimColor>↑ {visibleStacks.start} more</Text></Box>
          )}

          {visibleStacks.rows.map((stack, idx) => {
            const actualIndex = visibleStacks.start + idx;
            const selectedRow = actualIndex === selected;
            const tone = stack.control === "Total"
              ? { color: "green", bold: false }
              : stack.control === "Limited"
                ? { color: "yellow", bold: true }
                : { color: "gray", bold: false };

            return (
              <Box key={stack.key} paddingX={1} gap={2}>
                <Box width={3}>
                  <Text color={tone.color} bold={selectedRow || tone.bold}>{selectedRow ? "▶" : "●"}</Text>
                </Box>
                <Box width={26}>
                  <Text color={selectedRow ? "cyan" : undefined} bold={selectedRow}>
                    {truncate(stack.name, 24)}
                  </Text>
                </Box>
                <Box width={18}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {stack.containers.length}
                  </Text>
                </Box>
                <Box width={18}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {stack.running} running / {stack.stopped} stopped
                  </Text>
                </Box>
                <Box flexGrow={1}>
                  <Text color={selectedRow ? "cyan" : tone.color} bold={selectedRow || tone.bold}>
                    {stack.control}
                  </Text>
                </Box>
              </Box>
            );
          })}

          {visibleStacks.end < stacks.length && (
            <Box paddingX={1}><Text dimColor>↓ {stacks.length - visibleStacks.end} more</Text></Box>
          )}
        </Box>
      )}

      {!loading && !error && stacks.length > 0 && mode === "detail" && selectedStack && (
        <Box flexDirection="column" gap={0}>
          <Box paddingX={1} marginTop={1} marginBottom={0} gap={2}>
            <Box width={3}><Text dimColor> </Text></Box>
            <Box width={26}><Text dimColor>Container</Text></Box>
            <Box width={22}><Text dimColor>Image</Text></Box>
            <Box flexGrow={1}><Text dimColor>Status</Text></Box>
          </Box>

          <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="gray"
            paddingX={2}
            paddingY={1}
            marginTop={1}
            marginBottom={1}
          >
            <Box gap={2}>
              <Text bold color="cyan">{selectedStack.name}</Text>
              {selectedStackTone && (
                <Text color={selectedStackTone.color} bold={selectedStackTone.bold}>
                  {selectedStack.control}
                </Text>
              )}
              <Text dimColor>
                {selectedStack.containers.length} containers · {selectedStack.running} running · {selectedStack.stopped} stopped
              </Text>
            </Box>
          </Box>

          {visibleContainers.start > 0 && (
            <Box paddingX={1}><Text dimColor>↑ {visibleContainers.start} more</Text></Box>
          )}

          {visibleContainers.rows.map((container, idx) => {
            const actualIndex = visibleContainers.start + idx;
            const selectedRow = actualIndex === detailSelected;
            const tone = stateTone(container);
            const cName = containerName(container);
            const image = displayImage(container);

            return (
              <Box key={container.Id} paddingX={1} gap={2}>
                <Box width={3}>
                  <Text color={tone.color} bold={tone.bold}>{selectedRow ? "▶" : "●"}</Text>
                </Box>
                <Box width={26}>
                  <Text color={selectedRow ? "cyan" : undefined} bold={selectedRow}>
                    {truncate(cName, 24)}
                  </Text>
                </Box>
                <Box width={22}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {truncate(image, 20)}
                  </Text>
                </Box>
                <Box flexGrow={1}>
                  <Text dimColor={!selectedRow} color={selectedRow ? "gray" : undefined}>
                    {truncate(container.Status, 50)}
                  </Text>
                </Box>
              </Box>
            );
          })}

          {visibleContainers.end < detailContainers.length && (
            <Box paddingX={1}><Text dimColor>↓ {detailContainers.length - visibleContainers.end} more</Text></Box>
          )}
        </Box>
      )}

      {status && (
        <Box paddingX={1} marginTop={1}>
          <Text dimColor>{status}</Text>
        </Box>
      )}

      <KeyHints hints={mode === "detail" ? DETAIL_HINTS : LIST_HINTS} />
    </Box>
  );
}
