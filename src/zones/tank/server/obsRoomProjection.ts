import type { DiscoveredCamera } from "../contracts";
import { buildObsRoomPlayback, buildObsRoomPreview } from "../mediaPlayback";
import { getObsRooms, OBS_PATH_PREFIX, type ObsRoom } from "./obsRooms";

// Turns every registered OBS room into the same shape as any other camera.
//
// deriveRooms() already has exactly the lifecycle an admin's personal stream
// needs — a "live-only" room appears while at least one of its cameras is
// online/degraded and disappears the instant none are, with no special
// teardown path. That rule was written for SRT/RTMP push sources, which is
// precisely what an OBS room is. So rather than teaching the room list a
// second way to appear and disappear, an OBS room is projected into a
// DiscoveredCamera and handed to the exact same grouping logic — the
// disappearing-room behaviour comes for free.
//
// Offline rooms are projected as standby cameras. deriveRooms() still drops
// them under live-only, while an explicit tank_rooms always-show policy now
// has a group to preserve and render as "no signal".

export function projectObsRoomCamera(
  room: ObsRoom,
  now = new Date().toISOString(),
): DiscoveredCamera {
  const playback = buildObsRoomPlayback(room.slug, room.isLive, {
    // Never advertise a sibling until MediaMTX says it is ready. HLS remains
    // available during a cold start or failed Opus provision.
    whepBaseUrl: room.whepReady ? process.env.TANK_WHEP_PUBLIC_BASE_URL : undefined,
    hlsBaseUrl: process.env.TANK_HLS_PUBLIC_BASE_URL,
  });
  const preview = buildObsRoomPreview(room.slug, room.isLive, {
    whepBaseUrl: room.whepReady ? process.env.TANK_WHEP_PUBLIC_BASE_URL : undefined,
  });

  return {
    id: `${OBS_PATH_PREFIX}-${room.slug}`,
    slug: room.slug,
    name: room.title,
    protocol: "rtmp",
    roomScope: room.slug,
    tags: ["obs", "admin-room"],
    presence: room.isLive ? "online" : "standby",
    publicVisible: true,
    directorAssigned: false,
    enabled: true,
    receiverReady: room.isLive,
    bitrateKbps: 0,
    latencyMs: null,
    reason: room.isLive
      ? room.whepReady ? "OBS stream live · WebRTC ready" : "OBS stream live · HLS fallback"
      : "OBS stream offline",
    sampledAt: now,
    disconnectedAt: room.isLive ? null : room.lastSignalAt,
    retireAt: null,
    reconnectSecondsRemaining: null,
    sceneKey: room.slug,
    sceneAction: "none",
    playbackUrl: playback.whepUrl ?? playback.hlsUrl ?? null,
    playbackProtocol: playback.whepUrl ? "whep" : playback.hlsUrl ? "hls" : "none",
    previewUrl: preview.whepUrl ?? null,
    previewProtocol: preview.whepUrl ? "whep" : "none",
    audioMode: "auto",
    audioStatus: "embedded",
    audioWarning: null,
    nativeAudioMuted: false,
    description: "",
    accent: "from-purple-500/35 via-fuchsia-950/60 to-slate-950",
    location: "obs",
    priority: 99,
  };
}

export async function liveObsRoomsAsCameras(): Promise<DiscoveredCamera[]> {
  const rooms = await getObsRooms();
  const now = new Date().toISOString();
  return rooms.map((room) => projectObsRoomCamera(room, now));
}
