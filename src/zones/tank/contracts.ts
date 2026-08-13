export type StreamHealth = "live" | "degraded" | "offline";
export type DeliveryMode = "webrtc" | "hls" | "coming-soon";
export type CameraProtocol = "srt" | "srtla" | "rtmp" | "ip-camera" | "unknown";
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
  keyFingerprint: string;
  sceneKey: string;
  sceneAction: CameraSceneAction;
  audioSourceId?: string;
  audioSourceName?: string;
};

export type CameraDirectorySnapshot = {
  source: "receiver-manager" | "unavailable";
  generatedAt: string;
  gracePeriodSeconds: number;
  cameras: DiscoveredCamera[];
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

export type ChatMessage = {
  id: string;
  user: string;
  body: string;
  time: string;
  role?: "viewer" | "member" | "moderator";
};

export type AdminSection =
  | "overview"
  | "director"
  | "sources"
  | "channels"
  | "chat"
  | "webhooks"
  | "users"
  | "system";
