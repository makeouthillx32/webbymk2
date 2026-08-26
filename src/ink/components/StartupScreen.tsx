// src/ink/components/StartupScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Global startup splash + project picker coordinator.
//
// Phases:
//   "animating"  ✻ hue sweeps 2 rotations; UNAXIS shimmers; spinner ticks
//   "picking"    animation settles → project list appears below the wordmark
//                user selects a project → onDone() fires → project welcome screen
//
// Dynamic Overlays (under "picking" phase):
//   • "key"       PairingKeyOverlay         (invoked with capital K)
//   • "wizard"    NewProjectWizard          (invoked via "Create new project…" list item)
//   • "release"   ReleaseOverlay            (invoked with capital R in dev/bun mode)
//   • "instances" RuntimeInstancesOverlay   (invoked with capital I)
//
// ─────────────────────────────────────────────────────────────────────────────

import React, { useContext, useEffect, useState, useCallback } from "react";
import { Box, Text, useInput }                            from "../runtimeInk.js";
import StdinContext                                        from "./StdinContext.js";
import {
  getKnownProjects,
  ensureCurrentProjectRegistered,
  type KnownProject,
} from "../../utils/projectRegistry.js";
import { PROJECT_DIR } from "../../config/stack.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { StartupSplash }     from "./StartupSplash.tsx";
import { PairingKeyOverlay } from "./PairingKeyOverlay.tsx";
import { NewProjectWizard }  from "./NewProjectWizard.tsx";
import { ReleaseOverlay }              from "./ReleaseOverlay.tsx";
import { RuntimeInstancesOverlay }    from "./RuntimeInstancesOverlay.tsx";
import { spawn }                from "child_process";
import { gracefulShutdownSync } from "../../utils/gracefulShutdown.js";

// Dev mode = bun --watch; Production = node running dist/cli.js
const isProductionMode = !process.execPath.toLowerCase().includes("bun");
const SETTLE_MS = 180;

// Version injected at build time via bun define; falls back to "dev" in watch mode
declare const UNAXIS_VERSION: string;
const VERSION = ((): string => {
  try { return UNAXIS_VERSION; } catch { return "dev"; }
})();

function selfRestart(): void {
  const child = spawn(process.execPath, process.argv.slice(1), {
    stdio:    "inherit",
    detached: true,
    cwd:      process.cwd(),
    env:      { ...process.env, UNAXIS_RESTARTED: "1" },
  });
  child.unref();
  gracefulShutdownSync(0);
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TEARDROP     = "✻";
const TITLE        = "UNAXIS";
const SETTLED_GREY = "#999999";

const ITERM2_PROGRESS_START = "\x1b]9;4;1\x07";
const ITERM2_PROGRESS_STOP  = "\x1b]9;4;0\x07";

// ── Color palette (picker phase) ───────────────────────────────────────────────

const ACTIVE  = "cyanBright";
const DIM     = "gray";

// ── Stub sentinel ──────────────────────────────────────────────────────────────

const CREATE_NEW_SLUG = "__create_new__";

type PickerItem =
  | KnownProject
  | { slug: typeof CREATE_NEW_SLUG; path: ""; name: "Create new project…" };

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  onDone:   () => void;
  onQuit:   () => void;
  /** Skip animation + picker (CI / no-splash mode). */
  instant?: boolean;
  /** Active background ops (from useBackgroundOps). Surfaced on the picker so
   *  agent/IPC activity is visible even before a project is selected — the ops
   *  UI proper is gated on splashDone, so without this the picker is blind to
   *  running builds/deploys. See [[Brain/unaxis-ops-stack-lifecycle]]. */
  bgOps?: { title: string; busy: boolean }[];
}

// ── Coordinator Component ──────────────────────────────────────────────────────

export function StartupScreen({ onDone, onQuit, instant = false, bgOps }: Props) {
  const { stdout } = useContext(StdinContext);
  const { columns } = useTerminalSize();
  // ── Coordinator States ─────────────────────────────────────────────────────
  type Phase = "animating" | "settling" | "picking";
  type Overlay = "none" | "key" | "wizard" | "release" | "instances";

  const [phase, setPhase]     = useState<Phase>("animating");
  const [overlay, setOverlay] = useState<Overlay>("none");

  // ── Picker States ──────────────────────────────────────────────────────────
  const [items, setItems]           = useState<PickerItem[]>([]);
  const [selected, setSelected]     = useState(0);
  const [pickerLoading, setPickerLoading] = useState(true);
  const showProjectPaths = columns >= 96;

  // ── iTerm2 progress bar integration ────────────────────────────────────────
  useEffect(() => {
    if (instant) return;
    if (stdout.isTTY) {
      try { stdout.write(ITERM2_PROGRESS_START); } catch { /* ignore */ }
    }
    return () => {
      if (stdout.isTTY) {
        try { stdout.write(ITERM2_PROGRESS_STOP); } catch { /* ignore */ }
      }
    };
  }, [instant, stdout]);

  // ── Instant mode bypass ────────────────────────────────────────────────────
  useEffect(() => {
    if (instant) onDone();
  }, [instant, onDone]);

  // ── Load projects function ─────────────────────────────────────────────────
  const loadProjects = useCallback(async (selectPath = PROJECT_DIR) => {
    setPickerLoading(true);
    await ensureCurrentProjectRegistered(PROJECT_DIR);
    const known = await getKnownProjects();
    const list: PickerItem[] = [
      ...known,
      { slug: CREATE_NEW_SLUG, path: "", name: "Create new project…" } as any,
    ];
    setItems(list);

    // Pre-select the matching path
    const idx = known.findIndex((p) => p.path === selectPath);
    setSelected(idx >= 0 ? idx : 0);
    setPickerLoading(false);
  }, []);

  // ── Load projects when phase flips to picking ──────────────────────────────
  useEffect(() => {
    if (phase !== "settling") return;
    const id = setTimeout(() => setPhase("picking"), SETTLE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "picking") {
      loadProjects();
    }
  }, [phase, loadProjects]);

  // ── Keyboard handling (when no overlay is active) ──────────────────────────
  useInput((input, key) => {
    if (phase !== "picking" || pickerLoading || overlay !== "none") return;

    const maxIdx = items.length - 1;

    if (key.upArrow || input === "k") {
      setSelected((s) => Math.max(0, s - 1));
      return;
    }
    if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(maxIdx, s + 1));
      return;
    }

    if (key.return || key.rightArrow) {
      const item = items[selected];
      if (!item) return;
      if (item.slug === CREATE_NEW_SLUG) {
        setOverlay("wizard");
        return;
      }
      onDone();
      return;
    }

    // K — pairing key overlay
    if (input === "K") {
      setOverlay("key");
      return;
    }

    // I — runtime instances overlay
    if (input === "I") {
      setOverlay("instances");
      return;
    }

    // R — restart production binary  /  release overlay in dev (bun) mode
    if (input === "r" || input === "R") {
      if (isProductionMode) {
        selfRestart();
      } else {
        setOverlay("release");
      }
      return;
    }

    if (input === "q" || key.escape) {
      onQuit();
      return;
    }
  });

  // ── Instant mode check ─────────────────────────────────────────────────────
  if (instant) return null;

  // ── PHASE 1: animating (Splash Animation) ──────────────────────────────────
  if (phase === "animating") {
    return <StartupSplash onComplete={() => setPhase("settling")} />;
  }

  // â”€â”€ PHASE 1.5: settling (brief handoff frame) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (phase === "settling") {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={2}>
        <Box marginBottom={1}>
          <Text color={SETTLED_GREY}>·</Text>
        </Box>
        <Box marginBottom={1}>
          <Text bold color="white">{TITLE}</Text>
        </Box>
        <Box marginBottom={1}>
          <Text color={SETTLED_GREY}>opening project picker</Text>
        </Box>
      </Box>
    );
  }

  // ── PHASE 2: picking (Project Picker & Active Overlays) ────────────────────

  // ── Overlay: Connection Pairing Key ──
  if (overlay === "key") {
    const knownProjects = items.filter((i) => i.slug !== CREATE_NEW_SLUG) as KnownProject[];
    return (
      <PairingKeyOverlay
        knownProjects={knownProjects}
        projectDir={PROJECT_DIR}
        onClose={() => setOverlay("none")}
      />
    );
  }

  // ── Overlay: Release ──
  if (overlay === "release") {
    return <ReleaseOverlay onClose={() => setOverlay("none")} />;
  }

  // ── Overlay: Runtime Instances ──
  if (overlay === "instances") {
    return <RuntimeInstancesOverlay onClose={() => setOverlay("none")} />;
  }

  // ── Overlay: New Project Wizard ──
  if (overlay === "wizard") {
    return (
      <NewProjectWizard
        onCancel={() => setOverlay("none")}
        onDone={(newProj) => {
          setOverlay("none");
          loadProjects(newProj.path); // reload and auto-select new project path!
        }}
      />
    );
  }

  // ── Standard selection list ──
  const knownProjects = items.filter((i) => i.slug !== CREATE_NEW_SLUG) as KnownProject[];
  const stubIdx       = items.length - 1;

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={2}>

      {/* ── Settled wordmark ── */}
      <Box marginBottom={1}>
        <Text color={SETTLED_GREY}>{TEARDROP}</Text>
      </Box>
      <Box marginBottom={1} gap={2} alignItems="center">
        <Text bold color="white">{TITLE}</Text>
        <Text color={SETTLED_GREY}>v{VERSION}</Text>
      </Box>
      <Box marginBottom={2} />

      {/* ── Project list ── */}
      {pickerLoading ? (
        <Box marginBottom={1}>
          <Text dimColor>Loading…</Text>
        </Box>
      ) : knownProjects.length === 0 ? (
        <Box marginBottom={1}>
          <Text dimColor>No projects registered yet.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginBottom={1}>
          {knownProjects.map((proj, i) => {
            const isCursor = selected === i;
            return (
              <Box key={proj.path || proj.slug} gap={1}>
                <Text color={isCursor ? ACTIVE : DIM}>{isCursor ? "·" : " "}</Text>
                <Text bold={isCursor} color={isCursor ? ACTIVE : "white"}>{proj.slug}</Text>
                {showProjectPaths && (
                  <Text dimColor>
                    {proj.path.replace(/\\/g, "/").replace(/^.*\/([^/]+\/[^/]+)$/, "…/$1")}
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {/* ── Create new project list option ── */}
      <Box gap={1} marginBottom={2}>
        <Text color={selected === stubIdx ? ACTIVE : DIM}>{selected === stubIdx ? "·" : " "}</Text>
        <Text bold={selected === stubIdx} color={selected === stubIdx ? ACTIVE : "white"}>
          ⊕  Create new project…
        </Text>
      </Box>

      {/* ── Active background ops (agent/IPC activity visible at the picker) ── */}
      {(() => {
        const active = (bgOps ?? []).filter((o) => o.busy);
        if (active.length === 0) return null;
        return (
          <Box flexDirection="column" alignItems="center" marginBottom={1}>
            <Text color={ACTIVE}>
              ⚡ {active.length} background op{active.length !== 1 ? "s" : ""} running
            </Text>
            {active.slice(0, 3).map((o, i) => (
              <Text key={i} color={SETTLED_GREY}>· {o.title}</Text>
            ))}
          </Box>
        );
      })()}

      {/* ── Key hints ── */}
      <Box gap={3}>
        <Text dimColor>↑↓ navigate</Text>
        <Text dimColor>↵ open</Text>
        <Text dimColor>K key</Text>
        {isProductionMode  && <Text dimColor>R restart</Text>}
        {!isProductionMode && <Text dimColor>R release</Text>}
        <Text dimColor>I instances</Text>
        <Text dimColor>q quit</Text>
      </Box>

    </Box>
  );
}
