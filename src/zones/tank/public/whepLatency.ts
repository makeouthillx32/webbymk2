// src/zones/tank/public/whepLatency.ts
// ─────────────────────────────────────────────────────────────────────────────
// How far behind live a WHEP tile actually is.
//
// WHY THIS EXISTS. CameraPlayer reported WHEP latency as `elapsedSincePause` —
// which is zero whenever the video is playing. So a playing WHEP tile always
// claimed to be perfectly live, the drift check (`latencySec > 4`) could never
// fire, and the micro-drift catch-up explicitly skipped WHEP entirely. Nothing
// measured or corrected a grid tile's latency.
//
// The assumption behind that was "WHEP is sub-second, that is the whole point".
// It is sub-second at the START. A WebRTC jitter buffer GROWS under packet loss
// and never shrinks on its own, independently per tile — so six tiles that
// began together drift apart over hours. A viewer reported it before we did:
//
//   "i noticed the cams are not in sync"
//   "they all have some delays and show different timestamps"
//
// The house IP cameras burn an OSD clock into the picture, so unequal latency
// is not subtle — it is six different times on screen at once.
//
// jitterBufferDelay / jitterBufferEmittedCount is the real figure: the average
// time each frame waited in the buffer before being handed to the decoder.
// ─────────────────────────────────────────────────────────────────────────────

/** The subset of RTCInboundRtpStreamStats this needs. */
export type InboundVideoStatsLike = {
  type?: string;
  kind?: string;
  mediaType?: string;
  jitterBufferDelay?: number;
  jitterBufferEmittedCount?: number;
};

/**
 * Average jitter-buffer delay in seconds, or null when it cannot be known.
 *
 * Null is a real answer and must not be treated as zero: "no reading yet"
 * happens for the first second of every connection, and a tile that reports
 * 0s when it means "unknown" is exactly the bug this replaces.
 */
export function whepLatencyFromStats(
  report: Iterable<InboundVideoStatsLike> | null | undefined,
): number | null {
  if (!report) return null;

  for (const stat of report) {
    if (stat?.type !== "inbound-rtp") continue;
    const kind = stat.kind ?? stat.mediaType;
    if (kind !== "video") continue;

    const delay = stat.jitterBufferDelay;
    const emitted = stat.jitterBufferEmittedCount;
    if (typeof delay !== "number" || typeof emitted !== "number") continue;
    // Before the first frame is emitted the ratio is 0/0. Guarded rather than
    // returning NaN, which would compare false against every threshold and
    // silently disable correction.
    if (!Number.isFinite(delay) || !Number.isFinite(emitted) || emitted <= 0) continue;

    const seconds = delay / emitted;
    if (!Number.isFinite(seconds) || seconds < 0) continue;
    return seconds;
  }
  return null;
}

/**
 * Playback rate that eases a tile back toward live.
 *
 * A live WebRTC stream cannot be seeked, so the only gentle lever is playing
 * slightly fast and letting the jitter buffer drain. Deliberately small: 1.08x
 * is inaudible on speech and invisible on motion, where a hard resync is a
 * visible jump on every camera at once.
 *
 * Returns exactly 1 below the threshold so a tile that is already in sync is
 * never nudged — correcting noise is how a stable picture starts pulsing.
 */
export function catchUpPlaybackRate(
  latencySeconds: number | null,
  options?: { target?: number; maxRate?: number },
): number {
  const target = options?.target ?? WHEP_SYNC_TARGET_SECONDS;
  const maxRate = options?.maxRate ?? 1.08;

  if (latencySeconds === null || !Number.isFinite(latencySeconds)) return 1;
  if (latencySeconds <= target) return 1;

  // Ramp in over the first second past target rather than snapping to maxRate,
  // so a tile drifting slowly is corrected slowly.
  const excess = latencySeconds - target;
  const rate = 1 + Math.min(1, excess) * (maxRate - 1);
  return Math.round(rate * 1000) / 1000;
}

/**
 * Where a healthy WHEP tile should sit.
 *
 * Not zero. A jitter buffer is doing its job at a few hundred milliseconds, and
 * demanding zero would keep every tile permanently in catch-up.
 */
export const WHEP_SYNC_TARGET_SECONDS = 0.6;

/**
 * Beyond this, playing fast will not close the gap in reasonable time and the
 * session is genuinely wedged — the caller should renegotiate instead.
 */
export const WHEP_RESYNC_SECONDS = 5;

export function whepNeedsHardResync(latencySeconds: number | null): boolean {
  return latencySeconds !== null && Number.isFinite(latencySeconds)
    ? latencySeconds > WHEP_RESYNC_SECONDS
    : false;
}
