import { createHash } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import type {
  CameraDirectorySnapshot,
  CameraProtocol,
  CameraSceneAction,
  DiscoveredCamera,
  TankAudioSource,
} from "../contracts";
import {
  reconcileCameraLifecycle,
  STREAM_DISCONNECT_GRACE_SECONDS,
  type StreamIngestEventType,
} from "./cameraLifecycle";
import {
  loadCameraAudioAssignment,
  loadCameraLifecycleMemory,
  loadCameraPresentation,
  loadRoomPresentation,
  loadTankAudioSources,
  recordIngestEvent,
  saveCameraLifecycleState,
  type RoomPresentationRow,
} from "./cameraRegistryDb";
import { resolveCameraAudio } from "./audioPolicy";
import {
  buildManagerSrtSource,
  getPublicCameraPlayback,
  getPublicCameraPreview,
  provisionMediaMtxCamera,
  teardownCameraPreview,
} from "./mediaGateway";
import { buildPublicCameraLowPreview } from "../mediaPlayback";
import {
  normalizeManagerCameraMedia,
  type ManagerCamera,
} from "./receiverContract";
import { deriveOfflineRoomKeys, deriveRooms } from "./roomProjection";
import { liveObsRoomsAsCameras } from "./obsRoomProjection";
import { cameras as fixtureCameras } from "../fixtures";
import { attachRecentCameraClips } from "./cameraClipMetadata";

// host.docker.internal, not the host's raw LAN IP — Docker Desktop
// guarantees this path from inside a container; a container reaching the
// host's own LAN-bound IP directly is a separate, unreliable hairpin path
const isBareMetalDev =
  process.env.NODE_ENV === "development" && !process.env.DOCKER_CONTAINER;
const managerBaseUrl =
  process.env.SRT_MANAGER_INTERNAL_URL ??
  (isBareMetalDev ? "http://127.0.0.1:5050" : "http://host.docker.internal:5050");

// MediaMTX (unt_mediamtx) is always a Docker container pulling SRT from the
// receiver manager's per-camera "video out" port, which lives on the host
// (the manager itself runs natively, not in Docker — see managerBaseUrl
// above). The manager's own /api/config reports its LAN-bound IP (e.g.
// 192.168.50.204) for humans/OBS on the LAN, but a container reaching that
// address directly hits the same unreliable container->host-LAN-IP path
// documented in vault/Docker/docker-desktop-container-network-regression.md
// — confirmed broken again 2026-08-16 (MediaMTX showed 0 bytes / no source
// for both fixed cameras despite the manager's ports being alive and
// listening on the host). Always use host.docker.internal for this pull;
// never the manager-reported lanHost.
const mediaGatewaySrtHost =
  process.env.SRT_MANAGER_MEDIA_HOST ?? "host.docker.internal";

let lastProvisionWarningAt = 0;

type ManagerConfig = {
  server?: {
    noalbsCameraId?: unknown;
    // The SRT Receiver Manager's own LAN address — every camera it runs
    // (SRTLA, direct SRT, or an RTSP camera bridged through it) publishes a
    // per-camera "video out" SRT port on this host (see that tool's readme:
    // "4000/UDP — SRT playback for OBS/VLC", exposed per camera as
    // videoOutPort). Combined with each camera's videoOutPort below, this is
    // all the media gateway needs to pull any camera — no manual per-camera
    // wiring, ever, as new cameras get added.
    lanHost?: unknown;
  };
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
  audioPresent?: unknown;
  audioCodec?: unknown;
  audio?: { present?: unknown; codec?: unknown };
};

function protocol(value: unknown): CameraProtocol {
  if (
    value === "srt" ||
    value === "srtla" ||
    value === "rtmp" ||
    value === "ip-camera" ||
    value === "usb"
  ) {
    return value;
  }
  // The receiver manager names the same source type several ways depending on
  // platform — v4l2 on Linux, dshow on Windows — and an unrecognised type
  // would show up as "unknown" in the registry and the admin UI rather than
  // being wrong in any functional way. Map them all onto one label.
  if (value === "rtsp") return "ip-camera";
  if (value === "device" || value === "v4l2" || value === "dshow" || value === "webcam") {
    return "usb";
  }
  return "unknown";
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

function telemetryAudioProbe(telemetry: ManagerTelemetry) {
  const present = telemetry.audio?.present ?? telemetry.audioPresent;
  const codec = telemetry.audio?.codec ?? telemetry.audioCodec;
  return {
    present: present === true ? true : present === false ? false : null,
    codec: typeof codec === "string" && codec ? codec : null,
  };
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

/**
 * The receiver manager answers telemetry in ~2.3s under normal load, and
 * this budget was 1000ms — so EVERY call aborted, every time. The catch at
 * the call site turns any failure into `receiverOnline: false,
 * reason: "Telemetry unavailable"`, which is the gate that decides whether
 * MediaMTX camera paths get provisioned at all.
 *
 * The result was a deadlock the house could not escape on its own: no
 * telemetry -> not ready -> no path provisioned -> nothing pulls from the
 * receiver -> the manager sees no bytes and restarts the receiver -> repeat.
 * Every camera went black and stayed black until this call could finish.
 *
 * Budgeted well above the observed worst case (5s) rather than trimmed to
 * the average: being slow here costs a late sample, while being early costs
 * the entire video pipeline.
 */
const TELEMETRY_TIMEOUT_MS = 8000;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${managerBaseUrl}${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(TELEMETRY_TIMEOUT_MS),
  });
  if (!response.ok)
    throw new Error(`Receiver manager returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function projectCamera(
  camera: ManagerCamera,
  directorCameraId: string,
  audioSources: TankAudioSource[],
  mediaGatewaySrtHost: string,
): Promise<DiscoveredCamera | null> {
  if (typeof camera.id !== "string" || !camera.id) return null;
  const now = Date.now();
  let telemetry: ManagerTelemetry = {};
  try {
    telemetry = await getJson<ManagerTelemetry>(
      `/api/cameras/${encodeURIComponent(camera.id)}/telemetry`,
    );
  } catch (error) {
    console.warn(
      `[receiverManager] telemetry failed for ${camera.id} — treating as not ready:`,
      error instanceof Error ? error.message : error,
    );
    telemetry = {
      online: false,
      receiverOnline: false,
      // Distinguishable in logs from a genuinely offline camera: this state
      // blocks path provisioning, so a silent version of it is a total
      // outage that looks like "the cameras are down".
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
  // A fixed IP camera (RTSP) is a real, physically-plugged-in device — the
  // manager's telemetry.online reflects genuine reachability even at 0kbps
  // during a brief reconnect, and that's exactly why its room persists as
  // "no signal" instead of disappearing (see roomProjection.ts).
  //
  // RTMP's telemetry.online is ALSO trustworthy as-is: the manager has no
  // per-camera listener to be "ready but idle" the way SRT/SRTLA do — it
  // tracks RTMP presence purely from nginx's on_publish/on_publish_done
  // webhooks, so online=true only ever happens while something is actively
  // publishing (see srt_receiver/app.js's /api/rtmp/publish handler). RTMP
  // also never reports a real bitrateKbps (no stats endpoint), so requiring
  // one here would make a genuinely-live OBS stream register as offline.
  //
  // SRT/SRTLA are the one case that needs the extra check: their receiver
  // container reports telemetry.online=true the instant it's merely
  // listening, with nobody actually sending anything — "Receiver is ready;
  // waiting for the camera sender". Treating that alone as "online" made an
  // empty Roaming room permanently visible. Require real inbound bitrate
  // for just these so a room built from one only exists while someone is
  // actually streaming into it.
  const online =
    telemetry.online === true &&
    (camera.type === "rtsp" || camera.type === "rtmp" || bitrateKbps > 0);

  const [previousMemory, assignment, presentation] = await Promise.all([
    loadCameraLifecycleMemory(camera.id),
    loadCameraAudioAssignment(camera.id),
    loadCameraPresentation(camera.id),
  ]);
  // Launch Mode (never show "Cam Off", treat drops as a temporary ISP
  // failover) is the right call for a fixed 24/7 house camera — it is NOT
  // the right call for a push-based camera that may not exist right now.
  // Applying it unconditionally made the online-gating fix above pointless:
  // the lifecycle would force presence back to "online" regardless.
  const lifecycle = reconcileCameraLifecycle(
    previousMemory,
    {
      online,
      degraded: online && bitrateKbps > 0 && bitrateKbps < 900,
      now,
    },
    STREAM_DISCONNECT_GRACE_SECONDS,
    camera.type === "rtsp",
  );

  const sceneKey = `camera:${camera.id}`;
  const cameraName =
    typeof camera.name === "string" && camera.name ? camera.name : camera.id;
  const keyFingerprint = fingerprint(camera.streamKey);
  const mediaScope = normalizeManagerCameraMedia(camera);
  const audio = resolveCameraAudio({
    cameraId: camera.id,
    roomScope: mediaScope.roomScope,
    declaredMode: mediaScope.audioMode,
    declaredSourceId: mediaScope.audioSourceId,
    declaredSourceName: mediaScope.audioSourceName,
    assignment,
    sources: audioSources,
    probe: telemetryAudioProbe(telemetry),
  });
  // Keep delivery URLs stable for the whole lifecycle grace window. Using the
  // one raw telemetry sample here meant a single 1s manager timeout removed
  // the URL, forced every mounted player to tear down, then restored it on the
  // next poll. Presence already owns that debounce, so delivery must follow it.
  const deliveryAvailable =
    lifecycle.presence !== "standby" && lifecycle.presence !== "retired";
  const publicPlayback = getPublicCameraPlayback(camera.id, deliveryAvailable);
  const playbackUrl = publicPlayback.whepUrl ?? publicPlayback.hlsUrl ?? null;
  const playbackProtocol = publicPlayback.whepUrl
    ? "whep" as const
    : publicPlayback.hlsUrl
      ? "hls" as const
      : "none" as const;
  const publicPreview = camera.type === "srtla"
    ? getPublicCameraPreview(camera.id, deliveryAvailable)
    : process.env.TANK_HLS_LOW_RUNG === "1"
      ? buildPublicCameraLowPreview(camera.id, deliveryAvailable, {
          hlsBaseUrl: process.env.TANK_HLS_PUBLIC_BASE_URL,
        })
      : null;

  // Auto-provision this camera with the media gateway whenever it's online
  // and enabled — any camera the SRT Receiver Manager reports gets the same
  // treatment, so adding camera #2 through #25 there is all that's needed
  // for it to show up watchable here. Fire-and-forget: a gateway hiccup must
  // never break the camera directory response itself.
  if (online && camera.enabled !== false) {
    const videoOutPort = Number(camera.videoOutPort);
    // Belabox-style mobile encoders standardize on multi-second SRT
    // latency specifically for bonded cellular links — see
    // buildManagerSrtSource's latencyMs doc. A bonded phone gets real
    // retransmit headroom.
    //
    // Wired cameras USED to pass undefined here, taking SRT's 120ms default,
    // on the reasoning that a LAN link does not lose packets. That reasoning
    // holds for NETWORK loss and misses the loss actually happening: the
    // receive buffer overruns while this box is pinned near 100% CPU, and
    // 120ms is nowhere near enough to ride out a scheduling stall. Measured
    // 2026-09-13 with all six cameras wired and healthy: 4,080 non-monotonic
    // DTS warnings in five minutes (~13/sec), 223 dropped and 39 corrupt —
    // which is exactly what the vertical smearing on the broadcast was.
    //
    // A second of buffer is imperceptible on a 24/7 house stream and is the
    // difference between absorbing a stall and shredding the GOP.
    const wiredLatencyMs = Number(process.env.TANK_SRT_WIRED_LATENCY_MS ?? 1000);
    const latencyMs =
      camera.type === "srtla"
        ? 4000
        : Number.isFinite(wiredLatencyMs) && wiredLatencyMs > 0
          ? wiredLatencyMs
          : undefined;
    // PULL THE RECEIVER DIRECTLY, NOT VIA THE HOST.
    //
    // MediaMTX sits on the `unenter` network; the receivers were created on
    // `srt-receiver-manager_default`, with no DNS between them. Every camera
    // therefore hair-pinned out to host.docker.internal and back in through
    // Docker Desktop's userland UDP proxy — roughly 60 Mbps of SRT through
    // the slowest path available on this host.
    //
    // That proxy is where the pipeline actually broke: "Input/output error"
    // and "Connection timed out" on the srt:// input, with only about three
    // of six cameras ever sustaining at once. Container-to-container on the
    // shared network is a plain bridge hop with none of that.
    //
    // Falls back to the host path when the receiver is not reachable by name,
    // so a receiver created outside the shared network still works.
    const directHost = `srt-receiver-${camera.id}`;
    const useDirect = process.env.TANK_SRT_DIRECT !== "0";
    const srtSource = buildManagerSrtSource({
      lanHost: useDirect ? directHost : mediaGatewaySrtHost,
      videoOutPort: useDirect ? 4000 : videoOutPort,
      streamUser: typeof camera.streamUser === "string" ? camera.streamUser : "",
      streamKey: typeof camera.streamKey === "string" ? camera.streamKey : "",
      latencyMs,
    });
    if (srtSource) {
      // SRTLA sources force the ffmpeg-bridge path regardless of audio
      // codec. MediaMTX's own native SRT client crashes the third-party
      // SRTLA relay's player-attach logic on a bonded (multi-path)
      // connection specifically — confirmed live 2026-08-24 via a raw
      // ffprobe pull against the exact same source, which connects and
      // reads cleanly (ffmpeg's mature libsrt client doesn't trigger
      // whatever MediaMTX's client does). Forcing isTranscoding routes
      // MediaMTX through its own ffmpeg runOnInit instead of a direct
      // native pull, sidestepping the crash entirely. That same ffprobe
      // pull also surfaced a second, independent problem worth having the
      // transcode path active for anyway: this source is HEVC, which no
      // browser can decode over WebRTC — needsVideoTranscode picks that up
      // and normalizes to H.264 automatically once a first read succeeds.
      const transcodeAudio = audio.status === "transcode-required" || camera.type === "srtla";
      const externalSource = audio.status === "external-ready" && audio.audioSourceId
        ? audioSources.find((s) => s.id === audio.audioSourceId)
        : null;
      const externalAudioUrl = externalSource?.streamUrl ?? externalSource?.connectionHint ?? null;

      // The normal codec-detection bootstrap (readPathVideoCodec inside
      // provisionMediaMtxCamera) needs a path to have come up ready at
      // least once — which an SRTLA source never has here, since it's the
      // one class of camera confirmed (via a direct ffprobe pull outside
      // MediaMTX, 2026-08-24) to default to HEVC. Forcing the H.264
      // re-encode from the first attempt breaks that chicken-and-egg
      // instead of waiting on a `-c:v copy` pass that can never succeed.
      const forceVideoTranscode = camera.type === "srtla";
      // NVDEC failed to decode this exact HEVC/SRTLA source at all
      // ("Function not implemented" mid-filter, 2026-08-24) while software
      // decode of the identical stream worked — so SRTLA sources skip the
      // GPU decode path specifically, not just get forced onto H.264.
      const forceSoftwareDecode = camera.type === "srtla";

      provisionMediaMtxCamera(camera.id, srtSource, {
        transcodeAudio,
        externalAudioUrl,
        forceVideoTranscode,
        forceSoftwareDecode,
        previewRung: camera.type === "srtla",
      }).then((result) => {
        // provisionMediaMtxCamera mostly REPORTS failure in its resolved
        // {ok, error} rather than rejecting — a bare .catch() here never
        // saw any of that, so a camera stuck on the wrong MediaMTX source
        // config (e.g. never actually getting the Opus transcode ffmpeg
        // wired up) failed silently on every single poll, forever, with
        // zero trace anywhere. Confirmed live 2026-08-23: all 6 fixed
        // cameras stuck on audioStatus "transcode-required" /
        // audioCodec "pcm_alaw" — untranscoded audio being served over
        // WHEP, which no browser can decode, well after this should have
        // self-corrected.
        if (!result.ok) {
          const now = Date.now();
          if (now - lastProvisionWarningAt > 30000) {
            console.warn(`[receiverManager] provisionMediaMtxCamera failed for ${camera.id}: ${result.error ?? "unknown error"}`);
            lastProvisionWarningAt = now;
          }
        }
      }).catch((error) => {
        const now = Date.now();
        if (now - lastProvisionWarningAt > 30000) {
          console.warn(`[receiverManager] provisionMediaMtxCamera threw for ${camera.id}:`, error instanceof Error ? error.message : error);
          lastProvisionWarningAt = now;
        }
      });
    }
  } else if (camera.type === "srtla") {
    // Do not leave an IRL preview encoder retrying forever after the bonded
    // phone stops publishing. The stable camera id will reprovision the same
    // rung automatically on reconnect.
    teardownCameraPreview(camera.id).catch(() => {});
  }

  await saveCameraLifecycleState({
    cameraId: camera.id,
    streamKey: typeof camera.streamKey === "string" ? camera.streamKey : undefined,
    name: cameraName,
    protocol: protocol(camera.type),
    presence: lifecycle.presence,
    publicVisible: lifecycle.publicVisible && mediaScope.publicVisible,
    hasBeenLive: lifecycle.hasBeenLive,
    lastSeenAt: lifecycle.lastSeenAt,
    disconnectedAt: lifecycle.disconnectedAt,
    retireAt: lifecycle.retireAt,
    keyFingerprint,
    bitrateKbps,
    latencyMs,
    roomScope: mediaScope.roomScope,
    tags: mediaScope.tags,
    audioMode: mediaScope.audioMode,
    audioStatus: audio.status,
    audioWarning: audio.warning,
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
    roomScope: mediaScope.roomScope,
    tags: mediaScope.tags,
    presence: lifecycle.presence,
    publicVisible: lifecycle.publicVisible && mediaScope.publicVisible,
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
    playbackUrl,
    playbackProtocol,
    previewUrl: publicPreview?.whepUrl ?? publicPreview?.hlsUrl ?? null,
    previewProtocol: publicPreview?.whepUrl
      ? "whep"
      : publicPreview?.hlsUrl
        ? "hls"
        : "none",
    audioMode: mediaScope.audioMode,
    audioStatus: audio.status,
    audioWarning: audio.warning,
    nativeAudioMuted: audio.nativeAudioMuted,
    ...(audio.audioSourceId ? { audioSourceId: audio.audioSourceId } : {}),
    ...(audio.audioSourceName ? { audioSourceName: audio.audioSourceName } : {}),
    description: presentation.description,
    accent: presentation.accent,
    location: presentation.location,
    priority: presentation.priority,
    ingestStats: {
      bridgeAlive: (telemetry as any).bridge?.running,
      restarts: (telemetry as any).bridge?.restarts,
      audioCodec: (telemetry as any).audio?.codec,
      lastError: (telemetry as any).bridge?.lastError,
    },
  };
}

// A room with more than one camera (e.g. Living Room about to get a second
// camera) has, by default, every camera's own audio live at once — fine
// today since only one camera plays at a time in the viewer, but wrong the
// moment anything pulls a continuous audio feed "from the room" rather than
// from one specific camera (the room audio-OUTPUT work, once it carries
// more than discrete TTS/SFX events). An admin can name exactly one
// camera/source as the room's chosen input (tank_rooms.audio_input_source_id
// — see roomProjection.ts); every other camera in that room gets its own
// audio explicitly muted here so nothing downstream can ever mix them.
// Single-camera rooms are untouched — there's nothing to disambiguate.
function applyRoomAudioInputOverride(
  cameras: DiscoveredCamera[],
  roomPresentation: RoomPresentationRow[],
): DiscoveredCamera[] {
  const inputByRoomScope = new Map(
    roomPresentation
      .filter((room) => room.audioInputSourceId)
      .map((room) => [room.roomKey, room.audioInputSourceId as string]),
  );
  if (inputByRoomScope.size === 0) return cameras;

  const roomCameraCounts = new Map<string, number>();
  for (const camera of cameras) {
    roomCameraCounts.set(camera.roomScope, (roomCameraCounts.get(camera.roomScope) ?? 0) + 1);
  }

  return cameras.map((camera) => {
    const chosenSourceId = inputByRoomScope.get(camera.roomScope);
    const isMultiCameraRoom = (roomCameraCounts.get(camera.roomScope) ?? 0) > 1;
    if (!chosenSourceId || !isMultiCameraRoom || camera.id === chosenSourceId || camera.nativeAudioMuted) {
      return camera;
    }
    return {
      ...camera,
      nativeAudioMuted: true,
      audioStatus: "silent" as const,
      audioWarning: `Muted — this room's chosen audio input is ${chosenSourceId}, not this camera.`,
    };
  });
}

let cachedSnapshot: CameraDirectorySnapshot | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5000;
let snapshotRefreshInFlight: Promise<CameraDirectorySnapshot> | null = null;

let lastSnapshotErrorLogAt = 0;

export async function getCameraDirectorySnapshot(): Promise<CameraDirectorySnapshot> {
  const now = Date.now();
  if (cachedSnapshot && now - cachedAt < CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  // Page SSR, the public camera API, the health API and the permanent Director
  // worker can all arrive just after the TTL expires. Before this guard each
  // caller started its own config + N telemetry + DB reads and its own set of
  // MediaMTX provisioning checks. Besides hammering both backends, concurrent
  // provisioning calls could observe the same old config and both rewrite it,
  // tearing down live readers. One process gets one refresh.
  if (snapshotRefreshInFlight) return snapshotRefreshInFlight;

  const refresh = refreshCameraDirectorySnapshot(now);
  snapshotRefreshInFlight = refresh;
  try {
    return await refresh;
  } finally {
    if (snapshotRefreshInFlight === refresh) snapshotRefreshInFlight = null;
  }
}

async function refreshCameraDirectorySnapshot(now: number): Promise<CameraDirectorySnapshot> {

  try {
    const config = await getJson<ManagerConfig>("/api/config");
    const audioSources = await loadTankAudioSources();
    const directorCameraId =
      typeof config.server?.noalbsCameraId === "string"
        ? config.server.noalbsCameraId
        : "";
    const [projected, roomPresentation, obsCameras] = await Promise.all([
      Promise.all(
        (config.cameras ?? []).map((camera) =>
          projectCamera(camera, directorCameraId, audioSources, mediaGatewaySrtHost),
        ),
      ),
      loadRoomPresentation(),
      // Only ever adds rooms, never removes: a failure here must degrade to
      // "no OBS rooms visible" rather than take the whole camera directory
      // down over one admin's stream lookup failing.
      liveObsRoomsAsCameras().catch(() => []),
    ]);
    const projectedCameras = [
      ...applyRoomAudioInputOverride(
        projected.filter((camera): camera is DiscoveredCamera => camera !== null),
        roomPresentation,
      ),
      // Appended after the override pass — an OBS room has no external audio
      // input to route and the override only applies to house cameras anyway.
      ...obsCameras,
    ];
    const cameras = await attachRecentCameraClips(projectedCameras, now);
    const snapshot: CameraDirectorySnapshot = {
      source: "receiver-manager",
      generatedAt: new Date().toISOString(),
      gracePeriodSeconds: STREAM_DISCONNECT_GRACE_SECONDS,
      cameras,
      rooms: deriveRooms(cameras, roomPresentation),
      // Kept alongside the cameras so the public projection can drop the
      // cameras of switched-off rooms — deriveRooms has already removed the
      // rooms themselves by this point.
      offlineRoomKeys: deriveOfflineRoomKeys(roomPresentation),
      audioSources,
    };
    cachedSnapshot = snapshot;
    cachedAt = Date.now();
    return snapshot;
  } catch (err: any) {
    const errorMsg = err?.message || (typeof err === "string" ? err : "Timeout / unreachable");
    if (now - lastSnapshotErrorLogAt > 30000) {
      console.warn(`[receiverManager] getCameraDirectorySnapshot falling back to fixtures (${errorMsg})`);
      lastSnapshotErrorLogAt = now;
    }

    // Never replace a real directory with fixtures because one refresh timed
    // out. That changed camera count, removed playback URLs and made every
    // mounted player reconnect. Preserve the last known real contract and
    // retry after the normal TTL; the lifecycle layer will reconcile genuine
    // disconnects when the manager answers again.
    if (cachedSnapshot?.source === "receiver-manager") {
      const staleSnapshot: CameraDirectorySnapshot = {
        ...cachedSnapshot,
        warning: "Receiver directory refresh delayed; showing last known camera state.",
      };
      cachedSnapshot = staleSnapshot;
      cachedAt = Date.now();
      return staleSnapshot;
    }

    const fallbackCameras: DiscoveredCamera[] = fixtureCameras.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      protocol: c.id.startsWith("cam-178676824") ? "ip-camera" : "srtla",
      roomScope: c.location?.toLowerCase().replace(/\s+/g, "-") ?? "unscoped",
      tags: [],
      presence: "standby",
      publicVisible: c.isPublic !== false,
      directorAssigned: false,
      enabled: c.enabled !== false,
      receiverReady: false,
      bitrateKbps: 0,
      latencyMs: null,
      reason: "Receiver directory reconnecting",
      sampledAt: new Date(now).toISOString(),
      disconnectedAt: null,
      retireAt: null,
      reconnectSecondsRemaining: null,
      sceneKey: c.id,
      sceneAction: "none",
      playbackUrl: null,
      playbackProtocol: null,
      audioMode: "auto",
      audioStatus: "probe-required",
      audioWarning: null,
      nativeAudioMuted: false,
      description: c.description,
      accent: c.accent,
      location: c.location,
      priority: c.priority,
    }));
    const fallback: CameraDirectorySnapshot = {
      source: "unavailable",
      generatedAt: new Date().toISOString(),
      gracePeriodSeconds: STREAM_DISCONNECT_GRACE_SECONDS,
      cameras: fallbackCameras,
      rooms: deriveRooms(fallbackCameras, []),
      warning: "Receiver directory is temporarily reconnecting.",
    };
    cachedSnapshot = fallback;
    cachedAt = Date.now();
    return fallback;
  }
}

// ── Closed-Loop Feedback & Telemetry Helpers ──

export async function reportTankClientTelemetryToManager(telemetry: {
  activeRooms?: Record<string, number>;
  averageLatencyMs?: number;
  clientNetworkType?: string;
  totalViewers?: number;
  stallCount?: number;
}): Promise<boolean> {
  try {
    const res = await fetch(`${managerBaseUrl}/api/telemetry/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(telemetry),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function requestManagerCameraKeyframe(cameraId: string): Promise<boolean> {
  try {
    const res = await fetch(`${managerBaseUrl}/api/cameras/${encodeURIComponent(cameraId)}/keyframe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestedAt: new Date().toISOString() }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function refreshManagerCameraBridge(cameraId: string): Promise<boolean> {
  try {
    const res = await fetch(`${managerBaseUrl}/api/cameras/${encodeURIComponent(cameraId)}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshedAt: new Date().toISOString() }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getManagerTelemetrySummary(): Promise<any | null> {
  try {
    const res = await fetch(`${managerBaseUrl}/api/telemetry/summary`, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
