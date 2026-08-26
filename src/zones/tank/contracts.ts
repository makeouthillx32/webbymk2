import type { ItemRarity } from "./itemRarity";
export type { ItemRarity };

export type StreamHealth = "live" | "degraded" | "offline";
export type DeliveryMode = "webrtc" | "hls" | "coming-soon";
// How a camera reaches Tank. Purely descriptive — it drives no behaviour, so
// adding a source type never changes the delivery, presence or room pipeline.
// Every type converges on the same thing: the receiver publishes a per-camera
// SRT video-out that MediaMTX pulls, and a room exists exactly while signal is
// arriving. See vault/Architecture/tank-camera-connection-guide.
//   srt / srtla  a phone or hardware encoder pushing in (IRL rigs, Moblin)
//   ip-camera    an RTSP camera bridged by the receiver manager
//   usb          a webcam on the tethered machine, handed to the receiver
//   rtmp         OBS / Streamlabs publishing to a Tank-issued stream key
export type CameraProtocol = "srt" | "srtla" | "rtmp" | "ip-camera" | "usb" | "unknown";
export type CameraPlaybackStatus = "ready" | "standby" | "unconfigured";
export type CameraAudioPolicy = "passthrough" | "transcode-required" | "none";
export type CameraPlayback = {
  status: CameraPlaybackStatus;
  path: string;
  preferred: DeliveryMode;
  webrtcPageUrl?: string;
  whepUrl?: string;
  hlsUrl?: string;
  audioPolicy: CameraAudioPolicy;
};
export type CameraPresence =
  | "online"
  | "degraded"
  | "reconnecting"
  | "standby"
  | "retired";
export type CameraSceneAction =
  | "none"
  | "ensure-scene"
  | "hold-scene"
  | "restore-scene"
  | "unmount-scene";

// "none" means no browser-playable delivery exists yet for this camera —
// the receiver manager hasn't been wired to a media gateway (e.g. MediaMTX)
// that republishes the SRT feed as WebRTC/WHEP or HLS. Until then this is
// always "none" and the UI falls back to a status-only placeholder. Once a
// gateway exists and the manager's camera config starts reporting a
// whepUrl/hlsUrl, receiverManager.ts picks it up automatically — no other
// change needed here.
export type PlaybackProtocol = "whep" | "hls" | "none";

export type AudioMode = "native" | "external" | "muted";
export type CameraAudioMode = "auto" | "embedded" | "none" | "external";
export type CameraAudioStatus =
  | "embedded"
  | "silent"
  | "external-ready"
  | "missing-audio"
  | "probe-required"
  | "transcode-required";

export type TankAudioSource = {
  id: string;
  name: string;
  roomScope: string;
  online: boolean;
  codec: string | null;
  channels: number | null;
  sampleRateHz: number | null;
  tags: string[];
  kind?: "ip-mic" | "line-in" | "house-mic";
  connectionHint?: string | null;
  streamUrl?: string | null;
};

export type TankCamera = {
  id: string;
  slug: string;
  name: string;
  location: string;
  description: string;
  health: StreamHealth;
  bitrateKbps: number;
  latencyMs: number | null;
  viewers: number;
  priority: number;
  enabled: boolean;
  isPublic: boolean;
  delivery: DeliveryMode;
  accent: string;
  audioSourceId?: string;
  audioSourceName?: string;
};

export type DiscoveredCamera = {
  id: string;
  slug: string;
  name: string;
  protocol: CameraProtocol;
  roomScope: string;
  tags: string[];
  presence: CameraPresence;
  publicVisible: boolean;
  directorAssigned: boolean;
  enabled: boolean;
  receiverReady: boolean;
  bitrateKbps: number;
  latencyMs: number | null;
  reason: string;
  sampledAt: string;
  disconnectedAt: string | null;
  retireAt: string | null;
  reconnectSecondsRemaining: number | null;
  /**
   * Fingerprint of the camera's ingest credential. Absent on cameras that have
   * been through the public projection, which strips it deliberately — a public
   * viewer must never receive anything derived from an ingest secret.
   */
  keyFingerprint?: string;
  sceneKey: string;
  sceneAction: CameraSceneAction;
  audioSourceId?: string;
  audioSourceName?: string;
  playbackUrl: string | null;
  playbackProtocol: PlaybackProtocol;
  /** Low-resolution video-only rung for roster cards; never an ingest URL. */
  previewUrl?: string | null;
  previewProtocol?: PlaybackProtocol;
  /** Validated recent clip. Null whenever metadata is missing or too old. */
  recentClipUrl?: string | null;
  recentClipCapturedAt?: string | null;
  recentClipExpiresAt?: string | null;
  recentClipStatus?: "ready" | "stale" | "missing";
  recentClipDurationSeconds?: number | null;
  recentClipGeneration?: number | null;
  recentClipSourceStableAt?: string | null;
  audioMode: CameraAudioMode;
  audioStatus: CameraAudioStatus;
  audioWarning: string | null;
  nativeAudioMuted: boolean;
  hasNativeAudio?: boolean;
  description: string;
  accent: string;
  location: string;
  priority: number;
  ingestStats?: {
    bridgeAlive?: boolean;
    restarts?: number;
    audioCodec?: string | null;
    lastError?: string | null;
  };
};

export type RoomVisibilityPolicy = "always-show" | "live-only";

// A room the way the live experience actually sees it: derived from camera
// roomScope groupings (src/zones/tank/server/roomProjection.ts), never from
// a hand-maintained list — a room only exists here if cameras actually back
// it. Distinct from the static TankRoom type below, which fixtures.ts's
// orphaned legacy pages (BrowsePage/RoomPage/ChannelPage) still use.
// Where a room's TTS/SFX/system-mix audio actually plays — independent of
// which camera (if any) is in the room. "embedded" = no dedicated output,
// audio (if any) comes from the room's camera, same as before this existed.
// "client-broadcast" = any device with Tank open and locally assigned to
// this room (see useTankRoomAudioOutput) plays incoming audio-request
// events through its own OS output — e.g. a tablet already Bluetooth-paired
// to a room speaker. "host-bluetooth" is reserved for a future centrally
// managed output device; not implemented yet.
export type RoomAudioOutputKind = "embedded" | "client-broadcast" | "host-bluetooth";

export type DerivedRoom = {
  roomKey: string;
  title: string;
  eyebrow: string;
  description: string;
  tags: string[];
  visibilityPolicy: RoomVisibilityPolicy;
  cameraIds: string[];
  featuredCameraId: string;
  anyOnline: boolean;
  audioOutputKind: RoomAudioOutputKind;
  audioOutputConfig: Record<string, unknown>;
  // The one camera id (or tank_audio_sources id) treated as this room's
  // authoritative audio input when it has more than one camera/mic — see
  // the migration comment on tank_rooms.audio_input_source_id. Null means
  // no explicit choice has been made yet.
  audioInputSourceId: string | null;
};

export type TankAudioRequestKind = "tts" | "sfx" | "hazard_effect";
export type TankAudioRequestTarget = "website" | "room";
export type TankAudioRequestStatus =
  | "pending"
  | "approved"
  | "playing"
  | "completed"
  | "failed"
  | "rejected";

export type TankSfxLibraryEntry = {
  id: string;
  soundKey: string;
  name: string;
  fileUrl: string;
  category: string;
  defaultVolume: number;
  durationMs: number | null;
  isPremium: boolean;
  requiredItemSlug: string | null;
  tokenCost: number;
};

// Unified TTS + SFX request — see the migration comment in
// supabase/migrations/20260816160000_tank_room_audio_and_requests.sql for
// why one shape covers both instead of two near-duplicate tables.
export type TankAudioRequest = {
  id: string;
  userId: string;
  userName: string;
  kind: TankAudioRequestKind;
  message: string | null;
  voiceOrSoundKey: string;
  targetType: TankAudioRequestTarget;
  targetRoomKey: string | null;
  cost: number;
  status: TankAudioRequestStatus;
  priority?: number;
  attempts?: number;
  errorMessage?: string | null;
  createdAt: string;
};

// Broadcast payload fired on `tank:audio:website` or `tank:audio:room:<key>`
// once a request is approved — see requestTts/requestSfx/moderateAudioRequest
// in server/audioRequests.ts.
export type TankAudioPlaybackEvent = {
  requestId: string;
  kind: TankAudioRequestKind;
  message: string | null;
  voiceOrSoundKey: string;
  audioUrl?: string | null;
  targetRoomKey?: string | null;
};

export type CameraDirectorySnapshot = {
  source: "receiver-manager" | "unavailable";
  generatedAt: string;
  gracePeriodSeconds: number;
  cameras: DiscoveredCamera[];
  rooms: DerivedRoom[];
  audioSources?: TankAudioSource[];
  warning?: string;
};

export type TankChannel = {
  id: string;
  slug: string;
  name: string;
  handle: string;
  bio: string;
  verified: boolean;
  followers: number;
  live: boolean;
  category: string;
  cameraIds: string[];
};

export type TankRoom = {
  id: string;
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  channelId: string;
  cameraIds: string[];
  featuredCameraId: string;
  live: boolean;
  viewers: number;
  tags: string[];
};

export type ChatMessageType =
  | "text"
  | "action"
  | "item_use"
  | "rng_drop"
  | "level_up"
  | "dice_roll"
  | "coinflip"
  | "slots"
  | "roulette"
  | "crate_unbox"
  | "duel"
  | "system"
  | "announcement"
  | "house_event"
  | "trivia"
  | "scavenger";

// Console messages are TRIGGERED by the house — an item firing, an RNG roll
// landing, the server announcing something — they are never *sent* by an
// account. Tank has no bot users, so a console line has no sender identity to
// show: no avatar, no role badge, no level/rank, no clan tag. Whoever caused
// the event is named inside the body text ("admin lands a devastating kick on
// their pumpkin!"), which is the only place a name may appear.
//
// Only "text" is a real user-authored chat message. Everything else in
// ChatMessageType is console output and must render as a console card.
export const CONSOLE_MESSAGE_TYPES = [
  "action",
  "item_use",
  "rng_drop",
  "level_up",
  "dice_roll",
  "coinflip",
  "slots",
  "roulette",
  "crate_unbox",
  "duel",
  "system",
  "announcement",
  "house_event",
  "trivia",
  "scavenger",
] as const satisfies readonly ChatMessageType[];

const CONSOLE_MESSAGE_TYPE_SET: ReadonlySet<string> = new Set(CONSOLE_MESSAGE_TYPES);

export function isConsoleMessageType(type?: string | null): boolean {
  return !!type && CONSOLE_MESSAGE_TYPE_SET.has(type);
}

export type ChatRank = "Newbie" | "Regular" | "VIP" | "Legend";

export type ChatMessage = {
  id: string;
  userId?: string;
  user: string;
  body: string;
  time: string;
  createdAt?: string;
  role?: "viewer" | "member" | "regular" | "vip" | "moderator" | "admin";
  level?: number;
  xp?: number;
  rank?: ChatRank;
  avatarUrl?: string;
  nameColor?: string;
  clanTag?: string;
  clanColor?: string;
  messageType?: ChatMessageType;
  /**
   * Client-generated id for optimistic send. The sender renders the message
   * immediately under this nonce, then reconciles when the server echoes it
   * back — on the action's return value AND on the realtime broadcast, since
   * the sender is subscribed to their own room and would otherwise see the
   * message twice.
   */
  clientNonce?: string;
  replyToMessageId?: string;
  replyToUserId?: string;
  replyToUserName?: string;
  replyPreview?: string;
  reactions?: Array<{
    reaction: "love" | "laugh" | "wow" | "fire" | "skull";
    count: number;
    reactedByMe: boolean;
  }>;
  /** Rendered but not yet acknowledged by the server. */
  pending?: boolean;
  /** The send failed; the row stays visible so the text isn't lost. */
  failed?: boolean;
  itemSlug?: string;
  itemName?: string;
  itemIconUrl?: string;
  /** Drives the console card's colour — see itemRarity.ts. */
  itemRarity?: ItemRarity;
  eventDescription?: string;
  diceRoll?: { sides: number; result: number; crit: boolean; bonusXp: number; bonusTokens: number };
  coinflip?: { choice: "heads" | "tails"; outcome: "heads" | "tails"; won: boolean; wager: number; payout: number };
  slotsResult?: {
    reels: [string, string, string];
    outcome: string;
    won: boolean;
    multiplier: number;
    tokenPayout: number;
    droppedItemSlug?: string;
    droppedItemName?: string;
    droppedItemIcon?: string;
  };
  rouletteResult?: { chamber: number; survived: boolean; timeoutSeconds?: number };
  crateResult?: {
    crateName: string;
    rarity: ItemRarity;
    itemSlug: string;
    itemName: string;
    itemIcon: string;
    xpAwarded: number;
  };
};

export type AdminSection =
  | "overview"
  | "director"
  | "sources"
  | "channels"
  | "chat"
  | "economy"
  | "webhooks"
  | "users"
  | "system";
