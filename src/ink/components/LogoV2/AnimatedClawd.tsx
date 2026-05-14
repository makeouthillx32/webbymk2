// src/ink/components/LogoV2/AnimatedClawd.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Clawd (UNAXIS star mark) with click-triggered pose animations.
// Container height is fixed at MARK_HEIGHT rows — identical footprint to a
// bare <Clawd /> — so surrounding layout never shifts on click.
//
// Two click animations:
//   BURST    — dims → bright burst (arms-up) twice
//   LOOK     — look-right → look-left → default
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { Box } from "ink";
import { Clawd, type ClawdPose } from "./Clawd.js";

// ── Frame type ────────────────────────────────────────────────────────────────

type Frame = { pose: ClawdPose; offset: number };

/** Repeat a pose for `n` 60ms frames. */
function hold(pose: ClawdPose, offset: number, n: number): Frame[] {
  return Array.from({ length: n }, () => ({ pose, offset }));
}

// ── Sequences ─────────────────────────────────────────────────────────────────

const BURST: readonly Frame[] = [
  ...hold("look-left",  0, 2),
  ...hold("arms-up",    0, 4),   // bright burst
  ...hold("default",    0, 2),
  ...hold("look-right", 0, 2),
  ...hold("arms-up",    0, 4),   // second burst
  ...hold("default",    0, 2),
];

const LOOK: readonly Frame[] = [
  ...hold("look-right", 0, 5),
  ...hold("look-left",  0, 5),
  ...hold("default",    0, 2),
];

const ANIMATIONS: readonly (readonly Frame[])[] = [BURST, LOOK];

const IDLE: Frame     = { pose: "default", offset: 0 };
const FRAME_MS        = 60;
const MARK_HEIGHT     = 3;    // rows — must match Clawd's row count

// ── Hook ─────────────────────────────────────────────────────────────────────

function useMarkAnimation(): {
  pose: ClawdPose;
  offset: number;
  onClick: () => void;
} {
  const [frameIdx, setFrameIdx]   = useState(-1);
  const seqRef                    = useRef<readonly Frame[]>(BURST);

  const onClick = () => {
    if (frameIdx !== -1) return;   // already animating
    seqRef.current = ANIMATIONS[Math.floor(Math.random() * ANIMATIONS.length)]!;
    setFrameIdx(0);
  };

  useEffect(() => {
    if (frameIdx === -1) return;
    if (frameIdx >= seqRef.current.length) {
      setFrameIdx(-1);
      return;
    }
    const t = setTimeout(() => setFrameIdx((i) => i + 1), FRAME_MS);
    return () => clearTimeout(t);
  }, [frameIdx]);

  const seq     = seqRef.current;
  const current = frameIdx >= 0 && frameIdx < seq.length ? seq[frameIdx]! : IDLE;

  return { pose: current.pose, offset: current.offset, onClick };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AnimatedClawd(): React.ReactNode {
  const { pose, offset, onClick } = useMarkAnimation();

  return (
    <Box height={MARK_HEIGHT} flexDirection="column" onClick={onClick}>
      <Box marginTop={offset} flexShrink={0}>
        <Clawd pose={pose} />
      </Box>
    </Box>
  );
}
