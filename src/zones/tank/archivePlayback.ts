// src/zones/tank/archivePlayback.ts
// One recording per room per day — never a wall of chunks.
//
// A finished day is a single 24-hour MP4 (built by mediamtx/scripts/
// archive-aggregate.sh, registered in tank_archives). Until that exists — today,
// or a day the aggregator hasn't reached — the day's segments are played back
// to back as one recording with one timeline. Either way the viewer sees one
// thing to watch. Shared by the archive page and the archive overlay.

export type PlaybackPart = {
  url: string;
  /** Wall-clock start of this part (ISO). */
  startedAt: string;
  /** Where this part begins on the recording's timeline, in seconds. */
  offsetSeconds: number;
  durationSeconds: number;
};

export type ArchivePlayback = {
  /** "master": the day's single file. "stitched": segments played as one. */
  kind: "master" | "stitched";
  startedAt: string;
  durationSeconds: number;
  parts: PlaybackPart[];
};

export type PlayableMaster = { url: string; startedAt: string; durationSeconds: number };
export type PlayableSegment = { playbackUrl: string | null; segmentStart: string; durationSeconds: number };

/** Prefers the day's master file; otherwise stitches the playable segments in time order. */
export function buildArchivePlayback(
  master: PlayableMaster | null,
  segments: readonly PlayableSegment[],
): ArchivePlayback | null {
  if (master && master.durationSeconds > 0) {
    return {
      kind: "master",
      startedAt: master.startedAt,
      durationSeconds: master.durationSeconds,
      parts: [{ url: master.url, startedAt: master.startedAt, offsetSeconds: 0, durationSeconds: master.durationSeconds }],
    };
  }
  // A restarting recorder leaves 0-second stubs; they are not footage.
  const usable = segments
    .filter((s): s is PlayableSegment & { playbackUrl: string } => Boolean(s.playbackUrl) && s.durationSeconds >= 1)
    .slice()
    .sort((a, b) => Date.parse(a.segmentStart) - Date.parse(b.segmentStart));
  if (usable.length === 0) return null;

  let offset = 0;
  const parts = usable.map((s) => {
    const part = { url: s.playbackUrl, startedAt: s.segmentStart, offsetSeconds: offset, durationSeconds: s.durationSeconds };
    offset += s.durationSeconds;
    return part;
  });
  return { kind: "stitched", startedAt: parts[0].startedAt, durationSeconds: offset, parts };
}

/** Which part holds timeline second `t`, and how far into it. Clamped to the recording. */
export function locateInPlayback(playback: ArchivePlayback, t: number): { index: number; offset: number } {
  const clamped = Math.max(0, Math.min(t, Math.max(0, playback.durationSeconds - 0.001)));
  for (let i = playback.parts.length - 1; i >= 0; i--) {
    const p = playback.parts[i];
    if (clamped >= p.offsetSeconds) return { index: i, offset: Math.min(clamped - p.offsetSeconds, p.durationSeconds) };
  }
  return { index: 0, offset: 0 };
}

/** Wall-clock time at timeline second `t`. */
export function wallClockAt(playback: ArchivePlayback, t: number): Date {
  const { index, offset } = locateInPlayback(playback, t);
  const part = playback.parts[index];
  return new Date(Date.parse(part.startedAt) + offset * 1000);
}
