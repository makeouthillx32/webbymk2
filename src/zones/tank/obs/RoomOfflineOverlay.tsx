"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ACTIVE_THEME } from "../theme";
import { parseTrigger, shouldShowOverlay, type OverlayStatus } from "./roomOfflineDecision";

// A normal OBS Browser Source that shows itself only when a room goes down.
//
// The point is that you add it to the scene ONCE and leave it there forever.
// While the room is live the page renders nothing at all — fully transparent,
// no box, no border — so it costs the scene nothing. When an operator flips the
// room off in the staff console, the card fades in over whatever the scene was
// showing. No source toggling, no scene switching, no remembering.
//
// FAILS HIDDEN, always. If the status endpoint errors, times out, or returns
// something unexpected, the overlay stays invisible. The alternative — assuming
// "offline" when we cannot tell — would slap a full-screen OFFLINE card over a
// perfectly good live broadcast the moment the network hiccups. A missed
// overlay is a cosmetic miss; a false one covers the show.
//
// URL: /obs/room-offline?room=game-room
//
//   room     (required)  room key, e.g. game-room, living-room, foyer
//   on       off | nosignal | both   what counts as "down" (default: off)
//   preview  1           force the card on, to position it in OBS without
//                        actually taking a room down
//   title    override the room name shown on the card
//   message  override the headline (default: ROOM OFFLINE)
//   note     override the sub-line (default: WE'LL BE RIGHT BACK)
//   theme    cctv | clean   (default: cctv)
//   poll     ms between checks (default 4000, clamped 1000-60000)
//   fade     ms fade duration (default 600)

type Status = OverlayStatus & {
  roomKey: string;
  title: string;
};

const DEFAULT_POLL_MS = 4000;

export function RoomOfflineOverlay() {
  const searchParams = useSearchParams();

  const roomKey = (searchParams.get("room") || "").trim();
  const trigger = parseTrigger(searchParams.get("on"));
  const preview = searchParams.get("preview") === "1" || searchParams.get("preview") === "true";
  const titleOverride = searchParams.get("title");
  const message = searchParams.get("message") || "ROOM OFFLINE";
  const note = searchParams.get("note") ?? "WE'LL BE RIGHT BACK";
  const theme = (searchParams.get("theme") || "cctv").toLowerCase();
  const fadeMs = clampInt(searchParams.get("fade"), 600, 0, 10_000);
  const pollMs = clampInt(searchParams.get("poll"), DEFAULT_POLL_MS, 1000, 60_000);

  const [status, setStatus] = useState<Status | null>(null);
  const [visible, setVisible] = useState(false);
  const [clock, setClock] = useState("");
  const cancelled = useRef(false);

  const shouldShow = useCallback(
    (next: Status | null): boolean => shouldShowOverlay(next, trigger, preview),
    [preview, trigger],
  );

  // Poll the room's state.
  useEffect(() => {
    cancelled.current = false;
    if (!roomKey) return;
    if (preview) {
      setVisible(true);
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const check = async () => {
      try {
        const response = await fetch(
          `/api/tank/obs/room-status?room=${encodeURIComponent(roomKey)}`,
          { cache: "no-store", signal: AbortSignal.timeout(8000) },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next = (await response.json()) as Status;
        if (cancelled.current) return;
        setStatus(next);
        setVisible(shouldShow(next));
      } catch {
        // Fail hidden — see the header. Never cover a live broadcast because a
        // poll failed; just try again on the next tick.
        if (!cancelled.current) setVisible(false);
      } finally {
        if (!cancelled.current) timer = setTimeout(check, pollMs);
      }
    };

    void check();
    return () => {
      cancelled.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [roomKey, pollMs, preview, shouldShow]);

  // A running clock makes the card read as live rather than as a frozen frame.
  useEffect(() => {
    if (!visible) return;
    const tick = () => {
      const now = new Date();
      setClock(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(
          now.getSeconds(),
        ).padStart(2, "0")}`,
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [visible]);

  // Nothing configured: stay invisible rather than render an error into a live
  // scene. The hub page is where a misconfigured URL should be caught.
  if (!roomKey && !preview) return null;

  const roomTitle = titleOverride || status?.title || titleCase(roomKey) || "THIS ROOM";
  const clean = theme === "clean";

  return (
    <div
      className="pointer-events-none fixed inset-0 select-none overflow-hidden"
      style={{
        background: "transparent",
        opacity: visible ? 1 : 0,
        transition: `opacity ${fadeMs}ms ease-in-out`,
        // Keep it out of the compositor entirely while hidden, so an idle
        // overlay costs OBS nothing.
        visibility: visible ? "visible" : "hidden",
      }}
    >
      <style>{overlayCss(ACTIVE_THEME.fonts.display, ACTIVE_THEME.fonts.label)}</style>

      {/* Backdrop. Opaque on purpose: this is meant to REPLACE the dead feed. */}
      <div
        className="absolute inset-0"
        style={{
          background: clean
            ? "#0b0d10"
            : "radial-gradient(ellipse at 50% 40%, #16202a 0%, #0a0d11 55%, #05070a 100%)",
        }}
      />

      {!clean && (
        <>
          <div className="tank-off-scanlines absolute inset-0" />
          <div className="tank-off-noise absolute inset-0" />
          <div className="tank-off-vignette absolute inset-0" />
        </>
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center px-[6vw] text-center">
        <div className="tank-off-eyebrow mb-[1.6vh] flex items-center gap-[1.2vw]">
          <span className="tank-off-dot" />
          <span>SIGNAL INTERRUPTED</span>
          <span className="tank-off-dot" />
        </div>

        <h1 className="tank-off-headline">{message}</h1>

        <div className="tank-off-rule" />

        <div className="tank-off-room">{roomTitle.toUpperCase()}</div>

        {note ? <p className="tank-off-note">{note}</p> : null}
      </div>

      {/* Corner furniture — reads as a camera OSD rather than an error page. */}
      <div className="tank-off-corner tank-off-corner-tl">
        <span className="tank-off-rec" /> NO SIGNAL
      </div>
      <div className="tank-off-corner tank-off-corner-tr">{clock}</div>
      <div className="tank-off-corner tank-off-corner-bl">
        {roomKey ? roomKey.toUpperCase() : "PREVIEW"}
      </div>
      <div className="tank-off-corner tank-off-corner-br">TANK LIVE</div>
    </div>
  );
}

function titleCase(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

/**
 * Sized in vw/vh throughout so one URL looks right in a 1920x1080 scene and in
 * a small windowed source without the operator touching anything.
 */
function overlayCss(displayFont: string, labelFont: string): string {
  return `
/*
 * The page itself must be see-through.
 *
 * An OBS Browser Source composites the whole document, not just our root div,
 * and the Tank layout paints an opaque theme colour onto <body> (#637F6D).
 * Without this the source renders a solid green rectangle over the scene even
 * while the overlay is hidden — the exact opposite of "invisible until needed".
 * Safe to force here because this route exists only to be a browser source.
 */
html, body {
  background: transparent !important;
  background-color: transparent !important;
  margin: 0;
  overflow: hidden;
}
.tank-off-scanlines {
  background-image: repeating-linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0) 0px,
    rgba(0, 0, 0, 0) 2px,
    rgba(0, 0, 0, 0.28) 3px,
    rgba(0, 0, 0, 0.28) 4px
  );
  animation: tank-off-roll 8s linear infinite;
  opacity: 0.55;
}
@keyframes tank-off-roll {
  from { background-position-y: 0; }
  to   { background-position-y: 100px; }
}
.tank-off-noise {
  background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
  background-size: 3px 3px;
  animation: tank-off-flicker 2.4s steps(3) infinite;
  opacity: 0.4;
}
@keyframes tank-off-flicker {
  0%, 100% { opacity: 0.30; }
  50%      { opacity: 0.48; }
}
.tank-off-vignette {
  background: radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,0.75) 100%);
}
.tank-off-eyebrow {
  font-family: "${labelFont}", ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: clamp(10px, 1.5vw, 26px);
  letter-spacing: 0.42em;
  color: #7fd4b8;
  text-shadow: 0 0 14px rgba(127, 212, 184, 0.55);
}
.tank-off-dot {
  display: inline-block;
  width: 0.5vw; height: 0.5vw;
  min-width: 5px; min-height: 5px;
  border-radius: 9999px;
  background: #7fd4b8;
  box-shadow: 0 0 12px rgba(127, 212, 184, 0.9);
  animation: tank-off-pulse 1.6s ease-in-out infinite;
}
@keyframes tank-off-pulse {
  0%, 100% { opacity: 0.25; transform: scale(0.85); }
  50%      { opacity: 1;    transform: scale(1.15); }
}
.tank-off-headline {
  font-family: "${displayFont}", ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: clamp(38px, 11vw, 210px);
  line-height: 0.92;
  margin: 0;
  color: #f4f7fb;
  letter-spacing: 0.04em;
  /* Chromatic split — the cheapest way to read as a broken video signal. */
  text-shadow:
    0.09vw 0 0 rgba(255, 62, 92, 0.75),
    -0.09vw 0 0 rgba(62, 200, 255, 0.75),
    0 0 4vw rgba(120, 200, 255, 0.28);
  animation: tank-off-glitch 5.5s steps(1) infinite;
}
@keyframes tank-off-glitch {
  0%, 92%, 100% { transform: translateX(0); }
  93%           { transform: translateX(-0.35vw); }
  95%           { transform: translateX(0.3vw); }
  97%           { transform: translateX(-0.15vw); }
}
.tank-off-rule {
  width: min(46vw, 780px);
  height: 2px;
  margin: 2.4vh 0 2vh;
  background: linear-gradient(to right, transparent, rgba(127, 212, 184, 0.85), transparent);
}
.tank-off-room {
  font-family: "${labelFont}", ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: clamp(16px, 3.1vw, 62px);
  letter-spacing: 0.3em;
  color: #cfe3f2;
}
.tank-off-note {
  font-family: "${labelFont}", ui-monospace, "SFMono-Regular", Menlo, monospace;
  margin-top: 2.2vh;
  font-size: clamp(11px, 1.6vw, 30px);
  letter-spacing: 0.34em;
  color: rgba(207, 227, 242, 0.62);
}
.tank-off-corner {
  position: absolute;
  font-family: "${labelFont}", ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: clamp(9px, 1.15vw, 22px);
  letter-spacing: 0.24em;
  color: rgba(207, 227, 242, 0.55);
  display: flex; align-items: center; gap: 0.6vw;
}
.tank-off-corner-tl { top: 3.2vh; left: 3vw; }
.tank-off-corner-tr { top: 3.2vh; right: 3vw; }
.tank-off-corner-bl { bottom: 3.2vh; left: 3vw; }
.tank-off-corner-br { bottom: 3.2vh; right: 3vw; }
.tank-off-rec {
  display: inline-block;
  width: 0.7vw; height: 0.7vw;
  min-width: 7px; min-height: 7px;
  border-radius: 9999px;
  background: #ff3e5c;
  box-shadow: 0 0 12px rgba(255, 62, 92, 0.9);
  animation: tank-off-pulse 1.2s ease-in-out infinite;
}
`;
}

export default RoomOfflineOverlay;
