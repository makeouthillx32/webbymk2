import "server-only";

import { createHash } from "node:crypto";
import type {
  CameraDirectorySnapshot,
  CameraProtocol,
  CameraSceneAction,
  DiscoveredCamera,
} from "../contracts";
import {
  reconcileCameraLifecycle,
  STREAM_DISCONNECT_GRACE_SECONDS,
  type StreamIngestEventType,
} from "./cameraLifecycle";
import {
  loadCameraLifecycleMemory,
  recordIngestEvent,
  saveCameraLifecycleState,
} from "./cameraRegistryDb";
import { getPublicCameraPlayback } from "./mediaGateway";

const managerBaseUrl =
  process.env.SRT_MANAGER_INTERNAL_URL ?? "http://192.168.50.204:5050";

type ManagerCamera = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  streamKey?: unknown;
  enabled?: unknown;
};

type ManagerConfig = {
  server?: { noalbsCameraId?: unknown };
  cameras?: ManagerCamera[];
};

type ManagerTelemetry = {
  online?: unknown;
  receiverOnline?: unknown;
  reason?: unknown;
  sampledAt?: unknown;
  bitrateKbps?: unknown;
  rttMs?: unknown;
  metrics?: { bitrateKbps?: unknown; rttMs?: unknown };
  measured?: { bitrateKbps?: unknown; rttMs?: unknown };
  health?: { label?: unknown };
};

function protocol(value: unknown): CameraProtocol {
  return value === "srt" ||
    value === "srtla" ||
    value === "rtmp" ||
    value === "ip-camera"
    ? value
    : value === "rtsp"
      ? "ip-camera"
      : "unknown";
}

function safeSlug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "camera"
  );
}

function fingerprint(secret: unknown) {
  if (typeof secret !== "string" || !secret) return "unassigned";
  return createHash("sha256").update(secret).digest("hex").slice(0, 10);
}

function mapEventToSceneAction(eventType: StreamIngestEventType): CameraSceneAction {
  switch (eventType) {
    case "stream_start":
      return "ensure-scene";
    case "reconnect_grace":
      return "hold-scene";
    case "stream_retired":
      return "unmount-scene";
    default:
      return "none";
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${managerBaseUrl}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok)
    throw new Error(`Receiver manager returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function projectCamera(
  camera: ManagerCamera,
  directorCameraId: string,
): Promise<DiscoveredCamera | null> {
  if (typeof camera.id !== "string" || !camera.id) return null;
  const now = Date.now();
  let telemetry: ManagerTelemetry = {};
  try {
    telemetry = await getJson<ManagerTelemetry>(
      `/api/cameras/${encodeURIComponent(camera.id)}/telemetry`,
    );
  } catch {
    telemetry = {
      online: false,
      receiverOnline: false,
      reason: "Telemetry unavailable",
    };
  }
  const bitrateKbps =
    Number(
      telemetry.measured?.bitrateKbps ??
        telemetry.metrics?.bitrateKbps ??
        telemetry.bitrateKbps ??
        0,
    ) || 0;
  const latencyMs =
    Number(
      telemetry.measured?.rttMs ?? telemetry.metrics?.rttMs ?? telemetry.rttMs ?? 0,
    ) || null;
  const online = telemetry.online === true;

  const previousMemory = await loadCameraLifecycleMemory(camera.id);
  const lifecycle = reconcileCameraLifecycle(previousMemory, {
    online,
    degraded: online && bitrateKbps > 0 && bitrateKbps < 900,
    now,
  });

  const sceneKey = `camera:${camera.id}`;
  const cameraName =
    typeof camera.name === "string" && camera.name ? camera.name : camera.id;
  const keyFingerprint = fingerprint(camera.streamKey);

  await saveCameraLifecycleState({
    cameraId: camera.id,
    streamKey: typeof camera.streamKey === "string" ? camera.streamKey : undefined,
    name: cameraName,
    protocol: protocol(camera.type),
    presence: lifecycle.presence,
    publicVisible: lifecycle.publicVisible && camera.enabled !== false,
    hasBeenLive: lifecycle.hasBeenLive,
    lastSeenAt: lifecycle.lastSeenAt,
    disconnectedAt: lifecycle.disconnectedAt,
    retireAt: lifecycle.retireAt,
    keyFingerprint,
    bitrateKbps,
    latencyMs,
  });

  if (lifecycle.ingestEventType !== "none") {
    await recordIngestEvent({
      cameraId: camera.id,
      eventType: lifecycle.ingestEventType,
      details: {
        bitrateKbps,
        latencyMs,
        presence: lifecycle.presence,
      },
    });
  }

  return {
    id: camera.id,
    slug: safeSlug(camera.id),
    name: cameraName,
    protocol: protocol(camera.type),
    presence: lifecycle.presence,
    publicVisible: lifecycle.publicVisible && camera.enabled !== false,
    directorAssigned: camera.id === directorCameraId,
    enabled: camera.enabled !== false,
    receiverReady: telemetry.receiverOnline === true,
    bitrateKbps,
    latencyMs,
    reason:
      typeof telemetry.reason === "string"
        ? telemetry.reason
        : typeof telemetry.health?.label === "string"
          ? `Camera health ${telemetry.health.label}`
        : online
          ? "Camera stream active"
          : "Camera stream offline",
    sampledAt:
      typeof telemetry.sampledAt === "string"
        ? telemetry.sampledAt
        : new Date(now).toISOString(),
    disconnectedAt: lifecycle.disconnectedAt
      ? new Date(lifecycle.disconnectedAt).toISOString()
      : null,
    retireAt: lifecycle.retireAt
      ? new Date(lifecycle.retireAt).toISOString()
      : null,
    reconnectSecondsRemaining: lifecycle.reconnectSecondsRemaining,
    keyFingerprint,
    sceneKey,
    sceneAction: mapEventToSceneAction(lifecycle.ingestEventType),
    playback: getPublicCameraPlayback(camera.id, online),
  };
}

export async function getCameraDirectorySnapshot(): Promise<CameraDirectorySnapshot> {
  try {
    const config = await getJson<ManagerConfig>("/api/config");
    const directorCameraId =
      typeof config.server?.noalbsCameraId === "string"
        ? config.server.noalbsCameraId
        : "";
    const projected = await Promise.all(
      (config.cameras ?? []).map((camera) =>
        projectCamera(camera, directorCameraId),
      ),
    );
    return {
      source: "receiver-manager",
      generatedAt: new Date().toISOString(),
      gracePeriodSeconds: STREAM_DISCONNECT_GRACE_SECONDS,
      cameras: projected.filter(
        (camera): camera is DiscoveredCamera => camera !== null,
      ),
    };
  } catch {
    return {
      source: "unavailable",
      generatedAt: new Date().toISOString(),
      gracePeriodSeconds: STREAM_DISCONNECT_GRACE_SECONDS,
      cameras: [],
      warning: "Receiver directory is temporarily unavailable.",
    };
  }
}
