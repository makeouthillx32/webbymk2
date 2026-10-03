"use client";

// One player for one room's day — used by the archive page and the overlay.
//
// A finished day is one MP4 and plays with the browser's own controls. A day
// still made of segments plays them back to back as one recording, with a
// single day timeline underneath instead of a button per chunk. playsInline +
// a plain progressive MP4 with byte ranges is what iOS Safari needs.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { locateInPlayback, wallClockAt, type ArchivePlayback } from "../../archivePlayback";

function clock(d: Date): string {
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function span(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}

export function ArchiveDayPlayer({
  playback,
  placeholder,
  frameClassName = "relative aspect-video w-full overflow-hidden bg-black",
}: {
  playback: ArchivePlayback | null;
  /** Shown in the frame when there is nothing to play. */
  placeholder: React.ReactNode;
  frameClassName?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState(0);
  const pendingSeek = useRef<number | null>(null);
  const keepPlaying = useRef(false);

  // A new day or room starts at the beginning of its recording.
  const identity = playback ? `${playback.kind}|${playback.startedAt}|${playback.parts.length}` : "";
  useEffect(() => {
    setIndex(0);
    setPosition(0);
    pendingSeek.current = null;
    keepPlaying.current = false;
  }, [identity]);

  const part = playback?.parts[index] ?? null;

  const seek = useCallback(
    (t: number) => {
      if (!playback) return;
      const { index: target, offset } = locateInPlayback(playback, t);
      const video = videoRef.current;
      keepPlaying.current = Boolean(video && !video.paused);
      setPosition(t);
      if (target === index && video) {
        video.currentTime = offset;
      } else {
        pendingSeek.current = offset;
        setIndex(target);
      }
    },
    [playback, index],
  );

  if (!playback || !part) {
    return <div className={frameClassName}>{placeholder}</div>;
  }

  const stitched = playback.kind === "stitched";

  return (
    <div>
      <div className={frameClassName}>
        <video
          ref={videoRef}
          key={part.url}
          src={part.url}
          className="h-full w-full object-contain"
          controls
          playsInline
          preload="metadata"
          autoPlay={index > 0 || keepPlaying.current}
          onLoadedMetadata={(e) => {
            if (pendingSeek.current !== null) {
              e.currentTarget.currentTime = pendingSeek.current;
              pendingSeek.current = null;
            }
            if (keepPlaying.current) void e.currentTarget.play().catch(() => {});
          }}
          onTimeUpdate={(e) => setPosition(part.offsetSeconds + e.currentTarget.currentTime)}
          onEnded={() => {
            if (index + 1 < playback.parts.length) {
              keepPlaying.current = true;
              setIndex(index + 1);
            }
          }}
        />
      </div>

      {stitched && (
        <div className="mt-2 flex items-center gap-3 rounded border border-black/40 bg-black/80 px-3 py-2 font-mono text-[11px] text-slate-200">
          <span className="shrink-0 text-amber-300">{clock(wallClockAt(playback, position))}</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(playback.durationSeconds))}
            step={1}
            value={Math.floor(position)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Day timeline"
            className="h-1.5 w-full cursor-pointer accent-amber-400"
          />
          <span className="shrink-0 text-slate-400">{span(playback.durationSeconds)}</span>
        </div>
      )}
    </div>
  );
}

export default ArchiveDayPlayer;
