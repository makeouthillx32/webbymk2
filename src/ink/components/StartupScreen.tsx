// src/ink/components/StartupScreen.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Startup splash — plays once when the TUI first mounts, then calls onDone().
//
// Phases:
//   0 → SWEEP_TOTAL_MS   ✻ hue sweeps 2 full rotations; UNAXIS title shimmers
//   SWEEP_TOTAL_MS       onDone() fires — yields to the main app
//
// Animation details:
//   • ✻ teardrop:   HSL hue 0→360 twice over 3 000ms, settles to #999
//   • Glyph spinner: ['·','✢','✳','✶','✻','✽','✻','✶','✳','✢','·'] at 120ms
//   • Title shimmer: 2-char highlight sweeps across "UNAXIS" every 150ms
//   • iTerm2 tab:    OSC 9;4;1 on mount → 9;4;0 on unmount
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { Box, Text }                           from "ink";
import { writeSync }                           from "fs";

// ── Constants ─────────────────────────────────────────────────────────────────

const TEARDROP = "✻";
const TITLE    = "UNAXIS";

const SWEEP_DURATION_MS  = 1500;                        // one rotation
const SWEEP_COUNT        = 2;                           // two rotations
const SWEEP_TOTAL_MS     = SWEEP_DURATION_MS * SWEEP_COUNT;
const SETTLED_GREY       = "#999999";

const GLYPH_FRAMES = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢", "·"] as const;
const GLYPH_TICK_MS   = 120;

const SHIMMER_TICK_MS  = 150;
const SHIMMER_WIDTH    = 2;                             // chars lit at once

// iTerm2 progress indicator (no-op on other terminals)
const ITERM2_PROGRESS_START = "\x1b]9;4;1\x07";
const ITERM2_PROGRESS_STOP  = "\x1b]9;4;0\x07";

// ── Color helpers ─────────────────────────────────────────────────────────────

function hslToHex(h: number, s = 1, l = 0.62): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const val = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(val * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ── Shimmer segments helper ────────────────────────────────────────────────────

function shimmerSegments(
  text: string,
  pos: number,
): { before: string; lit: string; after: string } {
  const start  = pos % (text.length + SHIMMER_WIDTH);
  const before = text.slice(0, Math.max(0, start));
  const lit    = text.slice(Math.max(0, start), start + SHIMMER_WIDTH);
  const after  = text.slice(start + SHIMMER_WIDTH);
  return { before, lit, after };
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  onDone: () => void;
  /** Skip animation (e.g. CI, reduced-motion env). */
  instant?: boolean;
}

export function StartupScreen({ onDone, instant = false }: Props) {
  const startRef     = useRef(Date.now());
  const [tick, setTick]       = useState(0);         // drives all animations
  const [glyphIdx, setGlyph]  = useState(0);
  const [shimPos, setShimPos] = useState(0);
  const [done, setDone]       = useState(instant);

  // ── iTerm2 progress bar ────────────────────────────────────────────────────
  useEffect(() => {
    if (instant) return;
    if (process.stdout.isTTY) {
      try { writeSync(1, ITERM2_PROGRESS_START); } catch { /* ignore */ }
    }
    return () => {
      if (process.stdout.isTTY) {
        try { writeSync(1, ITERM2_PROGRESS_STOP); } catch { /* ignore */ }
      }
    };
  }, [instant]);

  // ── Main animation tick (16ms — drives hue + done check) ──────────────────
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setTick(elapsed);
      if (elapsed >= SWEEP_TOTAL_MS) {
        clearInterval(id);
        setDone(true);
      }
    }, 16);
    return () => clearInterval(id);
  }, [done]);

  // ── Glyph spinner tick (120ms) ─────────────────────────────────────────────
  useEffect(() => {
    if (done) return;
    const id = setInterval(
      () => setGlyph((g) => (g + 1) % GLYPH_FRAMES.length),
      GLYPH_TICK_MS,
    );
    return () => clearInterval(id);
  }, [done]);

  // ── Shimmer tick (150ms) ───────────────────────────────────────────────────
  useEffect(() => {
    if (done) return;
    const id = setInterval(
      () => setShimPos((p) => p + 1),
      SHIMMER_TICK_MS,
    );
    return () => clearInterval(id);
  }, [done]);

  // ── Fire onDone after done state settles ──────────────────────────────────
  useEffect(() => {
    if (done) onDone();
  }, [done, onDone]);

  // ── If instant, skip render ────────────────────────────────────────────────
  if (instant) return null;

  // ── Derive current frame values ────────────────────────────────────────────
  const elapsed  = tick;
  const hue      = (elapsed / SWEEP_DURATION_MS) * 360 % 360;
  const starColor = elapsed >= SWEEP_TOTAL_MS ? SETTLED_GREY : hslToHex(hue);
  const glyph    = GLYPH_FRAMES[glyphIdx] ?? "·";
  const { before, lit, after } = shimmerSegments(TITLE, shimPos);

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      paddingY={2}
    >
      {/* ── Teardrop sweep ──────────────────────────────────────────────── */}
      <Box marginBottom={1}>
        <Text color={starColor}>{TEARDROP}</Text>
      </Box>

      {/* ── Title shimmer ───────────────────────────────────────────────── */}
      <Box marginBottom={1}>
        <Text bold color="white">{before}</Text>
        <Text bold color="cyanBright">{lit}</Text>
        <Text bold color="white">{after}</Text>
      </Box>

      {/* ── Glyph spinner + status ──────────────────────────────────────── */}
      <Box gap={1} marginTop={1}>
        <Text color="magenta">{glyph}</Text>
        <Text dimColor>Starting up…</Text>
      </Box>
    </Box>
  );
}
