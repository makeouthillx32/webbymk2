// src/ink/components/ReleaseOverlay.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Self-contained release overlay for the StartupScreen.
//
// Spawns `bun release.ts --publish` from src/ink and streams log lines inline.
// No runOpQueued needed — release is a standalone bun script.
//
// Usage:
//   <ReleaseOverlay onClose={() => setOverlay("none")} />
//
// Keyboard:
//   q / esc   close (only after process exits or during idle)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useState, useRef, useCallback } from "../reactRuntime.js";
import { Box, Text, useInput }                             from "../runtimeInk.js";
import { spawn }                                           from "child_process";
import { join }                                            from "path";
import { resolveRuntimeProjectRoot }                       from "../../utils/runtimeEnv.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const BRAND  = "#D4A27F";
const MAX_VISIBLE_LINES = 18;

// ── Props ──────────────────────────────────────────────────────────────────────

interface ReleaseOverlayProps {
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReleaseOverlay({ onClose }: ReleaseOverlayProps) {
  const [lines,   setLines]   = useState<string[]>([]);
  const [status,  setStatus]  = useState<"running" | "done" | "error" | "no-root">("running");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const started = useRef(false);

  // ── Spawn release script on mount ─────────────────────────────────────────
  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const root = resolveRuntimeProjectRoot();
    if (!root) {
      setStatus("no-root");
      return;
    }

    const inkDir    = join(root, "src", "ink");
    const scriptPath = join(inkDir, "release.ts");

    const child = spawn(process.execPath, [scriptPath, "--publish"], {
      cwd:   inkDir,
      env:   { ...process.env, FORCE_COLOR: "0" },
      shell: false,
    });

    const pushLines = (data: Buffer) => {
      const incoming = data.toString().split(/\r?\n/).filter(Boolean);
      if (incoming.length === 0) return;
      setLines((prev) => [...prev, ...incoming]);
    };

    child.stdout.on("data", pushLines);
    child.stderr.on("data", pushLines);

    child.on("error", (err) => {
      setLines((prev) => [...prev, `✗ spawn error: ${err.message}`]);
      setStatus("error");
      setExitCode(1);
    });

    child.on("close", (code) => {
      setExitCode(code ?? 0);
      setStatus(code === 0 ? "done" : "error");
    });

    return () => {
      // If component unmounts mid-run (user force-closes), kill the process
      try { child.kill(); } catch { /* already exited */ }
    };
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useInput((input, key) => {
    // Allow closing after the process finishes, or immediately if no-root
    if (status === "done" || status === "error" || status === "no-root") {
      if (input === "q" || key.escape) {
        onClose();
      }
    }
  });

  // ── Derived display values ─────────────────────────────────────────────────
  const visibleLines = lines.slice(-MAX_VISIBLE_LINES);

  const statusChip = (() => {
    switch (status) {
      case "running":  return { text: "⟳  running…", color: "yellow" };
      case "done":     return { text: "✓  released", color: "green"  };
      case "error":    return { text: `✗  failed  (exit ${exitCode ?? "?"})`, color: "red" };
      case "no-root":  return { text: "✗  project root not found", color: "red" };
    }
  })();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={status === "done" ? "green" : status === "error" || status === "no-root" ? "red" : BRAND}
      paddingX={3}
      paddingY={1}
      minWidth={64}
    >
      {/* Header */}
      <Box marginBottom={1} gap={2} alignItems="center">
        <Text bold color={BRAND}>✻  Release UNAXIS</Text>
        <Text dimColor>bun release.ts --publish</Text>
      </Box>

      {/* Status chip */}
      <Box marginBottom={1}>
        <Text bold color={statusChip.color}>{statusChip.text}</Text>
      </Box>

      {/* no-root message */}
      {status === "no-root" && (
        <Box flexDirection="column" marginBottom={1}>
          <Text dimColor>Could not locate the project root.</Text>
          <Text dimColor>Set UNAXIS_PROJECT_ROOT or run from inside the repo.</Text>
        </Box>
      )}

      {/* Log lines */}
      {visibleLines.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          paddingY={0}
          marginBottom={1}
        >
          {lines.length > MAX_VISIBLE_LINES && (
            <Text dimColor>… {lines.length - MAX_VISIBLE_LINES} earlier lines hidden</Text>
          )}
          {visibleLines.map((line, i) => (
            <Text key={i} dimColor={status === "running"}>{line}</Text>
          ))}
        </Box>
      )}

      {/* Close hint — only shown when closeable */}
      {status !== "running" && (
        <Box>
          <Text dimColor>q / esc  close</Text>
        </Box>
      )}
    </Box>
  );
}
