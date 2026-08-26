import type { CameraPlayback } from "./contracts";

export type PublicMediaConfig = {
  whepBaseUrl?: string;
  hlsBaseUrl?: string;
};

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
  if (!/^cameras\/[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}\/[0-9]+[.]mp4$/.test(storagePath)) {
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
  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL_BROWSER || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !cameraId) return null;
  const safe = safePathSegment(cameraId);
  if (!safe) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${LOOP_BUCKET}/cameras/${safe}.mp4`;
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

export function buildObsRoomPreview(
  slug: string,
  online: boolean,
  config: PublicMediaConfig,
): CameraPlayback {
  return buildWhepOnlyPlayback(obsRoomPreviewMediaPath(slug), online, config);
}

/**
 * Same construction, for a room fed by an OBS/RTMP publish rather than a
 * house camera.
 *
 * Every house camera gets a dedicated ffmpeg process (provisionMediaMtxCamera
 * in server/mediaGateway.ts) that transcodes audio to Opus for WHEP and AAC
 * for HLS — that's what makes WebRTC playback possible at all, since Opus is
 * the only audio codec WebRTC actually supports. An OBS room used to have no
 * such process: MediaMTX served whatever OBS itself published (H.264 + AAC,
 * copied through untouched), and WHEP against that path negotiated and even
 * reached pc.connectionState=connected, but never decoded a frame — confirmed
 * live 2026-08-21, reproduced 3 times in a row. That forced every OBS room
 * onto HLS, whose segment-based delivery costs several seconds of latency no
 * matter how aggressively it's tuned — exactly the "so so so long" latency
 * reported live 2026-08-23 while testing an OBS/RTMP room.
 *
 * The fix (server/obsRooms.ts's setObsRoomSignal, on the room going live)
 * provisions an obs/<slug>-whep sibling the same way a camera's -hls sibling
 * exists: one ffmpeg pulling the now-live raw path over local RTSP,
 * republishing audio-only-transcoded Opus with video copied straight
 * through. Note the polarity is the OPPOSITE of a camera's: OBS's raw base
 * path IS the HLS-ready (AAC) content — OBS is the one actually publishing
 * it, nothing can transcode in place on a path someone else is actively
 * publishing to — so hlsUrl stays on the bare path and whepUrl points at the
 * new sibling. CameraPlayer's deriveHlsUrl special-cases the -whep suffix to
 * account for this reversed polarity; see that function's comment.
 */
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

function buildPlaybackFor(
  path: string,
  hlsPath: string,
  online: boolean,
  config: PublicMediaConfig,
): CameraPlayback {
  const webrtcPageUrl = publicMediaUrl(config.whepBaseUrl, path, "");
  const whepUrl = publicMediaUrl(config.whepBaseUrl, path, "whep");
  // Deliberately the AAC sibling path, not `path` — see cameraHlsMediaPath.
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
