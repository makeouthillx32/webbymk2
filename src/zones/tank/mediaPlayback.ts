import type { CameraPlayback } from "./contracts";

export type PublicMediaConfig = {
  whepBaseUrl?: string;
  hlsBaseUrl?: string;
};

/**
 * Reserved OBS publish used as Tank's single, stable public programme output.
 *
 * The compositor at /obs/director changes the pixels inside this stream. Public
 * viewers stay attached to this path instead of opening a new camera transport
 * on every Director cut.
 */
export const DIRECTOR_PROGRAM_SLUG = "director";

function safePathSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}

export function obsRoomMediaPath(slug: string) {
  const segment = safePathSegment(slug);
  if (!segment) throw new Error("A valid room slug is required.");
  return `obs/${segment}`;
}

export function cameraMediaPath(cameraId: string) {
  const segment = safePathSegment(cameraId);
  if (!segment) throw new Error("A valid camera id is required.");
  return `cameras/${segment}`;
}

// Apple's HLS implementation (AVFoundation, which is what a native <video>
// src=.m3u8 hands off to on iOS/Safari) supports AAC/AC-3/E-AC-3 audio and
// NOT Opus. The main camera path deliberately carries Opus because that's
// what WebRTC requires — which means the exact same stream that makes WHEP
// work makes native HLS unplayable on every Apple device. So each camera
// gets a second, HLS-only path carrying identical H.264 video with AAC
// audio instead. See provisionMediaMtxCamera: both come out of one ffmpeg
// process with two outputs, so this costs an audio re-encode, not a video
// one.
export function cameraHlsMediaPath(cameraId: string) {
  return `${cameraMediaPath(cameraId)}-hls`;
}

// Low rung of the ABR ladder: 720p / ~2.5 Mbps, AAC. The source rung is 4K
// at ~8.4 Mbps, which is both unwatchable on cellular and 3-4x more
// expensive to deliver once a CDN is in front. Unlike the AAC sibling
// (video copied), this one re-encodes video, so it is gated behind
// TANK_HLS_LOW_RUNG — see provisionMediaMtxCamera.
export function cameraHlsLowMediaPath(cameraId: string) {
  return `${cameraMediaPath(cameraId)}-hls-low`;
}

// Tiny video-only rung used by room cards. User OBS and IRL contributions can
// arrive at 4K; decoding that contribution for a 200px thumbnail wastes the
// viewer's bandwidth, battery, and hardware decoder budget. This sibling is
// produced server-side at 360p / 12fps / ~450kbps.
export function cameraPreviewMediaPath(cameraId: string) {
  return `${cameraMediaPath(cameraId)}-preview`;
}

export function obsRoomPreviewMediaPath(slug: string) {
  return `previews/${obsRoomMediaPath(slug).replace("/", "-")}`;
}

// Continuous-archive rung: 1080p, recorded to disk by MediaMTX and uploaded to
// Supabase Storage. Deliberately a separate path from the delivery rungs — it
// must exist for EVERY camera, including ones whose audio needs no transcode
// and therefore have no runOnInit ffmpeg of their own. The low rung is wired
// into that ffmpeg command and so silently skips those cameras; an archive that
// quietly missed a third of the house would be far worse than a missing 720p
// ladder rung.
export function cameraArchiveMediaPath(cameraId: string) {
  return `${cameraMediaPath(cameraId)}-archive`;
}

// Storage buckets for the archive system.
//   tank-archives  PRIVATE. Real footage, members only, served via signed URLs.
//   tank-loops     PUBLIC. A few muted seconds at 480p used as a poster frame
//                  while a player connects — shown to signed-out visitors too,
//                  and it needs to be cacheable.
export const ARCHIVE_BUCKET = "tank-archives";
export const LOOP_BUCKET = "tank-loops";

/** Public URL for a server-validated object path from the loop bucket. */
export function getLoopObjectUrl(storagePath: string): string | null {
  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://db.unenter.live";
  if (!/^cameras\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}\/[0-9]{6,20}\.mp4$/.test(storagePath)) {
    return null;
  }
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${LOOP_BUCKET}/${storagePath}`;
}

/**
 * Public URL of a camera's preroll loop.
 *
 * Lives here rather than in server/archiveSegments.ts because it is a pure
 * string builder consumed by CameraPlayer on the client — and every export of
 * a "use server" module has to be an async server action, which this is not.
 */
export function getCameraLoopUrl(cameraId: string): string | null {
  return publicLoopAssetUrl("cameras", cameraId, "mp4");
}

export function getRoomLoopUrl(slug: string): string | null {
  return publicLoopAssetUrl("rooms", slug, "mp4");
}

function publicLoopAssetUrl(folder: "cameras" | "rooms", id: string, extension: "jpg" | "mp4") {
  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "https://db.unenter.live";
  const safe = safePathSegment(id);
  if (!safe) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${LOOP_BUCKET}/${folder}/${safe}.${extension}`;
}

/** Recent viewer-safe still used by social room cards. */
export function getCameraShareImageUrl(cameraId: string): string | null {
  return publicLoopAssetUrl("cameras", cameraId, "jpg");
}

/** Recent viewer-safe still for an OBS-backed room. */
export function getObsRoomShareImageUrl(slug: string): string | null {
  return publicLoopAssetUrl("rooms", slug, "jpg");
}

function publicMediaUrl(baseUrl: string | undefined, path: string, suffix: string) {
  if (!baseUrl) return undefined;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== "https:" && base.protocol !== "http:") return undefined;
    base.pathname = `${base.pathname.replace(/\/$/, "")}/${path}/${suffix}`;
    return base.toString();
  } catch {
    return undefined;
  }
}

export function buildPublicCameraPlayback(
  cameraId: string,
  online: boolean,
  config: PublicMediaConfig,
): CameraPlayback {
  return buildPlaybackFor(cameraMediaPath(cameraId), cameraHlsMediaPath(cameraId), online, config);
}

function buildWhepOnlyPlayback(
  path: string,
  online: boolean,
  config: PublicMediaConfig,
): CameraPlayback {
  const whepUrl = publicMediaUrl(config.whepBaseUrl, path, "whep");
  return {
    status: !whepUrl ? "unconfigured" : online ? "ready" : "standby",
    path,
    preferred: whepUrl ? "webrtc" : "coming-soon",
    ...(whepUrl ? { whepUrl } : {}),
    audioPolicy: "none",
  };
}

export function buildPublicCameraPreview(
  cameraId: string,
  online: boolean,
  config: PublicMediaConfig,
): CameraPlayback {
  return buildWhepOnlyPlayback(cameraPreviewMediaPath(cameraId), online, config);
}

/**
 * Existing 720p HLS rung used by fixed-camera roster/director thumbnails.
 *
 * Unlike the dedicated 360p WHEP preview used by IRL cameras, this rung is
 * already produced by the fixed-camera normalization process whenever
 * TANK_HLS_LOW_RUNG is enabled. Exposing it here prevents a 200px admin tile
 * from opening and decoding the full 4K WHEP source.
 */
export function buildPublicCameraLowPreview(
  cameraId: string,
  online: boolean,
  config: PublicMediaConfig,
): CameraPlayback {
  const path = cameraHlsLowMediaPath(cameraId);
  const hlsUrl = publicMediaUrl(config.hlsBaseUrl, path, "index.m3u8");
  return {
    status: !hlsUrl ? "unconfigured" : online ? "ready" : "standby",
    path,
    preferred: hlsUrl ? "hls" : "coming-soon",
    ...(hlsUrl ? { hlsUrl } : {}),
    audioPolicy: "none",
  };
}

export function buildObsRoomPreview(
  slug: string,
  online: boolean,
  config: PublicMediaConfig,
): CameraPlayback {
  return buildWhepOnlyPlayback(obsRoomPreviewMediaPath(slug), online, config);
}

export function buildObsRoomPlayback(
  slug: string,
  online: boolean,
  config: PublicMediaConfig,
): CameraPlayback {
  const path = obsRoomMediaPath(slug);
  const hlsUrl = publicMediaUrl(config.hlsBaseUrl, path, "index.m3u8");
  const whepUrl = publicMediaUrl(config.whepBaseUrl, `${path}-whep`, "whep");
  return {
    status: !hlsUrl && !whepUrl ? "unconfigured" : online ? "ready" : "standby",
    path,
    preferred: whepUrl ? "webrtc" : hlsUrl ? "hls" : "coming-soon",
    ...(whepUrl ? { whepUrl } : {}),
    ...(hlsUrl ? { hlsUrl } : {}),
    audioPolicy: "transcode-required",
  };
}

export function buildDirectorProgramPlayback(
  online: boolean,
  config: PublicMediaConfig,
): CameraPlayback {
  return buildObsRoomPlayback(DIRECTOR_PROGRAM_SLUG, online, config);
}

function buildPlaybackFor(
  path: string,
  hlsPath: string,
  online: boolean,
  config: PublicMediaConfig,
): CameraPlayback {
  const webrtcPageUrl = publicMediaUrl(config.whepBaseUrl, path, "");
  const whepUrl = publicMediaUrl(config.whepBaseUrl, path, "whep");
  const hlsUrl = publicMediaUrl(config.hlsBaseUrl, hlsPath, "index.m3u8");

  return {
    status: !whepUrl && !hlsUrl ? "unconfigured" : online ? "ready" : "standby",
    path,
    preferred: whepUrl ? "webrtc" : hlsUrl ? "hls" : "coming-soon",
    ...(webrtcPageUrl ? { webrtcPageUrl } : {}),
    ...(whepUrl ? { whepUrl } : {}),
    ...(hlsUrl ? { hlsUrl } : {}),
    audioPolicy: "transcode-required",
  };
}
