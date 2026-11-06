"use client";

// One random stranger from the NPC pool, playing their idle loop off a strip
// with a CSS steps() animation (no canvas, no JS per frame). `talking` plays
// the same loop a little faster, the way the source game does its talk state.

import React from "react";
import type { TankNpc } from "./npcs";

const KEYFRAMES =
  "@keyframes tank-npc-strip{from{background-position:0 0}to{background-position:var(--npc-end) 0}}" +
  "@media (prefers-reduced-motion:reduce){[data-tank-npc]{animation:none!important}}";

export function TavernNpc({
  npc,
  cell,
  height = 64,
  talking = false,
  className = "",
}: {
  npc: TankNpc;
  cell: [number, number];
  height?: number;
  talking?: boolean;
  className?: string;
}) {
  const width = Math.round((cell[0] / cell[1]) * height);
  const fps = talking ? npc.fps * 1.25 : npc.fps;
  const style: React.CSSProperties & Record<"--npc-end", string> = {
    width,
    height,
    backgroundImage: `url(${npc.strip})`,
    backgroundSize: `${width * npc.frames}px ${height}px`,
    backgroundRepeat: "no-repeat",
    "--npc-end": `-${width * npc.frames}px`,
    animation:
      npc.frames > 1 ? `tank-npc-strip ${(npc.frames / fps).toFixed(3)}s steps(${npc.frames}) infinite` : undefined,
  };
  return (
    <>
      <style>{KEYFRAMES}</style>
      <div data-tank-npc role="img" aria-label={npc.name} title={npc.name} className={`shrink-0 ${className}`} style={style} />
    </>
  );
}

export default TavernNpc;
