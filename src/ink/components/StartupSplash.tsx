import React, { useEffect, useRef, useState } from "react";
import { Box, Text } from "../runtimeInk.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const TEARDROP = "✻";
const TITLE    = "UNAXIS";

const SWEEP_DURATION_MS = 1500;
const SWEEP_COUNT       = 2;
const SWEEP_TOTAL_MS    = SWEEP_DURATION_MS * SWEEP_COUNT;
const SETTLED_GREY      = "#999999";

const GLYPH_FRAMES  = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢", "·"] as const;
const GLYPH_TICK_MS = 120;

const SHIMMER_TICK_MS = 150;
const SHIMMER_WIDTH   = 2;

// ── Color helpers ──────────────────────────────────────────────────────────────

function hslToHex(h: number, s = 1, l = 0.62): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k   = (n + h / 30) % 12;
    const val = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(val * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function shimmerSegments(
  text: string,
  pos:  number,
): { before: string; lit: string; after: string } {
  const start  = pos % (text.length + SHIMMER_WIDTH);
  const before = text.slice(0, Math.max(0, start));
  const lit    = text.slice(Math.max(0, start), start + SHIMMER_WIDTH);
  const after  = text.slice(start + SHIMMER_WIDTH);
  return { before, lit, after };
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  onComplete: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function StartupSplash({ onComplete }: Props) {
  const startRef          = useRef(Date.now());
  const [tick, setTick]   = useState(0);
  const [glyphIdx, setGlyph]  = useState(0);
  const [shimPos, setShimPos] = useState(0);

  // ── Main animation tick (16ms) ─────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setTick(elapsed);
      if (elapsed >= SWEEP_TOTAL_MS) {
        clearInterval(id);
        onComplete();
      }
    }, 16);
    return () => clearInterval(id);
  }, [onComplete]);

  // ── Glyph spinner (120ms) ──────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(
      () => setGlyph((g) => (g + 1) % GLYPH_FRAMES.length),
      GLYPH_TICK_MS,
    );
    return () => clearInterval(id);
  }, []);

  // ── Shimmer tick (150ms) ───────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(
      () => setShimPos((p) => p + 1),
      SHIMMER_TICK_MS,
    );
    return () => clearInterval(id);
  }, []);

  const elapsed   = tick;
  const hue       = (elapsed / SWEEP_DURATION_MS) * 360 % 360;
  const starColor = elapsed >= SWEEP_TOTAL_MS ? SETTLED_GREY : hslToHex(hue);
  const glyph     = GLYPH_FRAMES[glyphIdx] ?? "·";
  const { before, lit, after } = shimmerSegments(TITLE, shimPos);

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      paddingY={2}
    >
      <Box marginBottom={1}>
        <Text color={starColor}>{TEARDROP}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text bold color="white">{before}</Text>
        <Text bold color="cyanBright">{lit}</Text>
        <Text bold color="white">{after}</Text>
      </Box>

      <Box gap={1} marginTop={1}>
        <Text color="magenta">{glyph}</Text>
        <Text dimColor>Starting up…</Text>
      </Box>
    </Box>
  );
}
