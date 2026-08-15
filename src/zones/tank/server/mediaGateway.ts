import "server-only";

import type { CameraPlayback } from "../contracts";
import {
  buildPublicCameraPlayback,
  cameraMediaPath,
} from "../mediaPlayback";

export type MediaGatewayProvisionResult = {
  ok: boolean;
  cameraId: string;
  path: string;
  playback: CameraPlayback;
  error?: string;
};

export function getPublicCameraPlayback(cameraId: string, online: boolean) {
  return buildPublicCameraPlayback(cameraId, online, {
    whepBaseUrl: process.env.TANK_WHEP_PUBLIC_BASE_URL,
    hlsBaseUrl: process.env.TANK_HLS_PUBLIC_BASE_URL,
  });
}

export { buildPublicCameraPlayback, cameraMediaPath } from "../mediaPlayback";

function loadConfiguredSrtSource(cameraId: string) {
  const raw = process.env.TANK_MEDIA_SRT_SOURCES_JSON;
  if (!raw) return undefined;
  try {
    const sources = JSON.parse(raw) as Record<string, unknown>;
    const source = sources[cameraId];
    if (typeof source !== "string") return undefined;
    const url = new URL(source);
    return url.protocol === "srt:" ? source : undefined;
  } catch {
    return undefined;
  }
}

async function loadManagerSrtSource(cameraId: string) {
  const token = process.env.SRT_MANAGER_PLAYBACK_API_TOKEN;
  const managerBase = process.env.SRT_MANAGER_INTERNAL_URL;
  if (!token || !managerBase) return undefined;

  try {
    const response = await fetch(
      new URL(
        `/api/cameras/${encodeURIComponent(cameraId)}/playback-source`,
        managerBase,
      ),
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
      },
    );
    if (!response.ok) return undefined;
    const payload = await response.json() as { sourceUrl?: unknown };
    if (typeof payload.sourceUrl !== "string") return undefined;
    const url = new URL(payload.sourceUrl);
    return url.protocol === "srt:" ? payload.sourceUrl : undefined;
  } catch {
    return undefined;
  }
}

function mediaMtxHeaders() {
  const token = process.env.MEDIAMTX_API_TOKEN;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function provisionMediaMtxCamera(
  cameraId: string,
): Promise<MediaGatewayProvisionResult> {
  const path = cameraMediaPath(cameraId);
  const playback = getPublicCameraPlayback(cameraId, true);
  const apiBase = process.env.MEDIAMTX_API_URL;
  const source = loadConfiguredSrtSource(cameraId) ?? await loadManagerSrtSource(cameraId);

  if (!apiBase || !source) {
    return {
      ok: false,
      cameraId,
      path,
      playback,
      error: "Media gateway or server-side camera source is not configured.",
    };
  }

  let apiUrl: URL;
  try {
    apiUrl = new URL(apiBase);
    if (apiUrl.protocol !== "http:" && apiUrl.protocol !== "https:") throw new Error();
  } catch {
    return { ok: false, cameraId, path, playback, error: "Media gateway API URL is invalid." };
  }

  const encodedPath = encodeURIComponent(path);
  const body = JSON.stringify({ source, sourceOnDemand: false });
  const patchResponse = await fetch(
    new URL(`/v3/config/paths/patch/${encodedPath}`, apiUrl),
    { method: "PATCH", headers: mediaMtxHeaders(), body, cache: "no-store" },
  );

  const response = patchResponse.status === 404
    ? await fetch(new URL(`/v3/config/paths/add/${encodedPath}`, apiUrl), {
        method: "POST",
        headers: mediaMtxHeaders(),
        body,
        cache: "no-store",
      })
    : patchResponse;

  if (!response.ok) {
    return {
      ok: false,
      cameraId,
      path,
      playback,
      error: `Media gateway rejected the camera path (${response.status}).`,
    };
  }

  return { ok: true, cameraId, path, playback };
}
