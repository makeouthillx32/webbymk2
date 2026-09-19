// src/zones/tank/public/hlsTuning.ts
// ─────────────────────────────────────────────────────────────────────────────
// How far behind live each Tank surface sits.
//
// THE PROBLEM THIS SOLVES. Every surface that played HLS picked its own buffer
// settings, and they had drifted apart:
//
//   CameraPlayer         liveSyncDurationCount: 2   ~4s behind live
//   DirectorObsScene     liveSyncDurationCount: 3   ~6s behind live
//   PeopleDetectionEngine liveSyncDurationCount: 1  ~2s behind live
//
// MediaMTX serves 2s segments, so those are roughly 4s, 6s and 2s of delay for
// THE SAME CAMERA depending on which component happened to render it. In a
// house where one person walks from the kitchen to the living room, that is the
// difference between a continuous move and the same person appearing to be in
// two places at once — the rooms are not desynchronised at the source, they are
// desynchronised by the players.
//
// Ingest is already as tight as it gets: the RTSP bridge runs -fflags +nobuffer
// -flags low_delay with -c:v copy, identically for all six cameras. So the
// player is where sync is won or lost, and it is the part shipped from here.
//
// ONE PROFILE PER JOB, and every viewer-facing surface shares one of them.
// ─────────────────────────────────────────────────────────────────────────────

export type HlsTuning = {
  lowLatencyMode: boolean;
  liveSyncDurationCount: number;
  liveMaxLatencyDurationCount: number;
  maxBufferLength: number;
  maxMaxBufferLength: number;
  backBufferLength: number;
};

/** MediaMTX's hlsSegmentDuration. Every figure below is a multiple of it. */
export const TANK_HLS_SEGMENT_SECONDS = 2;

/**
 * What every viewer sees — grid tiles, single-room pages, the OBS programme.
 *
 * Two segments (~4s) rather than three. Three was chosen for the programme
 * source to guarantee keyframe-backed complete fragments, but MediaMTX writes
 * whole segments and hls.js will not start a fragment it cannot decode, so the
 * third segment was buying margin rather than correctness — at the cost of
 * putting the programme two seconds behind the same camera in the grid beside
 * it.
 *
 * Anything rendering a house camera to a human MUST use this, or two rooms
 * disagree about when "now" is.
 */
export const TANK_HLS_VIEWER: HlsTuning = {
  // MediaMTX serves standard fMP4 HLS, not LL-HLS parts — enabling this makes
  // hls.js wait for partial segments that never arrive.
  lowLatencyMode: false,
  liveSyncDurationCount: 2,
  // Three segments of slack before hls.js gives up and seeks to the live edge.
  // Lower than this and a single slow fetch triggers a visible jump.
  liveMaxLatencyDurationCount: 5,
  maxBufferLength: 8,
  maxMaxBufferLength: 12,
  // Keeps decoder reference frames around across P/B slices; dropping it caused
  // visible tearing on cuts.
  backBufferLength: 6,
};

/**
 * For machine vision, not eyes.
 *
 * The detection engine wants the freshest possible frame and does not care
 * whether playback is smooth — a stutter costs nothing when nobody is watching
 * and the output is a bounding box. Deliberately NOT the viewer profile, and
 * deliberately never used for anything rendered to a person.
 */
export const TANK_HLS_ANALYSIS: HlsTuning = {
  lowLatencyMode: false,
  liveSyncDurationCount: 1,
  liveMaxLatencyDurationCount: 3,
  maxBufferLength: 4,
  maxMaxBufferLength: 6,
  backBufferLength: 0,
};

/** Roughly how far behind live a profile sits, for display and for tests. */
export function approxLatencySeconds(tuning: HlsTuning): number {
  return tuning.liveSyncDurationCount * TANK_HLS_SEGMENT_SECONDS;
}

/**
 * The director wall: eight tiles at once, watched by an operator and sampled
 * by the detection engine.
 *
 * The viewer profile is tuned to keep every room agreeing on "now", which is
 * right for people watching one or two rooms. On the director wall it is wrong:
 * eight players share one connection and one decoder budget, so a four-second
 * buffer means at least one tile is always refilling. The operator sees a
 * permanent spinner carousel, and the detector samples a video element that is
 * frequently not advancing.
 *
 * A stalling feed is worse than a slightly later one for BOTH jobs here. This
 * trades roughly four extra seconds of delay for frames that keep arriving.
 *
 * Every tile on the wall shares it, so they stay mutually consistent — which is
 * what matters when judging which room to cut to. The programme output itself
 * is a separate path and is unaffected.
 */
export const TANK_HLS_STEADY: HlsTuning = {
  lowLatencyMode: false,
  liveSyncDurationCount: 4,
  // Generous: on a wall, seeking to the live edge mid-observation is more
  // disruptive than simply running a little further behind.
  liveMaxLatencyDurationCount: 10,
  maxBufferLength: 20,
  maxMaxBufferLength: 30,
  backBufferLength: 8,
};
