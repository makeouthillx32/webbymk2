"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Tv,
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  Settings2,
  Copy,
  Check,
  Download,
  Zap,
  Globe,
  Type,
  Image as ImageIcon,
  Volume2,
  Sliders,
  Maximize2,
  RotateCcw,
  Sparkles,
  Shield,
  Activity,
  CheckCircle2,
  ExternalLink,
  Radio,
  Video,
  Smartphone,
  Search,
} from "lucide-react";
import { ACTIVE_THEME } from "../theme";
import { ChromePanel } from "../public/components/ChromePanel";
import { ConsoleButton } from "../public/components/ConsoleButton";
import { CameraPlayer } from "../public/CameraPlayer";
import { useTankCameras } from "../public/useTankCameras";
import { safeStorage } from "@/lib/safeStorage";
import {
  createObsStreamRoom,
  type CreateObsRoomResult,
} from "../server/obsIngestActions";
import type { PlaybackProtocol } from "../contracts";
import { useServerDirector } from "../director/useServerDirector";
import { useRouter, useSearchParams } from "next/navigation";
import { getDirectorOverlayByRoute } from "./directorOverlayWorkshop";
import { buildObsSceneCollection, obsSceneFilename } from "./obsSceneExport";

export type SceneSourceType = "browser" | "text" | "camera" | "image" | "audio";

export type CanvasResolutionProfile = {
  id: string;
  name: string;
  width: number;
  height: number;
  aspectRatio: "16:9" | "9:16" | "4:3";
  fps: number;
  badge: string;
  description: string;
  containerAspectClass: string;
};

export const CANVAS_PROFILES: Record<string, CanvasResolutionProfile> = {
  "4k_uhd": {
    id: "4k_uhd",
    name: "4K Ultra HD",
    width: 3840,
    height: 2160,
    aspectRatio: "16:9",
    fps: 60,
    badge: "4K UHD 2160p",
    description: "4K IP PTZ House Cameras",
    containerAspectClass: "aspect-video max-w-full",
  },
  "1080p_fhd": {
    id: "1080p_fhd",
    name: "1080p Full HD",
    width: 1920,
    height: 1080,
    aspectRatio: "16:9",
    fps: 60,
    badge: "1080p 60fps",
    description: "Standard House Broadcast Feeds",
    containerAspectClass: "aspect-video max-w-full",
  },
  "720p_hd": {
    id: "720p_hd",
    name: "720p HD Ready",
    width: 1280,
    height: 720,
    aspectRatio: "16:9",
    fps: 60,
    badge: "720p 60fps",
    description: "Low-Data & Cellular Streams",
    containerAspectClass: "aspect-video max-w-full",
  },
  "irl_vertical": {
    id: "irl_vertical",
    name: "IRL Mobile Portrait",
    width: 1080,
    height: 1920,
    aspectRatio: "9:16",
    fps: 60,
    badge: "9:16 Vertical",
    description: "Bonded Cellular Backpack & Phone Streams",
    containerAspectClass: "aspect-[9/16] max-h-[580px] mx-auto",
  },
  "usb_sd": {
    id: "usb_sd",
    name: "USB / Retro Webcam",
    width: 1280,
    height: 960,
    aspectRatio: "4:3",
    fps: 30,
    badge: "4:3 USB",
    description: "USB Desk Cams & Vintage CRT Feeds",
    containerAspectClass: "aspect-[4/3] max-w-2xl mx-auto",
  },
};

export type SceneSourceItem = {
  id: string;
  name: string;
  type: SceneSourceType;
  visible: boolean;
  locked: boolean;
  x: number; // percentage (0 - 100)
  y: number; // percentage (0 - 100)
  w: number; // percentage (0 - 100)
  h: number; // percentage (0 - 100)
  zIndex: number;
  opacity: number; // 0 - 1
  url?: string;
  text?: string;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  customCss?: string;
  chromaKey?: boolean;
  /** See OverlayPreset.audioOnly - this layer produces sound and no picture. */
  audioOnly?: boolean;
};

export type CompositorScene = {
  id: string;
  title: string;
  badge: string;
  category: "obs" | "program" | "room";
  cameraIds: string[];
  playbackUrl?: string | null;
  playbackProtocol?: PlaybackProtocol;
  online: boolean;
  description: string;
};

export type OverlayPreset = {
  id: string;
  name: string;
  url: string;
  w: number;
  h: number;
  x: number;
  y: number;
  chromaKey?: boolean;
  /**
   * Draws nothing. Its geometry is meaningless and its only output is sound.
   *
   * Flagged so the layer stack can say so, because a blank rectangle on the
   * canvas otherwise reads as a broken overlay and invites someone to resize or
   * delete the thing that is carrying the programme audio.
   */
  audioOnly?: boolean;
};

export const OVERLAY_PRESETS: OverlayPreset[] = [
  {
    id: "hud",
    name: "🕒 CCTV Watermark & HUD",
    url: "/obs/director/hud",
    w: 100,
    h: 15,
    x: 0,
    y: 0,
  },
  {
    id: "attention",
    name: "🎯 Director Attention Banner",
    url: "/obs/director/attention?preview=1",
    w: 50,
    h: 10,
    x: 25,
    y: 2,
  },
  {
    id: "vu",
    name: "📊 Audio VU Meter & Watermark",
    url: "/obs/director/vu",
    w: 100,
    h: 14,
    x: 0,
    y: 86,
  },
  {
    id: "chat",
    name: "💬 Live Chat Ticker",
    url: "/obs/chat",
    w: 35,
    h: 40,
    x: 3,
    y: 55,
  },
  {
    id: "tts",
    name: "🗣️ TTS Speech Bubble",
    url: "/obs/tts",
    w: 45,
    h: 22,
    x: 27,
    y: 15,
    chromaKey: true,
  },
  {
    id: "program_clean",
    name: "🎥 Director Programme (picture + sound)",
    // Picture and sound. Nothing is drawn on top, and nothing can be.
    //
    // This is the base layer; the HUD, banner, meter and goal bar are added as
    // their own browser sources above it. The programme source no longer draws
    // overlays at all, so there are no flags to switch off — the old
    // hud=0&attention=0&vu=0 were there to stop each overlay being drawn twice,
    // once baked in and once as its own source.
    url: "/obs/director?volume=100",
    w: 100,
    h: 100,
    x: 0,
    y: 0,
  },
];

const DEFAULT_SOURCES: SceneSourceItem[] = [
  {
    id: "src_cam",
    name: "Base Stream Feed",
    type: "camera",
    visible: true,
    locked: true,
    x: 0,
    y: 0,
    w: 100,
    h: 100,
    zIndex: 1,
    opacity: 1,
  },
  {
    id: "src_hud",
    name: "CCTV Watermark & HUD",
    type: "browser",
    visible: true,
    locked: false,
    x: 0,
    y: 0,
    w: 100,
    h: 15,
    zIndex: 14,
    opacity: 1,
    url: "/obs/director/hud",
  },
  {
    id: "src_attention",
    name: "Director Attention Banner",
    type: "browser",
    visible: true,
    locked: false,
    x: 25,
    y: 2,
    w: 50,
    h: 10,
    zIndex: 16,
    opacity: 1,
    url: "/obs/director/attention?preview=1",
  },
  {
    id: "src_vu",
    name: "Audio VU Meter & Watermark",
    type: "browser",
    visible: true,
    locked: false,
    x: 0,
    y: 86,
    w: 100,
    h: 14,
    zIndex: 12,
    opacity: 1,
    url: "/obs/director/vu",
  },
  {
    id: "src_chat",
    name: "Live Chat Ticker",
    type: "browser",
    visible: true,
    locked: false,
    x: 3,
    y: 55,
    w: 35,
    h: 40,
    zIndex: 8,
    opacity: 0.95,
    url: "/obs/chat",
  },
  {
    id: "src_tts",
    name: "TTS Speech Bubble Overlay",
    type: "browser",
    visible: true,
    locked: false,
    x: 27,
    y: 15,
    w: 45,
    h: 22,
    zIndex: 10,
    opacity: 0.95,
    url: "/obs/tts",
    chromaKey: true,
  },
];

const STORAGE_KEY_SCENES = "tank_compositor_scenes_v3";

export function ObsStudioCompositorPanel({
  operatorRole = "admin",
}: {
  operatorRole?: "admin" | "moderator";
}) {
  const { snapshot, liveById, isOnline } = useTankCameras();
  const rooms = snapshot?.rooms ?? [];

  // What the director currently has on air.
  //
  // Needed because the Director Program scene used to point at a hardcoded
  // `obs/director/whep` and claim `online: true` unconditionally. That path
  // only exists when OBS is publishing a composed programme BACK into
  // MediaMTX, which it is not — verified 2026-09-12, where the only live obs/*
  // paths were `obs/admin` and `obs/admin-whep`. So the one scene that is
  // supposed to show the master output was the only scene showing nothing,
  // while every room beside it played fine.
  const serverDirector = useServerDirector();

  // Jumping to the Workshop with the right overlay already open. Decks are
  // URL-driven, so this is a URL change rather than shared state.
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sceneDownloaded, setSceneDownloaded] = useState(false);

  /**
   * Export the composed scene as an OBS scene collection.
   *
   * Built entirely in the browser: the scene already lives in this
   * component's state, so a round trip to the server would only be a chance
   * for the file to disagree with what is on screen.
   *
   * Percentages become pixels here because OBS works in canvas pixels while
   * this compositor works in percentages — that conversion is the one piece
   * of real translation in the export.
   */
  const handleDownloadScene = () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://tank.unenter.live";
    const canvasWidth = activeProfile.width;
    const canvasHeight = activeProfile.height;

    const exportSources = currentSources
      .filter((source) => source.type === "browser" || source.type === "camera")
      .map((source) => {
        // A camera layer has no URL of its own — it is this compositor's way
        // of saying 'the programme'. In OBS that is the director browser
        // source, which draws picture and sound only; every overlay is its own
        // source in the exported scene.
        const url =
          source.type === "camera"
            ? `${origin}/obs/director?volume=100`
            : source.url?.startsWith("http")
              ? source.url
              : `${origin}${source.url ?? ""}`;

        return {
          name: source.name,
          url,
          width: Math.round((source.w / 100) * canvasWidth),
          height: Math.round((source.h / 100) * canvasHeight),
          x: Math.round((source.x / 100) * canvasWidth),
          y: Math.round((source.y / 100) * canvasHeight),
          visible: source.visible,
          // Only the programme carries sound. See obsSceneExport for why
          // overlays must not take a mixer channel.
          routeAudio: source.type === "camera" || source.audioOnly === true,
        };
      });

    if (exportSources.length === 0) return;

    const sceneName = `Tank · ${activeScene?.title ?? selectedRoomKey}`;
    const collection = buildObsSceneCollection({
      sceneName,
      collectionName: sceneName,
      canvasWidth,
      canvasHeight,
      sources: exportSources,
    });

    const blob = new Blob([JSON.stringify(collection, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = obsSceneFilename(sceneName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // Revoking immediately can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(href), 10_000);

    setSceneDownloaded(true);
    setTimeout(() => setSceneDownloaded(false), 2500);
  };

  const openInWorkshop = (overlayId: string) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set("deck", "overlays");
    params.set("overlay", overlayId);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  /**
   * The Director Program scene, resolved from what is actually playing.
   *
   * Two sources, strongest first:
   *
   *  1. The real composed programme (`obs/director`), when MediaMTX confirms
   *     something is publishing to it. That is the intended architecture — OBS
   *     renders the programme and pushes it back — and it stays supported.
   *  2. Otherwise the camera the director currently has on air, which is the
   *     same feed the Live Program Monitor in the director configurator shows.
   *
   * Falling back rather than removing case 1 matters: the moment someone does
   * start publishing a composed programme, this picks it up with no code
   * change. And `online` is now derived from whether a URL was actually found
   * instead of being hardcoded true, so a dead programme reads as dead.
   */
  const directorProgramScene = useMemo<CompositorScene>(() => {
    const program = serverDirector.program;
    if (program?.online && program.playbackUrl) {
      return {
        id: "director",
        title: "Director Program (Master Broadcast)",
        badge: "PROGRAM",
        category: "program",
        cameraIds: ["director"],
        playbackUrl: program.playbackUrl,
        playbackProtocol: program.playbackProtocol,
        online: true,
        description: "Composed OBS programme published back to obs/director",
      };
    }

    const activeId = serverDirector.activeCameraId;
    const live = activeId ? liveById.get(activeId) ?? null : null;
    const camera = (snapshot?.cameras ?? []).find((c) => c.id === activeId) ?? null;

    return {
      id: "director",
      title: "Director Program (Master Broadcast)",
      badge: "PROGRAM",
      category: "program",
      cameraIds: activeId ? [activeId] : [],
      playbackUrl: live?.playbackUrl ?? undefined,
      playbackProtocol: live?.playbackProtocol ?? "whep",
      online: Boolean(live?.playbackUrl),
      description: camera
        ? `Director is on ${camera.name} — following its cuts live`
        : "Waiting for the director to select a camera",
    };
  }, [
    serverDirector.program,
    serverDirector.activeCameraId,
    liveById,
    snapshot?.cameras,
  ]);

  // Unified list of composite scenes: Running OBS feeds, Director Program, and House Rooms
  const compositeScenes = useMemo<CompositorScene[]>(() => {
    const list: CompositorScene[] = [
      {
        id: "obs-admin",
        title: "OBS Live (L0VE PC · admin)",
        badge: "LIVE OBS",
        category: "obs",
        cameraIds: ["obs-admin"],
        playbackUrl: "https://media.tank.unenter.live/obs/admin/whep",
        playbackProtocol: "whep",
        online: true,
        description: "Active RTMP ingest stream from L0VE PC OBS Studio (obs/admin)",
      },
      directorProgramScene,
    ];

    // Add any extra OBS cameras discovered in snapshot
    for (const cam of snapshot?.cameras ?? []) {
      if (cam.tags?.includes("obs") || cam.id.startsWith("obs-")) {
        const id = cam.id;
        if (!list.some((s) => s.id === id || s.id === cam.slug)) {
          list.push({
            id,
            title: `OBS Ingest: ${cam.name}`,
            badge: "OBS INGEST",
            category: "obs",
            cameraIds: [id],
            playbackUrl: cam.playbackUrl || `https://media.tank.unenter.live/obs/${cam.slug}/whep`,
            playbackProtocol: cam.playbackProtocol || "whep",
            online: cam.presence === "online" || cam.presence === "degraded",
            description: `Stream ingest for ${cam.slug}`,
          });
        }
      }
    }

    // Add physical house rooms
    for (const room of rooms) {
      if (!list.some((s) => s.id === room.roomKey)) {
        const cam = liveById.get(room.cameraIds[0] ?? "");
        list.push({
          id: room.roomKey,
          title: room.title,
          badge: "ROOM",
          category: "room",
          cameraIds: room.cameraIds,
          playbackUrl: cam?.playbackUrl ?? null,
          playbackProtocol: cam?.playbackProtocol ?? "whep",
          online: room.anyOnline,
          description: room.description || `${room.title} camera feed`,
        });
      }
    }

    return list;
    // directorProgramScene belongs here: without it the scene list keeps the
    // first programme entry it ever built, so the compositor would go on
    // showing whichever camera the director happened to be on when this panel
    // mounted and never follow a cut.
  }, [rooms, snapshot, liveById, directorProgramScene]);

  // Selected scene (defaults to the live running OBS stream)
  const [selectedRoomKey, setSelectedRoomKey] = useState<string>("obs-admin");
  const [sceneCategoryFilter, setSceneCategoryFilter] = useState<"all" | "obs" | "room">("all");

  const [roomScenes, setRoomScenes] = useState<Record<string, SceneSourceItem[]>>(() => {
    try {
      const saved = safeStorage.getItem(STORAGE_KEY_SCENES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch {}
    return {
      "obs-admin": DEFAULT_SOURCES,
      "director": DEFAULT_SOURCES,
      "game-room": DEFAULT_SOURCES,
      "living-room": DEFAULT_SOURCES,
    };
  });

  // Save changes to client safeStorage
  useEffect(() => {
    try {
      safeStorage.setItem(STORAGE_KEY_SCENES, JSON.stringify(roomScenes));
    } catch {}
  }, [roomScenes]);

  const [roomResolutions, setRoomResolutions] = useState<Record<string, string>>({
    "obs-admin": "1080p_fhd",
    "director": "1080p_fhd",
    "living-room": "4k_uhd",
    "game-room": "1080p_fhd",
    "irl-backpack": "irl_vertical",
    "irl-1": "irl_vertical",
    "basement": "usb_sd",
  });

  const [activeSourceId, setActiveSourceId] = useState<string>("src_hud");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedOverlayId, setCopiedOverlayId] = useState<string | null>(null);
  const [studioMode, setStudioMode] = useState(false);
  const [testFired, setTestFired] = useState(false);

  // OBS Room Creation Modal State
  const [isCreateObsModalOpen, setIsCreateObsModalOpen] = useState(false);
  const [obsTitle, setObsTitle] = useState("");
  const [obsSlug, setObsSlug] = useState("");
  const [obsDescription, setObsDescription] = useState("");
  const [isCreatingObs, setIsCreatingObs] = useState(false);
  const [obsResult, setObsResult] = useState<CreateObsRoomResult | null>(null);
  const [copiedStreamKey, setCopiedStreamKey] = useState(false);
  const [copiedRtmp, setCopiedRtmp] = useState(false);

  // Custom Source Modal State
  const [isCustomOverlayOpen, setIsCustomOverlayOpen] = useState(false);
  const [customOverlayName, setCustomOverlayName] = useState("");
  const [customOverlayUrl, setCustomOverlayUrl] = useState("");

  // PiP Camera Picker Modal State
  const [isPipModalOpen, setIsPipModalOpen] = useState(false);

  const handleCreateObsRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obsTitle.trim() || isCreatingObs) return;
    setIsCreatingObs(true);
    const res = await createObsStreamRoom(obsTitle, obsSlug, obsDescription);
    setIsCreatingObs(false);
    if (res.success) {
      setObsResult(res);
    } else {
      alert(res.error || "Failed to create OBS stream room.");
    }
  };

  // Resolve active composite scene and video stream
  const activeScene = compositeScenes.find((s) => s.id === selectedRoomKey) ?? compositeScenes[0];
  const activePlaybackUrl = activeScene?.playbackUrl ?? null;
  const activePlaybackProtocol = activeScene?.playbackProtocol ?? "whep";
  const isFeedOnline = activeScene?.online ?? false;

  // Active resolution profile resolution
  const activeProfileId =
    roomResolutions[selectedRoomKey] ??
    (selectedRoomKey.includes("irl")
      ? "irl_vertical"
      : selectedRoomKey.includes("4k") || selectedRoomKey.includes("living")
      ? "4k_uhd"
      : "1080p_fhd");
  const activeProfile = CANVAS_PROFILES[activeProfileId] ?? CANVAS_PROFILES["1080p_fhd"];

  // Dragging state
  const canvasRef = useRef<HTMLDivElement>(null);
  const [draggingSourceId, setDraggingSourceId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ offsetX: number; offsetY: number }>({ offsetX: 0, offsetY: 0 });

  const currentSources = roomScenes[selectedRoomKey] ?? DEFAULT_SOURCES;
  const activeSource = currentSources.find((s) => s.id === activeSourceId) ?? currentSources[0];

  const setResolutionForRoom = (profileId: string) => {
    setRoomResolutions((prev) => ({ ...prev, [selectedRoomKey]: profileId }));
  };

  // Source Mutation Helpers
  const updateSource = (id: string, partial: Partial<SceneSourceItem>) => {
    setRoomScenes((prev) => {
      const existing = prev[selectedRoomKey] ?? DEFAULT_SOURCES;
      const updated = existing.map((s) => (s.id === id ? { ...s, ...partial } : s));
      return { ...prev, [selectedRoomKey]: updated };
    });
  };

  const toggleVisibility = (id: string) => {
    const s = currentSources.find((item) => item.id === id);
    if (s) updateSource(id, { visible: !s.visible });
  };

  const toggleLocked = (id: string) => {
    const s = currentSources.find((item) => item.id === id);
    if (s) updateSource(id, { locked: !s.locked });
  };

  const moveLayer = (id: string, direction: "up" | "down") => {
    const idx = currentSources.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= currentSources.length) return;

    const newSources = [...currentSources];
    const temp = newSources[idx];
    newSources[idx] = newSources[targetIdx];
    newSources[targetIdx] = temp;

    // Re-index zIndex
    const reindexed = newSources.map((item, i) => ({ ...item, zIndex: (i + 1) * 2 }));
    setRoomScenes((prev) => ({ ...prev, [selectedRoomKey]: reindexed }));
  };

  const deleteSource = (id: string) => {
    setRoomScenes((prev) => ({
      ...prev,
      [selectedRoomKey]: (prev[selectedRoomKey] ?? DEFAULT_SOURCES).filter((s) => s.id !== id),
    }));
    if (activeSourceId === id) {
      setActiveSourceId("src_cam");
    }
  };

  const addSource = (type: SceneSourceType) => {
    const newId = `src_${type}_${Date.now()}`;
    const newSource: SceneSourceItem = {
      id: newId,
      name: `New ${type.toUpperCase()} Layer`,
      type,
      visible: true,
      locked: false,
      x: 30,
      y: 30,
      w: 40,
      h: 20,
      zIndex: (currentSources.length + 1) * 2,
      opacity: 1,
      url: type === "browser" ? "/obs/chat" : undefined,
      text: type === "text" ? "OVERLAY HUD TEXT" : undefined,
    };
    setRoomScenes((prev) => ({
      ...prev,
      [selectedRoomKey]: [...(prev[selectedRoomKey] ?? DEFAULT_SOURCES), newSource],
    }));
    setActiveSourceId(newId);
  };

  const addOverlayPreset = (preset: OverlayPreset) => {
    const newId = `src_${preset.id}_${Date.now()}`;
    const newSource: SceneSourceItem = {
      id: newId,
      name: preset.name,
      type: "browser",
      visible: true,
      locked: false,
      x: preset.x,
      y: preset.y,
      w: preset.w,
      h: preset.h,
      zIndex: (currentSources.length + 1) * 2,
      opacity: 1,
      url: preset.url,
      chromaKey: preset.chromaKey,
      audioOnly: preset.audioOnly,
    };
    setRoomScenes((prev) => ({
      ...prev,
      [selectedRoomKey]: [...(prev[selectedRoomKey] ?? DEFAULT_SOURCES), newSource],
    }));
    setActiveSourceId(newId);
  };

  const handleAddCustomOverlay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customOverlayUrl.trim()) return;
    const newId = `src_custom_${Date.now()}`;
    const newSource: SceneSourceItem = {
      id: newId,
      name: customOverlayName.trim() || "Custom Browser Layer",
      type: "browser",
      visible: true,
      locked: false,
      x: 20,
      y: 20,
      w: 60,
      h: 40,
      zIndex: (currentSources.length + 1) * 2,
      opacity: 1,
      url: customOverlayUrl.trim(),
    };
    setRoomScenes((prev) => ({
      ...prev,
      [selectedRoomKey]: [...(prev[selectedRoomKey] ?? DEFAULT_SOURCES), newSource],
    }));
    setActiveSourceId(newId);
    setIsCustomOverlayOpen(false);
    setCustomOverlayName("");
    setCustomOverlayUrl("");
  };

  const handleAddPipCamera = (camId: string, camName: string) => {
    const newId = `src_pip_${Date.now()}`;
    const newSource: SceneSourceItem = {
      id: newId,
      name: `PiP: ${camName}`,
      type: "camera",
      visible: true,
      locked: false,
      x: 65,
      y: 65,
      w: 32,
      h: 30,
      zIndex: (currentSources.length + 1) * 2,
      opacity: 1,
      customCss: camId, // stores camera id for PiP
    };
    setRoomScenes((prev) => ({
      ...prev,
      [selectedRoomKey]: [...(prev[selectedRoomKey] ?? DEFAULT_SOURCES), newSource],
    }));
    setActiveSourceId(newId);
    setIsPipModalOpen(false);
  };

  // Dragging logic on canvas
  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const source = currentSources.find((s) => s.id === id);
    if (!source || source.locked) return;

    setActiveSourceId(id);
    setDraggingSourceId(id);

    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const clickXPercent = ((e.clientX - rect.left) / rect.width) * 100;
      const clickYPercent = ((e.clientY - rect.top) / rect.height) * 100;
      setDragOffset({
        offsetX: clickXPercent - source.x,
        offsetY: clickYPercent - source.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingSourceId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const rawX = ((e.clientX - rect.left) / rect.width) * 100 - dragOffset.offsetX;
    const rawY = ((e.clientY - rect.top) / rect.height) * 100 - dragOffset.offsetY;

    // Constrain to canvas bounds (0 to 100 - width)
    const source = currentSources.find((s) => s.id === draggingSourceId);
    if (!source) return;

    const clampedX = Math.max(0, Math.min(100 - source.w, Math.round(rawX)));
    const clampedY = Math.max(0, Math.min(100 - source.h, Math.round(rawY)));

    updateSource(draggingSourceId, { x: clampedX, y: clampedY });
  };

  const handleMouseUp = () => {
    setDraggingSourceId(null);
  };

  const handleCopyObsUrl = () => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://tank.unenter.live";
    let url = "";
    if (selectedRoomKey === "director") {
      url = `${origin}/obs/director?volume=100`;
    } else if (selectedRoomKey === "obs-admin" || selectedRoomKey === "admin") {
      url = `${origin}/overlay/admin?width=${activeProfile.width}&height=${activeProfile.height}`;
    } else {
      url = `${origin}/overlay/${selectedRoomKey}?width=${activeProfile.width}&height=${activeProfile.height}&fps=${activeProfile.fps}`;
    }
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const handleCopyOverlayDirect = (urlPath: string, presetId: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://tank.unenter.live";
    navigator.clipboard.writeText(`${origin}${urlPath}`);
    setCopiedOverlayId(presetId);
    setTimeout(() => setCopiedOverlayId(null), 2000);
  };

  const handleFireTest = () => {
    setTestFired(true);
    setTimeout(() => setTestFired(false), 3000);
  };

  // Filtered scenes
  const visibleScenes = useMemo(() => {
    if (sceneCategoryFilter === "obs") {
      return compositeScenes.filter((s) => s.category === "obs" || s.category === "program");
    }
    if (sceneCategoryFilter === "room") {
      return compositeScenes.filter((s) => s.category === "room");
    }
    return compositeScenes;
  }, [compositeScenes, sceneCategoryFilter]);

  return (
    <div className="space-y-4 font-sans select-none">
      {/* ═══════════ TOP OBS TOOLBAR STRIP ═══════════ */}
      <ChromePanel withScrews>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: OBS / TouchDesigner Room Compositor Title */}
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded border border-[#ff4d00]/50 bg-black/80 text-[#ff4d00] shadow-[0_0_12px_rgba(255,77,0,0.3)]">
              <Tv className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-black uppercase tracking-wider text-[#241f14]"
                  style={{ fontFamily: ACTIVE_THEME.fonts.label }}
                >
                  OBS STUDIO COMPOSITOR &amp; OVERLAYS
                </span>
                <span className="flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-black uppercase text-white shadow animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  {activeScene.title}
                </span>
              </div>
              <p className="text-[11px] font-semibold text-[#5a5442]">
                {activeProfile.width}x{activeProfile.height} ({activeProfile.aspectRatio}) @ {activeProfile.fps} FPS · {activeScene.description}
              </p>
            </div>
          </div>

          {/* Right: Actions & Resolution Selector */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Resolution Profile Dropdown & Badge */}
            <div className="flex items-center gap-1.5 rounded border border-black/30 bg-black/50 px-2 py-1 shadow-inner">
              <Maximize2 className="h-3.5 w-3.5 text-orange-400 shrink-0" />
              <select
                value={activeProfileId}
                onChange={(e) => setResolutionForRoom(e.target.value)}
                className="bg-transparent text-[11px] font-black uppercase text-orange-300 focus:outline-none cursor-pointer"
              >
                {Object.values(CANVAS_PROFILES).map((prof) => (
                  <option key={prof.id} value={prof.id} className="bg-[#1a1b1e] text-white">
                    {prof.name} ({prof.width}x{prof.height} · {prof.aspectRatio})
                  </option>
                ))}
              </select>
            </div>

            <ConsoleButton
              variant={studioMode ? "orange" : "gray"}
              onClick={() => setStudioMode(!studioMode)}
              className="!py-1.5 text-xs"
            >
              <Sliders className="h-3.5 w-3.5" />
              Studio Mode
            </ConsoleButton>

            <ConsoleButton
              variant="gray"
              onClick={handleCopyObsUrl}
              className="!py-1.5 text-xs"
            >
              {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedUrl ? "Copied OBS URL" : "Copy Scene OBS Link"}
            </ConsoleButton>

            {/* One import instead of building six browser sources by hand. */}
            <ConsoleButton
              onClick={handleDownloadScene}
              className="!py-1.5 text-xs"
            >
              {sceneDownloaded ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {sceneDownloaded ? "Scene Downloaded" : "Download OBS Scene"}
            </ConsoleButton>

            <ConsoleButton
              variant="orange"
              onClick={handleFireTest}
              className="!py-1.5 text-xs shadow-[0_0_10px_rgba(255,77,0,0.3)]"
            >
              <Zap className="h-3.5 w-3.5" />
              {testFired ? "Overlays Pulsed!" : "Fire Test Overlays"}
            </ConsoleButton>
          </div>
        </div>
      </ChromePanel>

      {/* ═══════════ MAIN STUDIO WORKSPACE (3-Column OBS Layout) ═══════════ */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* ── LEFT DOCK: Scenes & Room Sources (4 Cols) ── */}
        <div className="space-y-4 lg:col-span-4">
          {/* 1. SCENES DOCK (Rooms & Running OBS Ingests) */}
          <ChromePanel withScrews>
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-black/20 pb-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#241f14]">
                  🎬 Scenes ({compositeScenes.length} Feeds)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setObsResult(null);
                      setIsCreateObsModalOpen(true);
                    }}
                    className="rounded bg-orange-600 px-2 py-0.5 text-[9px] font-black uppercase text-white shadow hover:bg-orange-500 transition"
                  >
                    + OBS Room
                  </button>
                </div>
              </div>

              {/* Category Filters */}
              <div className="flex items-center gap-1 border-b border-black/10 pb-1.5">
                <button
                  type="button"
                  onClick={() => setSceneCategoryFilter("all")}
                  className={`rounded px-2 py-0.5 text-[9px] font-black uppercase transition ${
                    sceneCategoryFilter === "all"
                      ? "bg-black text-white"
                      : "bg-black/10 text-slate-700 hover:bg-black/20"
                  }`}
                >
                  All ({compositeScenes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSceneCategoryFilter("obs")}
                  className={`rounded px-2 py-0.5 text-[9px] font-black uppercase transition ${
                    sceneCategoryFilter === "obs"
                      ? "bg-red-700 text-white"
                      : "bg-red-950/20 text-red-700 hover:bg-red-900/30"
                  }`}
                >
                  🔴 OBS &amp; Program
                </button>
                <button
                  type="button"
                  onClick={() => setSceneCategoryFilter("room")}
                  className={`rounded px-2 py-0.5 text-[9px] font-black uppercase transition ${
                    sceneCategoryFilter === "room"
                      ? "bg-cyan-800 text-white"
                      : "bg-cyan-950/20 text-cyan-800 hover:bg-cyan-900/30"
                  }`}
                >
                  📹 Rooms
                </button>
              </div>

              {/* Scenes List */}
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                {visibleScenes.map((scene) => {
                  const isSelected = selectedRoomKey === scene.id;
                  const isObs = scene.category === "obs" || scene.category === "program";

                  return (
                    <button
                      key={scene.id}
                      type="button"
                      onClick={() => setSelectedRoomKey(scene.id)}
                      className={`flex w-full items-center justify-between rounded p-2 text-left text-xs font-black transition ${
                        isSelected
                          ? "border-2 border-orange-500 bg-[#1a1b1e] text-orange-400 shadow-[0_0_12px_rgba(255,77,0,0.3)]"
                          : "border border-black/20 bg-black/5 text-[#241f14] hover:bg-black/15"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                            scene.online
                              ? isObs
                                ? "bg-red-500 animate-pulse"
                                : "bg-emerald-500"
                              : "bg-slate-400"
                          }`}
                        />
                        <div className="truncate">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{scene.title}</span>
                          </div>
                          <span className="block text-[9px] font-normal text-slate-400 font-mono truncate">
                            {scene.description}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                            scene.category === "obs"
                              ? "bg-red-500/20 text-red-400 border border-red-500/40"
                              : scene.category === "program"
                              ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                              : "bg-black/20 text-slate-400 border border-white/10"
                          }`}
                        >
                          {scene.badge}
                        </span>
                        <span className="font-mono text-[9px] text-slate-400">
                          {roomScenes[scene.id]?.length ?? DEFAULT_SOURCES.length}L
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </ChromePanel>

          {/* 2. SOURCES DOCK (Layers Stack & Overlay Presets) */}
          <ChromePanel withScrews>
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-black/20 pb-1.5">
                <div className="flex items-center gap-1.5 text-[#241f14]">
                  <Layers className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-black uppercase tracking-wider">
                    Sources (Layer Stack)
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {/* Preset Overlay Dropdown */}
                  <select
                    onChange={(e) => {
                      const preset = OVERLAY_PRESETS.find((p) => p.id === e.target.value);
                      if (preset) addOverlayPreset(preset);
                      e.target.value = "";
                    }}
                    defaultValue=""
                    className="rounded bg-orange-600 px-2 py-0.5 text-[9px] font-black uppercase text-white hover:bg-orange-500 cursor-pointer shadow-sm outline-none"
                    title="Add Modular Director Overlay"
                  >
                    <option value="" disabled>+ Add Overlay</option>
                    {OVERLAY_PRESETS.map((p) => (
                      <option key={p.id} value={p.id} className="bg-[#1a1b1e] text-white">
                        {p.name}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => setIsCustomOverlayOpen(true)}
                    className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white hover:bg-black"
                    title="Add Custom Browser Overlay URL"
                  >
                    + URL
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsPipModalOpen(true)}
                    className="rounded bg-cyan-800 px-1.5 py-0.5 text-[9px] font-bold text-white hover:bg-cyan-700"
                    title="Add Picture-in-Picture Camera"
                  >
                    + PiP
                  </button>

                  <button
                    type="button"
                    onClick={() => addSource("text")}
                    className="rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white hover:bg-black"
                  >
                    + Text
                  </button>
                </div>
              </div>

              {/* Source Layers List */}
              <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
                {currentSources.map((source, idx) => {
                  const isActive = activeSourceId === source.id;
                  return (
                    <div
                      key={source.id}
                      onClick={() => setActiveSourceId(source.id)}
                      className={`flex items-center justify-between rounded border p-2 text-xs transition cursor-pointer ${
                        isActive
                          ? "border-orange-500/80 bg-orange-950/40 text-orange-200 shadow-sm"
                          : "border-black/20 bg-black/5 text-[#241f14] hover:bg-black/15"
                      }`}
                    >
                      {/* Left: Visibility + Lock + Icon + Name */}
                      <div className="flex items-center gap-2 min-w-0">
                        {/* Visibility Toggle */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleVisibility(source.id);
                          }}
                          className={`p-0.5 rounded hover:bg-black/20 ${source.visible ? "text-emerald-600" : "text-slate-400"}`}
                        >
                          {source.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        </button>

                        {/* Lock Toggle */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLocked(source.id);
                          }}
                          className={`p-0.5 rounded hover:bg-black/20 ${source.locked ? "text-red-600" : "text-slate-400"}`}
                        >
                          {source.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                        </button>

                        {/* Source Type Icon */}
                        {source.type === "camera" && <Tv className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
                        {source.type === "browser" && <Globe className="h-3.5 w-3.5 text-cyan-600 shrink-0" />}
                        {source.type === "text" && <Type className="h-3.5 w-3.5 text-yellow-600 shrink-0" />}
                        {source.type === "image" && <ImageIcon className="h-3.5 w-3.5 text-pink-600 shrink-0" />}

                        <span className="font-black truncate text-[11px]">{source.name}</span>
                      </div>

                      {/* Right: Reorder & Delete */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveLayer(source.id, "up");
                          }}
                          disabled={idx === currentSources.length - 1}
                          className="p-0.5 rounded hover:bg-black/20 disabled:opacity-30"
                        >
                          <MoveUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveLayer(source.id, "down");
                          }}
                          disabled={idx === 0}
                          className="p-0.5 rounded hover:bg-black/20 disabled:opacity-30"
                        >
                          <MoveDown className="h-3 w-3" />
                        </button>
                        {source.id !== "src_cam" && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSource(source.id);
                            }}
                            className="p-0.5 rounded hover:bg-red-500/20 text-red-600"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Copy Independent Overlays Footer */}
              <div className="mt-2 pt-2 border-t border-black/15">
                <span className="block text-[9px] font-black uppercase tracking-wider text-slate-500 mb-1">
                  ⚡ 1-Click Copy Overlays for OBS:
                </span>
                <div className="grid grid-cols-2 gap-1 text-[9px] font-mono">
                  {OVERLAY_PRESETS.slice(0, 4).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleCopyOverlayDirect(p.url, p.id)}
                      className="flex items-center justify-between rounded bg-black/5 hover:bg-black/15 px-2 py-1 text-left border border-black/10 transition"
                    >
                      <span className="truncate">{p.name.split(" ")[1]}</span>
                      {copiedOverlayId === p.id ? (
                        <Check className="h-2.5 w-2.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-2.5 w-2.5 text-slate-400" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </ChromePanel>
        </div>

        {/* ── CENTER & RIGHT DOCK: Interactive 16:9 Canvas Preview & Transform Inspector (8 Cols) ── */}
        <div className="space-y-4 lg:col-span-8">
          {/* 1. INTERACTIVE OBS CANVAS VIEWPORT */}
          <div className="rounded-xl border-2 border-black/80 bg-[#121316] p-2 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between px-2 pb-2 text-[10px] font-mono text-slate-400 border-b border-white/10 mb-2 gap-2">
              <div className="flex items-center gap-2">
                <span className="text-orange-400 font-bold uppercase">
                  OBS PROGRAM CANVAS // {activeScene.title}
                </span>
                <span className="rounded bg-orange-950/80 border border-orange-500/50 px-1.5 py-0.2 text-[8px] font-black uppercase text-orange-300">
                  {activeProfile.badge}
                </span>
                <span className="rounded bg-emerald-950/80 border border-emerald-500/50 px-1.5 py-0.2 text-[8px] font-black uppercase text-emerald-300">
                  {activeScene.badge}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-300">
                  {activeProfile.width}x{activeProfile.height} ({activeProfile.aspectRatio}) @ {activeProfile.fps} FPS
                </span>
                <a
                  href={
                    activeScene.id === "director"
                      ? "/obs/director"
                      : activeScene.id === "obs-admin" || activeScene.id === "admin"
                      ? "/overlay/admin"
                      : `/overlay/${activeScene.id}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[9px] font-bold text-orange-400 hover:text-orange-300 transition"
                  title="Open live browser source in new tab"
                >
                  <ExternalLink className="h-3 w-3" />
                  Live Preview
                </a>
              </div>
            </div>

            {/* Viewport Canvas Frame */}
            <div
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`relative w-full overflow-hidden rounded-lg bg-black border border-white/20 shadow-inner ${activeProfile.containerAspectClass}`}
            >
              {/* Background Video Stream (OBS Live feed or Room Camera) */}
              {activePlaybackUrl ? (
                <CameraPlayer
                  playbackUrl={activePlaybackUrl}
                  playbackProtocol={activePlaybackProtocol}
                  online={isFeedOnline}
                  muted={true}
                  className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-[#0d0e11] text-slate-500 font-mono text-xs">
                  [ STREAM FEED: {activeScene.title} ]
                </div>
              )}

              {/* Render Draggable / Toggleable Layers */}
              {currentSources
                .filter((s) => s.visible && s.id !== "src_cam")
                .map((source) => {
                  const isSelected = activeSourceId === source.id;
                  const isDragging = draggingSourceId === source.id;

                  // Picture in Picture feed resolver
                  const pipFeed = source.type === "camera" && source.customCss
                    ? liveById.get(source.customCss)
                    : null;

                  return (
                    <div
                      key={source.id}
                      onMouseDown={(e) => handleMouseDown(e, source.id)}
                      style={{
                        position: "absolute",
                        left: `${source.x}%`,
                        top: `${source.y}%`,
                        width: `${source.w}%`,
                        height: `${source.h}%`,
                        zIndex: source.zIndex,
                        opacity: source.opacity,
                        cursor: source.locked ? "default" : isDragging ? "grabbing" : "grab",
                      }}
                      // `group/layer` is what lets the label above reveal on
                      // hover without a per-layer hover state in React.
                      className={`group/layer transition-shadow ${
                        isSelected
                          ? "ring-2 ring-orange-500 shadow-[0_0_15px_rgba(255,77,0,0.5)]"
                          : "hover:ring-1 hover:ring-white/40"
                      }`}
                    >
                      {/* Layer Content Render */}
                      <div
                        className={`relative h-full w-full overflow-hidden rounded ${
                          source.type === "browser"
                            ? "bg-transparent"
                            : "border border-white/20 bg-black/60 backdrop-blur-sm p-2 text-white"
                        }`}
                      >
                        {/* Layer Label Tag — selected or hovered only.
                            Real OBS shows nothing for an unselected source, and
                            for good reason: a chip on every layer means the
                            canvas stops being a preview of the broadcast and
                            becomes a diagram of it. With six layers the labels
                            covered more of the programme than they described. */}
                        <div
                          className={`absolute top-1 left-1 z-20 flex items-center gap-1 rounded bg-black/85 px-1.5 py-0.5 text-[8px] font-black uppercase text-orange-400 pointer-events-none shadow border border-white/10 transition-opacity duration-150 ${
                            isSelected ? "opacity-100" : "opacity-0 group-hover/layer:opacity-100"
                          }`}
                        >
                          <span>{source.name}</span>
                          {/* An audio-only layer has no meaningful position, so
                              showing coordinates for it would only invite
                              someone to "fix" a rectangle that is working. */}
                          {source.audioOnly ? (
                            <span className="text-emerald-400">AUDIO ONLY</span>
                          ) : (
                            !source.locked && <span>({source.x}%, {source.y}%)</span>
                          )}
                        </div>

                        {/* Browser Overlay Real Live Preview via iframe */}
                        {source.type === "browser" && (
                          source.url ? (
                            <iframe
                              src={source.url}
                              title={source.name}
                              className="h-full w-full border-0 bg-transparent pointer-events-none"
                              tabIndex={-1}
                            />
                          ) : (
                            <div className="mt-4 flex h-[calc(100%-1.25rem)] w-full items-center justify-center rounded border border-dashed border-cyan-500/40 bg-cyan-950/20 text-center font-mono text-[10px] text-cyan-300">
                              🌐 EMPTY BROWSER SOURCE
                            </div>
                          )
                        )}

                        {/* Picture-in-Picture Camera Layer */}
                        {source.type === "camera" && pipFeed && pipFeed.playbackUrl && (
                          <CameraPlayer
                            playbackUrl={pipFeed.playbackUrl}
                            playbackProtocol={pipFeed.playbackProtocol}
                            online={isOnline(source.customCss || "")}
                            muted={true}
                            className="h-full w-full object-cover rounded pointer-events-none"
                          />
                        )}

                        {/* Text Source Preview */}
                        {source.type === "text" && (
                          <div
                            className="mt-3 text-xs font-black uppercase tracking-wider"
                            style={{ color: source.color || "#ffffff" }}
                          >
                            {source.text}
                          </div>
                        )}
                      </div>

                      {/* Selection Handles */}
                      {isSelected && (
                        <>
                          <span className="absolute -top-1 -left-1 h-2 w-2 rounded-full bg-orange-500 border border-white" />
                          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-orange-500 border border-white" />
                          <span className="absolute -bottom-1 -left-1 h-2 w-2 rounded-full bg-orange-500 border border-white" />
                          <span className="absolute -bottom-1 -right-1 h-2 w-2 rounded-full bg-orange-500 border border-white" />
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* 2. SOURCE PROPERTIES & TRANSFORM INSPECTOR */}
          {activeSource && (
            <ChromePanel withScrews>
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-black/20 pb-1.5">
                  <div className="flex items-center gap-2 text-[#241f14]">
                    <Settings2 className="h-4 w-4 text-orange-600" />
                    <span className="text-xs font-black uppercase tracking-wider">
                      Layer Properties: {activeSource.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-black/80 px-2 py-0.5 text-[9px] font-black uppercase text-orange-400">
                      {activeSource.type}
                    </span>
                    {activeSource.url && (
                      <a
                        href={activeSource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded bg-black/10 hover:bg-black/20 px-2 py-0.5 text-[9px] font-bold text-slate-700 transition"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        Test Link
                      </a>
                    )}

                    {/* Straight to this overlay's settings.
                        Without it, "change the caption on that layer" means
                        reading the URL, recognising which overlay it is,
                        switching decks and finding the card by hand. Only shown
                        when the URL actually resolves to one of ours — offering
                        it for an arbitrary browser source would send the
                        operator to edit settings that cannot affect it. */}
                    {(() => {
                      const overlay = getDirectorOverlayByRoute(activeSource.url);
                      if (!overlay) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => openInWorkshop(overlay.id)}
                          className="flex items-center gap-1 rounded bg-orange-600/90 hover:bg-orange-500 px-2 py-0.5 text-[9px] font-bold text-white transition"
                        >
                          <Settings2 className="h-2.5 w-2.5" />
                          Configure in Workshop
                        </button>
                      );
                    })()}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {/* Position X */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#4c4630] uppercase mb-1">
                      Pos X ({activeSource.x}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={90}
                      disabled={activeSource.locked}
                      value={activeSource.x}
                      onChange={(e) => updateSource(activeSource.id, { x: Number(e.target.value) })}
                      className="w-full accent-orange-500"
                    />
                  </div>

                  {/* Position Y */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#4c4630] uppercase mb-1">
                      Pos Y ({activeSource.y}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={90}
                      disabled={activeSource.locked}
                      value={activeSource.y}
                      onChange={(e) => updateSource(activeSource.id, { y: Number(e.target.value) })}
                      className="w-full accent-orange-500"
                    />
                  </div>

                  {/* Width */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#4c4630] uppercase mb-1">
                      Width ({activeSource.w}%)
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      disabled={activeSource.locked}
                      value={activeSource.w}
                      onChange={(e) => updateSource(activeSource.id, { w: Number(e.target.value) })}
                      className="w-full accent-orange-500"
                    />
                  </div>

                  {/* Height */}
                  <div>
                    <label className="block text-[10px] font-bold text-[#4c4630] uppercase mb-1">
                      Height ({activeSource.h}%)
                    </label>
                    <input
                      type="range"
                      min={5}
                      max={100}
                      disabled={activeSource.locked}
                      value={activeSource.h}
                      onChange={(e) => updateSource(activeSource.id, { h: Number(e.target.value) })}
                      className="w-full accent-orange-500"
                    />
                  </div>
                </div>

                {/* Browser URL Configuration */}
                {activeSource.type === "browser" && (
                  <div className="pt-2 border-t border-black/10 space-y-2">
                    <label className="block text-[10px] font-bold text-[#4c4630] uppercase">
                      Browser Source URL / Route
                    </label>
                    <input
                      type="text"
                      value={activeSource.url ?? ""}
                      onChange={(e) => updateSource(activeSource.id, { url: e.target.value })}
                      placeholder="/obs/director/hud or https://..."
                      className="w-full rounded border border-black/40 bg-black/90 px-3 py-1.5 text-xs text-emerald-400 font-mono"
                    />
                    {/* Quick Preset Buttons for URL */}
                    <div className="flex flex-wrap items-center gap-1 text-[9px] font-bold">
                      <span className="text-slate-500">Quick Switch:</span>
                      {OVERLAY_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => updateSource(activeSource.id, { url: p.url, name: p.name })}
                          className="rounded bg-black/10 hover:bg-black/20 px-2 py-0.5 text-slate-700"
                        >
                          {p.name.split(" ")[1]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Text Content Configuration */}
                {activeSource.type === "text" && (
                  <div className="pt-2 border-t border-black/10">
                    <label className="block text-[10px] font-bold text-[#4c4630] uppercase mb-1">
                      Text HUD Content
                    </label>
                    <input
                      type="text"
                      value={activeSource.text ?? ""}
                      onChange={(e) => updateSource(activeSource.id, { text: e.target.value })}
                      placeholder="ENTER OVERLAY TEXT"
                      className="w-full rounded border border-black/40 bg-black/90 px-3 py-1.5 text-xs text-orange-400 font-bold uppercase"
                    />
                  </div>
                )}
              </div>
            </ChromePanel>
          )}
        </div>
      </div>

      {/* ═══════════ CUSTOM OVERLAY MODAL ═══════════ */}
      {isCustomOverlayOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setIsCustomOverlayOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-orange-500/50 bg-[#16181c] p-5 shadow-2xl text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-black uppercase text-white mb-1">Add Custom Browser Source Layer</h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Enter any internal route or external widget URL (e.g. StreamElements, Kicklet, BotRix, or custom /obs/... path).
            </p>
            <form onSubmit={handleAddCustomOverlay} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Layer Label</label>
                <input
                  type="text"
                  value={customOverlayName}
                  onChange={(e) => setCustomOverlayName(e.target.value)}
                  placeholder="e.g. Kicklet Follower Alert"
                  className="w-full rounded border border-white/20 bg-black/60 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">Source URL *</label>
                <input
                  type="text"
                  required
                  value={customOverlayUrl}
                  onChange={(e) => setCustomOverlayUrl(e.target.value)}
                  placeholder="https://... or /obs/..."
                  className="w-full rounded border border-white/20 bg-black/60 px-3 py-2 text-xs font-mono text-emerald-400"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <ConsoleButton variant="gray" onClick={() => setIsCustomOverlayOpen(false)} className="!py-1 text-xs">
                  Cancel
                </ConsoleButton>
                <ConsoleButton variant="orange" type="submit" className="!py-1 text-xs font-bold">
                  Add Layer
                </ConsoleButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════ PICTURE-IN-PICTURE CAM PICKER MODAL ═══════════ */}
      {isPipModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setIsPipModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-cyan-500/50 bg-[#16181c] p-5 shadow-2xl text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-black uppercase text-white mb-1">Add Picture-in-Picture Camera Feed</h3>
            <p className="text-[11px] text-slate-400 mb-4">
              Select a house camera or live OBS stream to pin as a picture-in-picture box over the scene.
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
              {compositeScenes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleAddPipCamera(s.cameraIds[0] ?? s.id, s.title)}
                  className="flex flex-col rounded border border-white/10 bg-black/50 hover:border-cyan-400 p-2.5 text-left transition"
                >
                  <span className="text-xs font-black uppercase text-cyan-300">{s.title}</span>
                  <span className="text-[10px] text-slate-400 font-mono mt-0.5">{s.badge}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-3 border-t border-white/10 mt-4">
              <ConsoleButton variant="gray" onClick={() => setIsPipModalOpen(false)} className="!py-1 text-xs">
                Cancel
              </ConsoleButton>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ CREATE OBS ROOM MODAL ═══════════ */}
      {isCreateObsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setIsCreateObsModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-orange-500/50 bg-[#16181c] p-5 shadow-2xl text-slate-200 animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded bg-orange-950/60 border border-orange-500/40 text-orange-400">
                  <Tv className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Provision OBS Broadcast Room
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Creates a dedicated 24/7 room with authentic Tank RTMP/SRT stream keys.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateObsModalOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            {!obsResult ? (
              <form onSubmit={handleCreateObsRoom} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Room Display Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={obsTitle}
                    onChange={(e) => {
                      setObsTitle(e.target.value);
                      if (!obsSlug) {
                        setObsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
                      }
                    }}
                    placeholder="e.g. Esports Arena / Main Stage"
                    className="w-full rounded border border-white/20 bg-black/60 px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Room Slug / Route (tank.unenter.live/[slug])
                  </label>
                  <input
                    type="text"
                    value={obsSlug}
                    onChange={(e) => setObsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-"))}
                    placeholder="e.g. main-stage"
                    className="w-full rounded border border-white/20 bg-black/60 px-3 py-2 text-xs font-mono text-orange-300 placeholder-slate-500 focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Room Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={obsDescription}
                    onChange={(e) => setObsDescription(e.target.value)}
                    placeholder="Official live cast and guest camera feed..."
                    className="w-full rounded border border-white/20 bg-black/60 px-3 py-2 text-xs text-slate-300 placeholder-slate-500 focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                  <ConsoleButton
                    variant="gray"
                    onClick={() => setIsCreateObsModalOpen(false)}
                    className="!py-1.5 text-xs"
                  >
                    Cancel
                  </ConsoleButton>
                  <ConsoleButton
                    variant="orange"
                    disabled={isCreatingObs || !obsTitle.trim()}
                    className="!py-1.5 text-xs font-bold"
                  >
                    {isCreatingObs ? "Generating Stream Keys..." : "Create Room & Keys"}
                  </ConsoleButton>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg bg-emerald-950/60 border border-emerald-500/50 p-3 text-emerald-200">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-black uppercase">
                      Room Created: {obsTitle} ({obsResult.roomSlug})
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-300">
                    Your OBS ingest channel is live. Paste these credentials into OBS Settings &gt; Stream.
                  </p>
                </div>

                {/* RTMP Ingest Credentials */}
                <div className="space-y-2 text-xs font-mono">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400 font-sans mb-1">
                      1. Server (RTMP URL)
                    </span>
                    <div className="flex items-center gap-2 bg-black/80 border border-white/10 rounded p-2">
                      <span className="flex-1 text-slate-300 truncate">{obsResult.rtmpUrl}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(obsResult.rtmpUrl || "");
                          setCopiedRtmp(true);
                          setTimeout(() => setCopiedRtmp(false), 2000);
                        }}
                        className="text-[10px] uppercase font-bold text-orange-400 hover:text-orange-300 font-sans"
                      >
                        {copiedRtmp ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400 font-sans mb-1">
                      2. Stream Key (Tank Authenticated Key)
                    </span>
                    <div className="flex items-center gap-2 bg-black/80 border border-orange-500/40 rounded p-2">
                      <span className="flex-1 text-orange-300 truncate">{obsResult.streamKey}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(obsResult.streamKey || "");
                          setCopiedStreamKey(true);
                          setTimeout(() => setCopiedStreamKey(false), 2000);
                        }}
                        className="text-[10px] uppercase font-bold text-orange-400 hover:text-orange-300 font-sans"
                      >
                        {copiedStreamKey ? "Copied!" : "Copy Key"}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="block text-[10px] uppercase font-bold text-slate-400 font-sans mb-1">
                      3. SRT Caller URL (Ultra Low Latency)
                    </span>
                    <div className="flex items-center gap-2 bg-black/80 border border-white/10 rounded p-2">
                      <span className="flex-1 text-slate-400 text-[10px] truncate">{obsResult.srtUrl}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(obsResult.srtUrl || "");
                        }}
                        className="text-[10px] uppercase font-bold text-slate-400 hover:text-white font-sans"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t border-white/10">
                  <ConsoleButton
                    variant="orange"
                    onClick={() => {
                      setIsCreateObsModalOpen(false);
                      setObsResult(null);
                      setObsTitle("");
                      setObsSlug("");
                      setObsDescription("");
                    }}
                    className="w-full !py-1.5 text-xs font-bold"
                  >
                    Done &amp; Open Studio Room
                  </ConsoleButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ObsStudioCompositorPanel;
