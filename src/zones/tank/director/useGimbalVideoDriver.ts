"use client";
// src/zones/tank/director/useGimbalVideoDriver.ts
// ─────────────────────────────────────────────────────────────────────────────
// Moves the programme crop smoothly WITHOUT re-rendering React.
//
// The crop used to arrive as a style prop: every PTZ update (5-6 a second from
// the Director) re-rendered the whole Tank page to change four numbers, and a
// 150 ms CSS transition then stepped between them. Now the component hands this
// hook the TARGET crop -- which only changes when the aim does -- and the hook
// runs the gimbal spring on requestAnimationFrame, writing the crop straight to
// the video elements' inline style. It sleeps once the gimbal has arrived.
//
// The elements must not also receive a PTZ `style` prop from React, or React
// would put its stale copy back on the next render.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";
import {
  DEFAULT_GIMBAL_SMOOTHNESS,
  aimToPtz,
  initialGimbal,
  ptzToAim,
  smoothnessToSeconds,
  stepGimbal,
  type GimbalState,
} from "./gimbal";
import { computePtzVideoStyle } from "./ptzFraming";
import type { VirtualPtzState } from "./ptzState";

const PTZ_STYLE_KEYS = [
  "position", "width", "height", "left", "top", "right", "bottom",
  "maxWidth", "maxHeight", "transform", "transformOrigin", "willChange",
] as const;

type VideoGetter = () => Array<HTMLVideoElement | null | undefined>;

export function applyPtzToElement(el: HTMLElement, ptz: VirtualPtzState | null): void {
  const style = computePtzVideoStyle(ptz);
  for (const key of PTZ_STYLE_KEYS) {
    // Wide (zoom 1) clears the inline geometry entirely, so the element falls
    // back to its stylesheet layout exactly as it renders without any PTZ.
    (el.style as unknown as Record<string, string>)[key] = style ? String(style[key]) : "";
  }
}

/**
 * @param target  The crop to glide to (null = full camera). Pass the same object
 *                between renders when nothing changed; only a new aim restarts motion.
 * @param videos  Returns the elements to move (called every frame, so refs may change).
 * @param options.snapKey  When this changes (a camera cut), jump instead of gliding:
 *                a crop belongs to one camera's picture and must not travel between rooms.
 */
export function useGimbalVideoDriver(
  target: VirtualPtzState | null | undefined,
  videos: VideoGetter,
  options: { snapKey?: string | null; speed?: "standard" | "sport"; onFrame?: (ptz: VirtualPtzState) => void } = {},
): void {
  const targetRef = useRef(target ?? null);
  const videosRef = useRef(videos);
  const optionsRef = useRef(options);
  const stateRef = useRef<GimbalState>(initialGimbal(ptzToAim(target ?? null)));
  const wakeRef = useRef<() => void>(() => {});
  videosRef.current = videos;
  optionsRef.current = options;

  useEffect(() => {
    let frame = 0;
    let last = 0;
    let running = false;

    const tick = (t: number) => {
      const dt = last ? (t - last) / 1000 : 1 / 60;
      last = t;
      const goal = targetRef.current;
      const aim = ptzToAim(goal);
      const seconds = smoothnessToSeconds(goal?.smoothness ?? DEFAULT_GIMBAL_SMOOTHNESS, optionsRef.current.speed);
      const next = stepGimbal(stateRef.current, aim, dt, seconds);
      stateRef.current = next;
      const ptz = aimToPtz(next, optionsRef.current.speed);
      for (const el of videosRef.current()) if (el) applyPtzToElement(el, ptz);
      optionsRef.current.onFrame?.(ptz);
      const settled = next.vz === 0 && next.vx === 0 && next.vy === 0 && next.zoom === aim.zoom && next.cx === aim.cx && next.cy === aim.cy;
      if (settled) {
        running = false;
        last = 0;
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    wakeRef.current = () => {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(tick);
    };
    wakeRef.current();
    return () => {
      running = false;
      cancelAnimationFrame(frame);
    };
  }, []);

  // A cut: land the new camera's crop at once, no glide across rooms.
  const snapKey = options.snapKey ?? null;
  const lastSnapKeyRef = useRef(snapKey);
  useEffect(() => {
    targetRef.current = target ?? null;
    if (lastSnapKeyRef.current !== snapKey) {
      lastSnapKeyRef.current = snapKey;
      stateRef.current = initialGimbal(ptzToAim(target ?? null));
    }
    wakeRef.current();
  }, [target, snapKey]);
}
