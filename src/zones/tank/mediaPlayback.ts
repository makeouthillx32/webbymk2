import type { CameraPlayback } from "./contracts";

export type PublicMediaConfig = {
  whepBaseUrl?: string;
  hlsBaseUrl?: string;
};

function safePathSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
}

export function cameraMediaPath(cameraId: string) {
  const segment = safePathSegment(cameraId);
  if (!segment) throw new Error("A valid camera id is required.");
  return `cameras/${segment}`;
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
  const path = cameraMediaPath(cameraId);
  const webrtcPageUrl = publicMediaUrl(config.whepBaseUrl, path, "");
  const whepUrl = publicMediaUrl(config.whepBaseUrl, path, "whep");
  const hlsUrl = publicMediaUrl(config.hlsBaseUrl, path, "index.m3u8");

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
