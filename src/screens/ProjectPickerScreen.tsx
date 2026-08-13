/** @jsxRuntime classic */
// src/screens/ProjectPickerScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Project picker — shown once at startup, after the splash animation, before
// the project welcome screen.
//
// Flow:
//   StartupScreen (animation) → ProjectPickerScreen → WelcomeScreen → …
//
// Keys:
//   ↑↓ / j k     navigate project list
//   ↵ / →         open selected project
//   k             generate + show a pairing key (remote connect)
//   q / Esc       quit TUI  (or close key overlay if open)
//   "Create new"  stub at the bottom — shows a "coming soon" note
//
// Pairing key overlay ([k]):
//   Generates a uaxc_ connection key encoding this machine's host IP, the
//   remote IPC bridge port (50506), a 32-byte random token, and a 24h expiry.
//   The remote machine runs:  unaxis connect <key>
//   to proxy IPC commands here as if running locally.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from "../ink/reactRuntime.js";
import { Box, Text, useInput, useApp } from "../ink/runtimeInk.js";
import {
  getKnownProjects,
  ensureCurrentProjectRegistered,
  type KnownProject,
} from "../utils/projectRegistry.js";
import { PROJECT_DIR } from "../config/stack.js";
import { STACK_IP_SAFE } from "../config/stack.js";
import {
  generatePairingKey,
  REMOTE_IPC_PORT,
  KEY_TTL_H,
} from "../utils/pairingKey.js";

// ── Color palette ─────────────────────────────────────────────────────────────

const BRAND    = "#D4A27F";
const ACTIVE   = "cyanBright";
const DIM      = "gray";
const STUB_COL = "gray";
const KEY_COL  = "greenBright";

// ── Stub sentinel ─────────────────────────────────────────────────────────────

const CREATE_NEW_SLUG = "__create_new__";

type PickerItem =
  | KnownProject
  | { slug: typeof CREATE_NEW_SLUG; path: ""; name: "Create new project…" };

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ProjectPickerScreenProps {
  /** Called when the user confirms a project. */
  onSelect: (project: KnownProject) => void;
  /** Called when user presses q. */
  onQuit: () => void;
}

// ── Pairing key overlay state ─────────────────────────────────────────────────

interface KeyOverlay {
  key:       string;
  expiresAt: Date;
  host:      string;
  slug:      string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProjectPickerScreen({ onSelect, onQuit }: ProjectPickerScreenProps) {
  const [items, setItems]           = useState<PickerItem[]>([]);
  const [selected, setSelected]     = useState(0);
  const [loading, setLoading]       = useState(true);
  const [stubFlash, setStubFlash]   = useState(false);   // "coming soon" flash
  const [keyOverlay, setKeyOverlay] = useState<KeyOverlay | null>(null);
  const [keyCopied, setKeyCopied]   = useState(false);

  // ── Load + auto-register current project ────────────────────────────────
  useEffect(() => {
    (async () => {
      await ensureCurrentProjectRegistered(PROJECT_DIR);
      const known = await getKnownProjects();
      const list: PickerItem[] = [
        ...known,
        { slug: CREATE_NEW_SLUG, path: "", name: "Create new project…" } as any,
      ];
      setItems(list);

      // Pre-select the current project
      const idx = known.findIndex((p) => p.path === PROJECT_DIR);
      setSelected(idx >= 0 ? idx : 0);

      setLoading(false);
    })();
  }, []);

  // ── Auto-advance if only one real project ────────────────────────────────
  useEffect(() => {
    const realProjects = items.filter((i) => i.slug !== CREATE_NEW_SLUG) as KnownProject[];
    if (!loading && realProjects.length === 1 && realProjects[0]) {
      onSelect(realProjects[0]);
    }
  }, [loading, items, onSelect]);

  // ── Pairing key generation ────────────────────────────────────────────────
  function openKeyOverlay() {
    const host = STACK_IP_SAFE || "127.0.0.1";
    const currentSlug = (() => {
      const real = items.filter((i) => i.slug !== CREATE_NEW_SLUG) as KnownProject[];
      const cur  = real.find((p) => p.path === PROJECT_DIR);
      return cur?.slug ?? "unaxis";
    })();

    const { key, token, expiresAt } = generatePairingKey(host, currentSlug);
    setKeyOverlay({ key, expiresAt, host, slug: currentSlug });
    setKeyCopied(false);

    // ── Persist token so the IPC bridge can validate incoming connections ──
    // Fire-and-forget — bridge reads credentials on each connection attempt.
    import("../utils/secureStorage/index.js").then(({ setCredential }) => {
      const expSec = String(Math.floor(expiresAt.getTime() / 1000));
      setCredential("remote_bridge_token",     token).catch(() => {});
      setCredential("remote_bridge_token_exp", expSec).catch(() => {});
    }).catch(() => {});

    // ── Auto-copy key to clipboard (OSC 52 — works in most modern terminals)
    try {
      process.stdout.write(`\x1b]52;c;${Buffer.from(key).toString("base64")}\x07`);
      setKeyCopied(true);
    } catch { /* terminal doesn't support OSC 52 — user copies manually */ }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useInput((input, key) => {
    if (loading) return;

    // Key overlay is open — only allow close keys
    if (keyOverlay) {
      if (input === "q" || key.escape || input === "k") {
        setKeyOverlay(null);
        setKeyCopied(false);
      }
      return;
    }

    const maxIdx = items.length - 1;

    if (key.upArrow || input === "k") {
      setSelected((s) => Math.max(0, s - 1));
      setStubFlash(false);
      return;
    }
    if (key.downArrow || input === "j") {
      setSelected((s) => Math.min(maxIdx, s + 1));
      setStubFlash(false);
      return;
    }

    if (key.return || key.rightArrow) {
      const item = items[selected];
      if (!item) return;
      if (item.slug === CREATE_NEW_SLUG) {
        setStubFlash(true);
        setTimeout(() => setStubFlash(false), 2000);
        return;
      }
      onSelect(item as KnownProject);
      return;
    }

    // [k] — pairing key overlay (note: also used for up-nav; only fire when
    //        the key overlay is closed AND no upArrow intent — use capital K
    //        to avoid the conflict with ↑ alias)
    if (input === "K") {
      openKeyOverlay();
      return;
    }

    if (input === "q" || key.escape) {
      onQuit();
      return;
    }
  });

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={3}>
        <Text dimColor>Loading projects…</Text>
      </Box>
    );
  }

  // ── Pairing key overlay ───────────────────────────────────────────────────
  if (keyOverlay) {
    const expStr = keyOverlay.expiresAt.toLocaleString();
    // Wrap the key at ~60 chars for readability
    const keyLine1 = keyOverlay.key.slice(0, 60);
    const keyLine2 = keyOverlay.key.slice(60);

    return (
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor={KEY_COL}
        paddingX={3}
        paddingY={1}
        minWidth={66}
      >
        {/* ── Title ─────────────────────────────────────────────────────── */}
        <Box marginBottom={1} gap={2}>
          <Text bold color={KEY_COL}>⬡  Connection key</Text>
          <Text dimColor>{keyOverlay.slug}  ·  {KEY_TTL_H}h expiry</Text>
        </Box>

        {/* ── Key string ────────────────────────────────────────────────── */}
        <Box flexDirection="column" marginBottom={1}>
          <Text color={KEY_COL}>{keyLine1}</Text>
          {keyLine2 && <Text color={KEY_COL}>{keyLine2}</Text>}
        </Box>

        {/* ── Copy status ───────────────────────────────────────────────── */}
        <Box marginBottom={1}>
          {keyCopied
            ? <Text color="green">✓ copied to clipboard</Text>
            : <Text dimColor>select and copy the key above</Text>
          }
        </Box>

        {/* ── Remote command ────────────────────────────────────────────── */}
        <Box flexDirection="column" marginBottom={1}
          borderStyle="single" borderColor={DIM} paddingX={2} paddingY={0}>
          <Text dimColor>run on the remote machine:</Text>
          <Text color="white">{"  unaxis connect \\"}</Text>
          <Text color={KEY_COL}>{"    " + keyLine1}</Text>
          {keyLine2 && <Text color={KEY_COL}>{"    " + keyLine2}</Text>}
        </Box>

        {/* ── Target info ───────────────────────────────────────────────── */}
        <Box gap={3} marginBottom={1}>
          <Text dimColor>host  <Text color="white">{keyOverlay.host}:{REMOTE_IPC_PORT}</Text></Text>
          <Text dimColor>exp   <Text color="white">{expStr}</Text></Text>
        </Box>

        {/* ── Close hint ────────────────────────────────────────────────── */}
        <Box>
          <Text dimColor>q / esc / K  close</Text>
        </Box>
      </Box>
    );
  }

  // ── Main picker ───────────────────────────────────────────────────────────
  const knownProjects = items.filter((i) => i.slug !== CREATE_NEW_SLUG) as KnownProject[];

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor={BRAND}
      paddingX={3}
      paddingY={1}
      minWidth={52}
    >
      {/* ── Header ────────────────────────────────────────────────────── */}
      <Box marginBottom={1} gap={2} alignItems="center">
        <Text bold color={BRAND}>◈  UNAXIS</Text>
        <Text dimColor>Select a project</Text>
      </Box>

      {/* ── Project list ──────────────────────────────────────────────── */}
      {knownProjects.length === 0 ? (
        <Box paddingX={1} marginBottom={1}>
          <Text dimColor>No projects registered yet.</Text>
        </Box>
      ) : (
        <Box flexDirection="column" marginBottom={1}>
          {knownProjects.map((proj, i) => {
            const isActive  = proj.path === PROJECT_DIR;
            const isCursor  = selected === i;
            const nameColor = isCursor ? ACTIVE : isActive ? "white" : DIM;
            const pathColor = isCursor ? DIM : "gray";

            return (
              <Box key={proj.slug} gap={2} paddingX={1}>
                <Text color={isCursor ? ACTIVE : DIM}>{isCursor ? "▶" : " "}</Text>
                <Text bold={isCursor} color={nameColor}>{proj.slug}</Text>
                {isActive && <Text color={BRAND} dimColor>◈ current</Text>}
                <Text color={pathColor} dimColor>
                  {proj.path.replace(/\\/g, "/").replace(/^.*\/([^/]+\/[^/]+)$/, "…/$1")}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {/* ── Divider ───────────────────────────────────────────────────── */}
      <Box marginBottom={1}>
        <Text dimColor>{"  ───────────────────────────────────────"}</Text>
      </Box>

      {/* ── Create new stub ───────────────────────────────────────────── */}
      {(() => {
        const stubIdx  = items.length - 1;
        const isCursor = selected === stubIdx;
        return (
          <Box gap={2} paddingX={1} marginBottom={1}>
            <Text color={isCursor ? ACTIVE : DIM}>{isCursor ? "▶" : " "}</Text>
            <Text color={STUB_COL} dimColor={!isCursor}>⊕  Create new project…</Text>
          </Box>
        );
      })()}

      {/* ── Coming soon flash ─────────────────────────────────────────── */}
      {stubFlash && (
        <Box paddingX={1} marginBottom={1}>
          <Text color="yellow">⚠  coming soon — use  unaxis project add &lt;path&gt;  for now</Text>
        </Box>
      )}

      {/* ── Key hints ─────────────────────────────────────────────────── */}
      <Box gap={3} paddingX={1}>
        <Text dimColor>↑↓ navigate</Text>
        <Text dimColor>↵ open</Text>
        <Text dimColor>K connect key</Text>
        <Text dimColor>q quit</Text>
      </Box>
    </Box>
  );
}
