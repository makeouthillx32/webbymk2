"use client";

import React, { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { ACTIVE_THEME } from "../theme";
import { ChromePanel } from "../public/components/ChromePanel";
import { ConsoleButton } from "../public/components/ConsoleButton";
import { CameraPlayer } from "../public/CameraPlayer";
import { useTankCameras } from "../public/useTankCameras";
import {
  createObsStreamRoom,
  type CreateObsRoomResult,
} from "../server/obsIngestActions";

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
};

export type RoomSceneConfig = {
  roomKey: string;
  roomTitle: string;
  cameraId: string;
  resolutionProfileId: string;
  sources: SceneSourceItem[];
};

const DEFAULT_SOURCES: SceneSourceItem[] = [
  {
    id: "src_cam",
    name: "Room Video Feed",
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
    id: "src_tts",
    name: "TTS Speech Bubble Overlay",
    type: "browser",
    visible: true,
    locked: false,
    x: 25,
    y: 15,
    w: 50,
    h: 25,
    zIndex: 10,
    opacity: 0.95,
    url: "/overlay/tts",
    chromaKey: true,
  },
  {
    id: "src_chat",
    name: "Live Chat Ticker",
    type: "browser",
    visible: true,
    locked: false,
    x: 5,
    y: 65,
    w: 40,
    h: 30,
    zIndex: 8,
    opacity: 0.9,
    url: "/overlay/chat",
  },
  {
    id: "src_title",
    name: "Room Watermark HUD",
    type: "text",
    visible: true,
    locked: false,
    x: 5,
    y: 5,
    w: 25,
    h: 8,
    zIndex: 15,
    opacity: 0.85,
    text: "TANK // LIVE ROOM",
    color: "#ff4d00",
  },
];

export function ObsStudioCompositorPanel({
  operatorRole = "admin",
}: {
  operatorRole?: "admin" | "moderator";
}) {
  const { snapshot, liveById, isOnline } = useTankCameras();
  const rooms = snapshot?.rooms ?? [];
  const [selectedRoomKey, setSelectedRoomKey] = useState<string>("game-room");
  const [roomScenes, setRoomScenes] = useState<Record<string, SceneSourceItem[]>>({
    "game-room": DEFAULT_SOURCES,
    "living-room": DEFAULT_SOURCES,
  });
  const [roomResolutions, setRoomResolutions] = useState<Record<string, string>>({
    "living-room": "4k_uhd",
    "game-room": "1080p_fhd",
    "irl-backpack": "irl_vertical",
    "irl-1": "irl_vertical",
    "basement": "usb_sd",
  });

  const [activeSourceId, setActiveSourceId] = useState<string>("src_tts");
  const [copiedUrl, setCopiedUrl] = useState(false);
  // Studio Mode toggle (preview/program split). Read and written by the
  // toggle below; without this declaration the panel threw a ReferenceError
  // as soon as it rendered.
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

  // Resolve camera feed for selected room
  const activeRoom = rooms.find((r) => r.roomKey === selectedRoomKey);
  const activeCamId = activeRoom?.cameraIds[0] ?? "cam-1786768240090";
  const activeFeed = liveById.get(activeCamId);

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
      url: type === "browser" ? "/overlay/poll" : undefined,
      text: type === "text" ? "OVERLAY HUD TEXT" : undefined,
    };
    setRoomScenes((prev) => ({
      ...prev,
      [selectedRoomKey]: [...(prev[selectedRoomKey] ?? DEFAULT_SOURCES), newSource],
    }));
    setActiveSourceId(newId);
  };

  // Dragging logic on canvas
  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    const s = currentSources.find((item) => item.id === id);
    if (!s || s.locked || !s.visible) return;

    e.preventDefault();
    setActiveSourceId(id);
    setDraggingSourceId(id);

    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const clickXPercent = ((e.clientX - rect.left) / rect.width) * 100;
      const clickYPercent = ((e.clientY - rect.top) / rect.height) * 100;
      setDragOffset({
        offsetX: clickXPercent - s.x,
        offsetY: clickYPercent - s.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingSourceId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const currentXPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const currentYPercent = ((e.clientY - rect.top) / rect.height) * 100;

    let newX = Math.round(currentXPercent - dragOffset.offsetX);
    let newY = Math.round(currentYPercent - dragOffset.offsetY);

    // Clamp inside canvas (0 - 100)
    newX = Math.max(0, Math.min(95, newX));
    newY = Math.max(0, Math.min(95, newY));

    updateSource(draggingSourceId, { x: newX, y: newY });
  };

  const handleMouseUp = () => {
    setDraggingSourceId(null);
  };

  const handleCopyObsUrl = () => {
    const url = `${
      typeof window !== "undefined" ? window.location.origin : "https://tank.unenter.live"
    }/overlay/${selectedRoomKey}?width=${activeProfile.width}&height=${
      activeProfile.height
    }&fps=${activeProfile.fps}&aspect=${encodeURIComponent(activeProfile.aspectRatio)}`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleFireTest = () => {
    setTestFired(true);
    setTimeout(() => setTestFired(false), 3000);
  };

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
                  OBS & TOUCHDESIGNER ROOM COMPOSITOR
                </span>
                <span className="flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-black uppercase text-white shadow animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  LIVE SCENE
                </span>
              </div>
              <p className="text-[11px] font-semibold text-[#5a5442]">
                {activeProfile.width}x{activeProfile.height} ({activeProfile.aspectRatio}) @ {activeProfile.fps} FPS · {activeProfile.name} Canvas Bridge
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
              {copiedUrl ? "Copied OBS URL" : "Copy OBS Browser Link"}
            </ConsoleButton>

            <ConsoleButton
              variant="orange"
              onClick={handleFireTest}
              className="!py-1.5 text-xs shadow-[0_0_10px_rgba(255,77,0,0.3)]"
            >
              <Zap className="h-3.5 w-3.5" />
              {testFired ? "Test Overlay Active!" : "Fire Test Trigger"}
            </ConsoleButton>
          </div>
        </div>
      </ChromePanel>

      {/* ═══════════ MAIN STUDIO WORKSPACE (3-Column OBS Layout) ═══════════ */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* ── LEFT DOCK: Scenes & Room Sources (4 Cols) ── */}
        <div className="space-y-4 lg:col-span-4">
          {/* 1. SCENES DOCK (Rooms List) */}
          <ChromePanel withScrews>
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-black/20 pb-1.5">
                <span className="text-[11px] font-black uppercase tracking-wider text-[#241f14]">
                  🎬 Scenes (Rooms)
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono text-[#5a5442]">
                    {rooms.length} Feeds
                  </span>
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

              <div className="space-y-1">
                {rooms.map((room) => {
                  const isSelected = selectedRoomKey === room.roomKey;
                  return (
                    <button
                      key={room.roomKey}
                      type="button"
                      onClick={() => setSelectedRoomKey(room.roomKey)}
                      className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs font-black transition ${
                        isSelected
                          ? "border border-orange-500 bg-[#1a1b1e] text-orange-400 shadow-[0_0_10px_rgba(255,77,0,0.2)]"
                          : "border border-black/20 bg-black/10 text-[#241f14] hover:bg-black/20"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${isSelected ? "bg-orange-500 animate-pulse" : "bg-slate-400"}`} />
                        <span>{room.title}</span>
                      </div>
                      <span className="font-mono text-[9px] text-slate-400">
                        {roomScenes[room.roomKey]?.length ?? DEFAULT_SOURCES.length} Layers
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </ChromePanel>

          {/* 2. SOURCES DOCK (Layers Stack) */}
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
                  <button
                    type="button"
                    onClick={() => addSource("browser")}
                    className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white hover:bg-black"
                  >
                    + Browser
                  </button>
                  <button
                    type="button"
                    onClick={() => addSource("text")}
                    className="rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white hover:bg-black"
                  >
                    + Text
                  </button>
                </div>
              </div>

              {/* Source Layers List */}
              <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
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
                  OBS PROGRAM CANVAS // {activeRoom?.title ?? selectedRoomKey}
                </span>
                <span className="rounded bg-orange-950/80 border border-orange-500/50 px-1.5 py-0.2 text-[8px] font-black uppercase text-orange-300">
                  {activeProfile.badge}
                </span>
              </div>
              <span className="text-slate-300">
                {activeProfile.width}x{activeProfile.height} ({activeProfile.aspectRatio}) @ {activeProfile.fps} FPS · {activeProfile.description}
              </span>
            </div>

            {/* Viewport Canvas Frame */}
            <div
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`relative w-full overflow-hidden rounded-lg bg-black border border-white/20 shadow-inner ${activeProfile.containerAspectClass}`}
            >
              {/* Background Video Stream */}
              {activeFeed && activeFeed.playbackUrl ? (
                <CameraPlayer
                  playbackUrl={activeFeed.playbackUrl}
                  playbackProtocol={activeFeed.playbackProtocol}
                  online={isOnline(activeCamId)}
                  muted={true}
                  className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center bg-[#0d0e11] text-slate-500 font-mono text-xs">
                  [ 1080P ROOM CAMERA FEED: {activeRoom?.title ?? selectedRoomKey} ]
                </div>
              )}

              {/* Render Draggable / Toggleable Layers */}
              {currentSources
                .filter((s) => s.visible && s.type !== "camera")
                .map((source) => {
                  const isSelected = activeSourceId === source.id;
                  const isDragging = draggingSourceId === source.id;

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
                      className={`transition-shadow ${
                        isSelected
                          ? "ring-2 ring-orange-500 shadow-[0_0_15px_rgba(255,77,0,0.5)]"
                          : "hover:ring-1 hover:ring-white/40"
                      }`}
                    >
                      {/* Layer Content Render */}
                      <div className="relative h-full w-full overflow-hidden rounded border border-white/20 bg-black/60 backdrop-blur-sm p-2 text-white">
                        {/* Layer Label Tag */}
                        <div className="absolute top-1 left-1 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[8px] font-black uppercase text-orange-400 pointer-events-none">
                          <span>{source.name}</span>
                          {!source.locked && <span>({source.x}%, {source.y}%)</span>}
                        </div>

                        {/* Browser Overlay Simulated Preview */}
                        {source.type === "browser" && (
                          <div className="mt-4 flex h-[calc(100%-1.25rem)] w-full items-center justify-center rounded border border-dashed border-cyan-500/40 bg-cyan-950/20 text-center font-mono text-[10px] text-cyan-300">
                            {source.id === "src_tts" ? (
                              <div className="p-2 animate-pulse">
                                📢 [TTS OVERLAY] "I love this room! 10/10 content!"
                              </div>
                            ) : (
                              <div>🌐 BROWSER SOURCE: {source.url}</div>
                            )}
                          </div>
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
                  <span className="rounded bg-black/80 px-2 py-0.5 text-[9px] font-black uppercase text-orange-400">
                    {activeSource.type}
                  </span>
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
                  <div className="pt-2 border-t border-black/10">
                    <label className="block text-[10px] font-bold text-[#4c4630] uppercase mb-1">
                      Browser Source URL / Route
                    </label>
                    <input
                      type="text"
                      value={activeSource.url ?? ""}
                      onChange={(e) => updateSource(activeSource.id, { url: e.target.value })}
                      placeholder="/overlay/tts or https://..."
                      className="w-full rounded border border-black/40 bg-black/90 px-3 py-1.5 text-xs text-emerald-400 font-mono"
                    />
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
                    Done & Open Studio Room
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
