// src/ink/panels/Env/views/containers/containers.inspect.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Container inspect overlay — scrollable JSON view.
// Mirrors: Portainer containerController.js inspectContainer()
//
// GET /containers/{id}/json
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "../../../../runtimeInk.js";

import { inspectContainer } from "../../../../agent-client.ts";
import { Divider }          from "../../../../components/Divider.tsx";
import { KeyHints }         from "../../../../components/KeyHint.tsx";
import { Spinner }          from "../../../../components/Spinner.tsx";
import { useTermHeight }    from "../../../../hooks/useTermWidth.ts";
import type { UnaxisEnvironment } from "../../../../environment-store.ts";

interface ContainerInspectViewProps {
  env:           UnaxisEnvironment;
  containerId:   string;
  containerName: string;
  onDone:        () => void;
}

export function ContainerInspectView({
  env,
  containerId,
  containerName,
  onDone,
}: ContainerInspectViewProps) {
  const [loading, setLoading] = useState(true);
  const [lines,   setLines]   = useState<string[]>([]);
  const [error,   setError]   = useState<string | null>(null);
  const [offset,  setOffset]  = useState(0);

  const termHeight = useTermHeight();
  const pageSize = Math.max(5, termHeight - 8);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      const data = await inspectContainer(env, containerId);
      setLoading(false);
      if (!data) {
        setError("Failed to inspect container.");
        return;
      }
      // Pretty-print with 2-space indent — split into scrollable lines
      setLines(JSON.stringify(data, null, 2).split("\n"));
    }
    void load();
  }, [env, containerId]);

  useInput((_input, key) => {
    if (loading) return;
    if (key.escape || _input === "q" || key.leftArrow) { onDone(); return; }
    if (key.upArrow || _input === "k") {
      setOffset((o) => Math.max(0, o - 1));
      return;
    }
    if (key.downArrow || _input === "j") {
      setOffset((o) => Math.min(Math.max(0, lines.length - pageSize), o + 1));
      return;
    }
    if (key.pageUp) {
      setOffset((o) => Math.max(0, o - pageSize));
      return;
    }
    if (key.pageDown) {
      setOffset((o) => Math.min(Math.max(0, lines.length - pageSize), o + pageSize));
      return;
    }
    if (_input === "g") { setOffset(0); return; }
    if (_input === "G") { setOffset(Math.max(0, lines.length - pageSize)); return; }
  });

  const visibleLines = lines.slice(offset, offset + pageSize);

  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      <Box paddingX={1} gap={2}>
        <Text bold color="cyan">Inspect</Text>
        <Text dimColor>{containerName}</Text>
        {!loading && lines.length > 0 && (
          <Text dimColor>{offset + 1}–{Math.min(offset + pageSize, lines.length)} / {lines.length}</Text>
        )}
      </Box>
      <Divider />

      {loading && (
        <Box paddingX={1} marginTop={1}>
          <Spinner message="Inspecting container…" />
        </Box>
      )}

      {!loading && error && (
        <Box paddingX={1} marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {!loading && !error && (
        <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingX={1} marginTop={1}>
          {visibleLines.map((line, i) => (
            <Text key={i} wrap="truncate">
              {/* Syntax-color the key names vs values */}
              {line}
            </Text>
          ))}
        </Box>
      )}

      {offset > 0 && (
        <Box paddingX={1}>
          <Text dimColor>↑ {offset} lines above</Text>
        </Box>
      )}
      {offset + pageSize < lines.length && (
        <Box paddingX={1}>
          <Text dimColor>↓ {lines.length - offset - pageSize} lines below</Text>
        </Box>
      )}

      <KeyHints hints={[
        { k: "↑↓/jk",   label: "scroll" },
        { k: "PgUp/Dn", label: "page" },
        { k: "g/G",     label: "top/bottom" },
        { k: "q/←",    label: "back" },
      ]} />
    </Box>
  );
}
