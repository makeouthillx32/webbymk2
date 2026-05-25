// src/ink/components/LogoV2/AnimatedAsterisk.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Standalone animated ✻ — hue sweeps 2 full rotations over 3 000 ms, then
// settles to #999999. Self-contained: no ClockContext, no external color util.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { Box, Text } from "../../runtimeInk.js";

// ── Constants ─────────────────────────────────────────────────────────────────

const TEARDROP        = "✻";
const SWEEP_DURATION  = 1500;   // ms per rotation
const SWEEP_COUNT     = 2;
const TOTAL_MS        = SWEEP_DURATION * SWEEP_COUNT;
const SETTLED_GREY    = "#999999";
const TICK_MS         = 50;     // ~20 fps — enough for a smooth hue sweep

// ── Color helper ──────────────────────────────────────────────────────────────

function hslToHex(h: number, s = 1, l = 0.62): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k   = (n + h / 30) % 12;
    const val = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(val * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AnimatedAsterisk({
  char = TEARDROP,
}: {
  char?: string;
} = {}): React.ReactNode {
  const startRef             = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone]      = useState(false);

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => {
      const e = Date.now() - startRef.current;
      setElapsed(e);
      if (e >= TOTAL_MS) {
        clearInterval(id);
        setDone(true);
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [done]);

  const color = done
    ? SETTLED_GREY
    : hslToHex(((elapsed / SWEEP_DURATION) * 360) % 360);

  return (
    <Box>
      <Text color={color}>{char}</Text>
    </Box>
  );
}
