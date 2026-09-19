import type { ComponentType } from "react";
import {
  Clapperboard,
  Gauge,
  Layers,
  MessageSquareText,
  MonitorPlay,
  Target,
  Volume2,
} from "lucide-react";

export type HouseOverlayWorkspaceId =
  | "program"
  | "hud"
  | "attention"
  | "vu"
  | "director"
  | "chat"
  | "tts"
  | "triggered";

export type HouseOverlayWorkspaceEntry = {
  id: HouseOverlayWorkspaceId;
  title: string;
  description: string;
  routeLabel: string;
  status: "ready" | "foundation";
  icon: ComponentType<{ className?: string }>;
};

export const HOUSE_OVERLAY_WORKSPACE: readonly HouseOverlayWorkspaceEntry[] = [
  {
    id: "program",
    title: "Director Program",
    description: "The complete Director-controlled Tank picture for outbound OBS scenes.",
    routeLabel: "/obs/director",
    status: "ready",
    icon: MonitorPlay,
  },
  // The five director overlays, split out of /obs/director so each can be
  // positioned and tuned on its own. This is where their text and settings
  // are edited; OBS Studio is where the resulting URL gets placed.
  {
    id: "hud",
    title: "Director · CCTV HUD",
    description: "REC badge, room caption and timecode. Caption text is editable.",
    routeLabel: "/obs/director/hud",
    status: "ready",
    icon: MonitorPlay,
  },
  {
    id: "attention",
    title: "Director · Attention Banner",
    description: "Centre banner for the active director lock, with countdown.",
    routeLabel: "/obs/director/attention",
    status: "ready",
    icon: Target,
  },
  {
    id: "vu",
    title: "Director · VU Meter",
    description: "Audio energy for the room on air, plus the Tank watermark.",
    routeLabel: "/obs/director/vu",
    status: "ready",
    icon: Gauge,
  },
  {
    id: "director",
    title: "Director · Cut Transition",
    description: "Glitch timing for camera cuts. Lives in the programme source, not a layer.",
    routeLabel: "/obs/director",
    status: "ready",
    icon: Clapperboard,
  },
  {
    id: "chat",
    title: "Tank Chat",
    description: "Global or room-specific realtime chat with Tank presentation controls.",
    routeLabel: "/obs/chat",
    status: "ready",
    icon: MessageSquareText,
  },
  {
    id: "tts",
    title: "TTS Audio",
    description: "Website or room audio queue playback with an optional caption card.",
    routeLabel: "/obs/tts",
    status: "foundation",
    icon: Volume2,
  },
  {
    id: "triggered",
    title: "Scenes & Triggers",
    description: "Database-backed alerts driven by actions, schedules, and chat events.",
    routeLabel: "/overlay/[slug]",
    status: "ready",
    icon: Layers,
  },
] as const;

