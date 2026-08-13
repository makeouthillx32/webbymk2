import type {
  ChatMessage,
  TankCamera,
  TankChannel,
  TankRoom,
} from "./contracts";

// Static identity/metadata only — name, location, description, tags. Live
// health, bitrate, latency, and presence come from the receiver-manager
// snapshot (src/zones/tank/server/receiverManager.ts, served at
// /api/tank/cameras) and are merged in client-side. Nothing in this file
// should ever claim a camera is live; that's why health/bitrate/viewers
// below are all zeroed — nobody reads them for live state anymore.
//
// IMPORTANT: `id` must exactly match the camera id configured in the SRT
// receiver app (USB/ethernet SRT, SRTLA, or mobile/IRL Pro ingest) for the
// live overlay to link up automatically. If the real provisioned id ends up
// different, rename it here to match — that's the only place it's defined.
export const cameras: TankCamera[] = [
  {
    id: "ip-room-cam",
    slug: "ip-room-cam",
    name: "Game Room — Room Cam",
    location: "Game room, IP camera",
    description: "Fixed IP camera covering the game room.",
    health: "offline",
    bitrateKbps: 0,
    latencyMs: null,
    viewers: 0,
    priority: 1,
    enabled: true,
    isPublic: true,
    delivery: "coming-soon",
    accent: "from-slate-700/60 via-slate-900/70 to-black",
  },
  {
    id: "oc-setup-cam",
    slug: "oc-setup-cam",
    name: "Game Room — OC Setup Cam",
    location: "Game room, OC desk",
    description: "Camera on the on-camera / streaming setup.",
    health: "offline",
    bitrateKbps: 0,
    latencyMs: null,
    viewers: 0,
    priority: 2,
    enabled: true,
    isPublic: true,
    delivery: "coming-soon",
    accent: "from-slate-700/60 via-slate-900/70 to-black",
  },
];

export const channels: TankChannel[] = [
  {
    id: "channel-director",
    slug: "director",
    name: "Tank Director",
    handle: "@tankdirector",
    bio: "The continuous program feed, cut live from every connected house camera.",
    verified: true,
    followers: 0,
    live: false,
    category: "IRL",
    cameraIds: ["ip-room-cam", "oc-setup-cam"],
  },
  {
    id: "channel-game-room",
    slug: "game-room",
    name: "Game Room",
    handle: "@gameroom",
    bio: "The first room online: a fixed IP camera on the room and a camera on the OC setup.",
    verified: false,
    followers: 0,
    live: false,
    category: "IRL",
    cameraIds: ["ip-room-cam", "oc-setup-cam"],
  },
];

export const rooms: TankRoom[] = [
  {
    id: "room-program",
    slug: "director",
    title: "Director Live",
    eyebrow: "Main program",
    description:
      "One continuously directed feed, switching across every connected house camera as it comes online.",
    channelId: "channel-director",
    cameraIds: ["ip-room-cam", "oc-setup-cam"],
    featuredCameraId: "ip-room-cam",
    live: false,
    viewers: 0,
    tags: ["Live", "Multi-camera"],
  },
  {
    id: "room-game-room",
    slug: "game-room",
    title: "Game Room",
    eyebrow: "First room online",
    description:
      "The game room: a fixed IP camera on the room, plus a camera on the OC setup.",
    channelId: "channel-game-room",
    cameraIds: ["ip-room-cam", "oc-setup-cam"],
    featuredCameraId: "ip-room-cam",
    live: false,
    viewers: 0,
    tags: ["Game room", "IRL"],
  },
];

// No seeded demo chat — real messages come from Supabase Realtime via
// useTankRealtimeChat as soon as someone posts.
export const chatMessages: ChatMessage[] = [];

export function cameraById(id: string) {
  return cameras.find((camera) => camera.id === id);
}
export function roomBySlug(slug: string) {
  return rooms.find((room) => room.slug === slug);
}
export function channelBySlug(slug: string) {
  return channels.find((channel) => channel.slug === slug);
}
