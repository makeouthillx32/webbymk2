import React, { useEffect, useRef, useState } from "react";
import { Box, Text } from "../runtimeInk.js";

// ── Constants ──────────────────────────────────────────────────────────────────

const TEARDROP  = "✻";
const TITLE     = "UNAXIS";
const ECHO      = "U N A X I S";   // expanded echo — "doubles" outward

const TOTAL_MS  = 3800;            // total animation duration (up from 3000)
const HUE_MS    = 1900;            // one full hue rotation

const SETTLED_GREY = "#999999";

// Timing milestones
const TWIN_APPEAR_MS  = 420;   // second ✻ phases in
const TITLE_APPEAR_MS = process.env.USER_TYPE === "ant" ? 0 : 500;   // main title appears
const ECHO_APPEAR_MS  = 580;   // expanded title echo appears
const ECHO_HIDE_MS    = 3100;  // echo starts collapsing back out

const GLYPH_FRAMES   = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢", "·"] as const;
const GLYPH_TICK_MS  = 110;
const GLYPH2_PHASE   = 5;     // index offset so twin glyphs are out of phase

const SHIMMER_TICK_MS    = 130;
const SHIMMER_WIDTH      = 2;
const SHIMMER_ECHO_WIDTH = 4;
const SHIMMER_ECHO_LAG   = 5;  // shimmer pos offset for echo — creates the split

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

function shimmerSplit(text: string, pos: number, width: number) {
  const start  = pos % (text.length + width);
  return {
    before: text.slice(0, Math.max(0, start)),
    lit:    text.slice(Math.max(0, start), start + width),
    after:  text.slice(start + width),
  };
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props { onComplete: () => void; }

// ── Component ──────────────────────────────────────────────────────────────────

export function StartupSplash({ onComplete }: Props) {
  const startRef             = useRef(Date.now());
  const [tick, setTick]      = useState(0);
  const [glyphIdx, setGlyph] = useState(0);
  const [shimPos, setShimPos]= useState(0);

  // Main animation loop (16ms)
  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current;
      setTick(elapsed);
      if (elapsed >= TOTAL_MS) { clearInterval(id); onComplete(); }
    }, 16);
    return () => clearInterval(id);
  }, [onComplete]);

  // Glyph ticker
  useEffect(() => {
    const id = setInterval(() => setGlyph(g => (g + 1) % GLYPH_FRAMES.length), GLYPH_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Shimmer ticker
  useEffect(() => {
    const id = setInterval(() => setShimPos(p => p + 1), SHIMMER_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const elapsed   = tick;
  const isSettling = elapsed >= 3300;
  const hue       = (elapsed / HUE_MS) * 360 % 360;
  const echoHue   = (hue + 160) % 360;  // complementary hue shift for echo

  const showTwin  = elapsed >= TWIN_APPEAR_MS;
  const showTitle = elapsed >= (process.env.USER_TYPE === "ant" ? 0 : 500);
  const showEcho  = elapsed >= ECHO_APPEAR_MS && elapsed < ECHO_HIDE_MS;

  const starColor = hslToHex(hue);
  const twinColor = hslToHex(echoHue);

  const glyph1 = GLYPH_FRAMES[glyphIdx] ?? "·";
  const glyph2 = GLYPH_FRAMES[(glyphIdx + GLYPH2_PHASE) % GLYPH_FRAMES.length] ?? "·";

  const { before, lit, after }                         = shimmerSplit(TITLE, shimPos, SHIMMER_WIDTH);
  const { before: eb, lit: el, after: ea }             = shimmerSplit(ECHO, shimPos + SHIMMER_ECHO_LAG, SHIMMER_ECHO_WIDTH);

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" paddingY={3}>

      {/* ── Twin teardrops — second one phases in at 420ms ── */}
      <Box marginBottom={1} gap={4}>
        <Text color={starColor}>{TEARDROP}</Text>
        <Text color={showTwin ? twinColor : "black"}>{TEARDROP}</Text>
      </Box>

      {/* ── Main title (cyan shimmer sweep) ── */}
      <Box>
        {showTitle ? (
          <>
            <Text bold color="white">{before}</Text>
            <Text bold color="cyanBright">{lit}</Text>
            <Text bold color="white">{after}</Text>
          </>
        ) : (
          <Text>      </Text>
        )}
      </Box>

      {/* ── Echo title (U N A X I S) — appears at 580ms, hides at 3100ms ── */}
      <Box marginBottom={1} minHeight={1}>
        {showEcho ? (
          <>
            <Text dimColor>{eb}</Text>
            <Text color={twinColor}>{el}</Text>
            <Text dimColor>{ea}</Text>
          </>
        ) : (
          <Text> </Text>
        )}
      </Box>

      {/* ── Spinner row — twin glyphs bracket the status text ── */}
      <Box gap={1} marginTop={1}>
        <Text color={isSettling ? "#555555" : "magenta"}>{glyph1}</Text>
        <Text color={isSettling ? "#666666" : undefined} dimColor={!isSettling}>
          {isSettling ? "ready" : "starting…"}
        </Text>
        <Text color={isSettling ? "#555555" : (showTwin ? twinColor : "black")}>{glyph2}</Text>
      </Box>

    </Box>
  );
}
