"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useServerDirector } from "../director/useServerDirector";
import { CrtTransition } from "../public/components/CrtTransition";
import { useObsTransparentPage } from "./useObsTransparentPage";
import { resolveBoolean, resolveNumber } from "./overlaySettings";
import { useOverlaySettings } from "./useOverlaySettings";

// The Tank cut transition, as a layer of its own.
//
// This is the cleanest of the five to separate, because it needs no video at
// all: it watches the director's active camera and fires whenever that changes.
// Nothing about the effect depends on which pixels are underneath it, so it
// composites over the programme, over a scene built from several sources, or
// over something that is not Tank at all.
//
// WHAT CHANGES BY SPLITTING IT OUT. Inside DirectorObsScene the transition was
// bound to the buffer swap — it fired when the incoming feed was ready, so the
// glitch always covered the exact frame where the picture changed. As its own
// browser source it fires on the director's STATE change instead, which is
// earlier: the cut has been decided but the new feed may still be negotiating.
//
// `delay` exists for that. It shifts the effect later to line up with whatever
// the video layer underneath actually does, which depends on the viewer's
// connection and cannot be known from here. Default 0 keeps it honest; an
// operator who sees the glitch land early nudges it.

type Props = {
  /** Composed inside the scene (false) or its own browser source (true). */
  standalone?: boolean;
  /** Overrides the director when the scene already knows what is on air. */
  triggerKey?: string | number | null;
};

export function DirectorCrtOverlay({ standalone = true, triggerKey }: Props) {
  const searchParams = useSearchParams();
  // Always the programme's settings: this component no longer has a route of
  // its own (removed 2026-09-13 — a separate browser source can never stay in
  // sync with the cut it is supposed to cover).
  const stored = useOverlaySettings("director", true);
  const durationMs = resolveNumber("duration", searchParams, stored, 180, 60, 2000).value;
  const delayMs = resolveNumber("delay", searchParams, stored, 0, 0, 5000).value;
  const preview = resolveBoolean("preview", searchParams, stored, false).value;

  const serverDirector = useServerDirector({ enabled: standalone });
  const source = triggerKey ?? serverDirector.activeCameraId ?? null;

  // The delayed mirror of `source`. Passing the raw value straight to
  // CrtTransition would make `delay` impossible, because that component fires
  // the moment its key changes.
  const [armed, setArmed] = useState<string | number | null>(null);
  const firstRunRef = useRef(true);

  useEffect(() => {
    if (!source) return;
    // Do not glitch on mount. A browser source that flashes every time OBS
    // starts it — or every time the scene is re-entered — reads as a fault.
    if (firstRunRef.current) {
      firstRunRef.current = false;
      setArmed(source);
      return;
    }
    if (delayMs === 0) {
      setArmed(source);
      return;
    }
    const timer = setTimeout(() => setArmed(source), delayMs);
    return () => clearTimeout(timer);
  }, [source, delayMs]);

  useObsTransparentPage(standalone);

  // `preview=1` holds the effect on so it can be positioned in OBS, where a
  // 180ms flash every few minutes is impossible to aim at.
  const key = preview ? "preview-hold" : armed;

  const content = <CrtTransition triggerKey={key} durationMs={preview ? 60_000 : durationMs} />;

  if (!standalone) return content;

  return (
    <main className="pointer-events-none fixed inset-0 select-none bg-transparent">
      {content}
    </main>
  );
}

function clampNumber(raw: string | null | undefined, fallback: number, min: number, max: number) {
  const parsed = raw === null || raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export default DirectorCrtOverlay;
