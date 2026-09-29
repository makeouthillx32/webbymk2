"use client";

// src/zones/tank/house/RoomPortalStudio/RoomPortalStudioPanel.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Axis Doorway Enrolment & Spatial Calibration Studio
//
// Staff Room Doorway Management & Camera Re-alignment Console:
// Enables staff to enroll physical house doorways, bind them to cameras as
// cameras are moved or added, plot/drag 4-corner perspective boundaries,
// test teleportation clicks, and toggle an Axis-wide visibility mask so
// doorways remain completely hidden during manual director operations.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  DoorOpen,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Plus,
  Trash2,
  Check,
  Navigation,
  ArrowRight,
  Sparkles,
  Play,
  Pause,
  Undo2,
  Zap,
  Eye,
  EyeOff,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  Layers,
  ArrowLeft,
} from "lucide-react";
import type { DiscoveredCamera, PlaybackProtocol } from "../../contracts";
import { CameraPlayer } from "../../public/CameraPlayer";
import { getCameraLoopUrl, getRoomLoopUrl } from "../../mediaPlayback";
import {
  calculateQuadCentroid,
  isPortalPolygonValid,
  pointsToSvgViewBox,
  type Point2D,
  type QuadPolygon,
  type RoomPortal,
} from "../../vision/portalGeometry";
import {
  fetchPortalsForRoom,
  fetchAllPortals,
  upsertPortal,
  removePortal,
} from "../../server/portalActions";

type RoomPortalStudioPanelProps = {
  cameras: DiscoveredCamera[];
  initialRoomScope?: string;
  activeRoomScope?: string;
  onNavigateToRoom?: (roomSlug: string) => void;
};

type StudioTab = "canvas" | "roster" | "enroll";

export function RoomPortalStudioPanel({
  cameras,
  initialRoomScope,
  activeRoomScope,
  onNavigateToRoom,
}: RoomPortalStudioPanelProps) {
  // Available unique rooms across discovered cameras and core spaces
  const availableRooms = useMemo(() => {
    const set = new Set<string>();
    for (const c of cameras) {
      if (c.roomScope) set.add(c.roomScope);
    }
    ["foyer", "living-room", "kitchen", "bedroom", "makeup-room", "game-room", "game-room-2"].forEach((r) => set.add(r));
    return Array.from(set).sort();
  }, [cameras]);

  // Active studio view tab
  const [activeTab, setActiveTab] = useState<StudioTab>("canvas");

  // Independent room selection - initialized on mount, 100% decoupled from the director live stream
  const [selectedRoom, setSelectedRoom] = useState<string>(() => initialRoomScope || activeRoomScope || "foyer");
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");

  // Video element ref for offline loop player (supports frame freeze)
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  // Filter cameras available for the currently selected room
  const roomCameras = useMemo(() => {
    const matching = cameras.filter(
      (c) => c.roomScope === selectedRoom || c.id.includes(selectedRoom) || c.slug.includes(selectedRoom)
    );
    return matching.length > 0 ? matching : cameras;
  }, [cameras, selectedRoom]);

  // Current active camera for canvas preview
  const activeCamera = useMemo(() => {
    if (selectedCameraId) {
      const found = cameras.find((c) => c.id === selectedCameraId);
      if (found) return found;
    }
    return roomCameras[0] || cameras[0];
  }, [cameras, roomCameras, selectedCameraId]);

  // All enrolled portals in the house and portals for selected room
  const [allEnrolledPortals, setAllEnrolledPortals] = useState<RoomPortal[]>([]);
  const [portals, setPortals] = useState<RoomPortal[]>([]);
  const [loadingPortals, setLoadingPortals] = useState(false);

  // Axis Visibility Toggle: Hide doorway lines on Axis during manual director operation
  const [hideOverlaysOnAxis, setHideOverlaysOnAxis] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const saved = localStorage.getItem("tank_axis_hide_doorways");
      return saved !== null ? saved === "true" : false;
    } catch {
      return false;
    }
  });

  const toggleHideOverlaysOnAxis = useCallback(() => {
    setHideOverlaysOnAxis((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("tank_axis_hide_doorways", String(next));
      } catch {}
      return next;
    });
  }, []);

  // Zoom & Pan state for canvas
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Creation / Editing State
  const [isPlotting, setIsPlotting] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Point2D[]>([]);
  const [targetRoomSlug, setTargetRoomSlug] = useState<string>("living-room");
  const [portalTitle, setPortalTitle] = useState<string>("Living Room");
  const [direction, setDirection] = useState<"forward" | "left" | "right" | "back">("forward");
  const [selectedPortalId, setSelectedPortalId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // Enrolment Form State (for enrolling brand new doorways)
  const [enrollSourceRoom, setEnrollSourceRoom] = useState<string>(() => initialRoomScope || activeRoomScope || "foyer");
  const [enrollTargetRoom, setEnrollTargetRoom] = useState<string>("living-room");
  const [enrollTitle, setEnrollTitle] = useState<string>("");
  const [enrollDirection, setEnrollDirection] = useState<"forward" | "left" | "right" | "back">("forward");
  const [enrollCameraId, setEnrollCameraId] = useState<string>("");

  // Video freeze toggle
  const [isFrozen, setIsFrozen] = useState(false);

  // Sync freeze state to video element
  useEffect(() => {
    if (!videoElRef.current) return;
    if (isFrozen) {
      videoElRef.current.pause();
    } else {
      void videoElRef.current.play().catch(() => {});
    }
  }, [isFrozen]);

  // Resolve reliable clip loop URL for the active camera / selected room
  const clipUrl = useMemo(() => {
    return (
      activeCamera?.recentClipUrl ||
      (activeCamera as any)?.prerollLoopUrl ||
      (activeCamera?.id ? getCameraLoopUrl(activeCamera.id) : null) ||
      (selectedRoom ? getRoomLoopUrl(selectedRoom) : null) ||
      (selectedRoom ? getCameraLoopUrl(selectedRoom) : null) ||
      null
    );
  }, [activeCamera, selectedRoom]);

  const effectivePlaybackUrl = activeCamera?.playbackUrl || null;
  const effectiveProtocol: PlaybackProtocol =
    activeCamera?.playbackProtocol === "whep" || activeCamera?.playbackProtocol === "hls"
      ? activeCamera.playbackProtocol
      : effectivePlaybackUrl
      ? "whep"
      : "none";

  // Pin Dragging State
  const [draggingPinIndex, setDraggingPinIndex] = useState<number | null>(null);

  // Simulation State
  const [simulatedHit, setSimulatedHit] = useState<{ portal: RoomPortal; timestamp: number } | null>(null);

  // Roster room filter
  const [rosterRoomFilter, setRosterRoomFilter] = useState<string>("all");

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);

  // Reload all portals and current room portals
  const refreshPortals = useCallback(async () => {
    setLoadingPortals(true);
    try {
      const [all, currentRoom] = await Promise.all([
        fetchAllPortals(),
        fetchPortalsForRoom(selectedRoom),
      ]);
      if (all) setAllEnrolledPortals(all);
      if (currentRoom) setPortals(currentRoom);
    } catch {}
    setLoadingPortals(false);
  }, [selectedRoom]);

  useEffect(() => {
    void refreshPortals();
  }, [refreshPortals]);

  // Handle canvas click to plot pins
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingPinIndex !== null) return;
    if (!isPlotting || draftPoints.length >= 12) return;
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    const rawX = (e.clientX - rect.left) / rect.width;
    const rawY = (e.clientY - rect.top) / rect.height;

    const nx = Math.max(0, Math.min(1, parseFloat(rawX.toFixed(4))));
    const ny = Math.max(0, Math.min(1, parseFloat(rawY.toFixed(4))));

    setDraftPoints((prev) => [...prev, { nx, ny }]);
  };

  // Pin dragging logic
  const handlePinPointerDown = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
    setDraggingPinIndex(idx);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingPinIndex === null) return;
    const rect = canvasContainerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return;

    const rawX = (e.clientX - rect.left) / rect.width;
    const rawY = (e.clientY - rect.top) / rect.height;

    const nx = Math.max(0, Math.min(1, parseFloat(rawX.toFixed(4))));
    const ny = Math.max(0, Math.min(1, parseFloat(rawY.toFixed(4))));

    setDraftPoints((prev) => {
      const next = [...prev];
      next[draggingPinIndex] = { nx, ny };
      return next;
    });
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingPinIndex !== null) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setDraggingPinIndex(null);
    }
  };

  const handleStartPlotting = () => {
    setIsPlotting(true);
    setDraftPoints([]);
    setSelectedPortalId(null);
    setSaveStatus(null);
  };

  const handleAddStandardFrame = () => {
    setIsPlotting(true);
    setDraftPoints([
      { nx: 0.38, ny: 0.2 },
      { nx: 0.62, ny: 0.2 },
      { nx: 0.65, ny: 0.85 },
      { nx: 0.35, ny: 0.85 },
    ]);
  };

  const handleUndoPoint = () => {
    setDraftPoints((prev) => prev.slice(0, -1));
  };

  const handleResetPlotting = () => {
    setIsPlotting(false);
    setDraftPoints([]);
    setSelectedPortalId(null);
    setDraggingPinIndex(null);
  };

  // Save or update doorway calibration
  const handleSaveDraft = async () => {
    if (draftPoints.length < 4 || !isPortalPolygonValid(draftPoints)) {
      setSaveStatus("Error: use 4-12 perimeter points without crossing the doorway edges.");
      return;
    }

    setSaveStatus("Saving doorway calibration...");
    const res = await upsertPortal({
      id: selectedPortalId || undefined,
      sourceRoomSlug: selectedRoom,
      sourceCameraId: activeCamera?.id,
      targetRoomSlug,
      title: portalTitle.trim() || targetRoomSlug,
      polygon: draftPoints,
      direction,
      displayMode: "invisible_hitbox",
      icon: "door",
      enabled: true,
    });

    if (res.ok && res.portal) {
      setSaveStatus("Doorway calibrated & saved successfully!");
      setIsPlotting(false);
      setDraftPoints([]);
      setSelectedPortalId(null);
      await refreshPortals();
      setTimeout(() => setSaveStatus(null), 3500);
    } else {
      setSaveStatus(`Failed to save: ${res.error || "Unknown error"}`);
    }
  };

  // Select a portal from the list to calibrate or adjust pins on canvas
  const handleSelectPortalForCalibration = (portal: RoomPortal) => {
    setSelectedPortalId(portal.id);
    setSelectedRoom(portal.sourceRoomSlug);
    if (portal.sourceCameraId) {
      setSelectedCameraId(portal.sourceCameraId);
    }
    setDraftPoints([...portal.polygon]);
    setTargetRoomSlug(portal.targetRoomSlug);
    setPortalTitle(portal.title);
    setDirection((portal.direction as any) || "forward");
    setIsPlotting(true);
    setActiveTab("canvas");
  };

  // Rebind a portal to a new camera when cameras move
  const handleRebindCamera = async (portal: RoomPortal, newCameraId: string) => {
    const updated = {
      ...portal,
      sourceCameraId: newCameraId,
    };
    await upsertPortal(updated);
    await refreshPortals();
  };

  const handleDeletePortal = async (id: string) => {
    await removePortal(id);
    if (selectedPortalId === id) {
      setSelectedPortalId(null);
      setDraftPoints([]);
    }
    await refreshPortals();
  };

  // Enrolling a brand new door
  const handleEnrollNewDoor = async () => {
    const targetTitle = enrollTitle.trim() || `${enrollTargetRoom.replace("-", " ")} Door`;
    const defaultCamera = enrollCameraId || cameras.find((c) => c.roomScope === enrollSourceRoom)?.id;

    // Create enrolled record with standard perspective frame
    const defaultQuad: QuadPolygon = [
      { nx: 0.38, ny: 0.2 },
      { nx: 0.62, ny: 0.2 },
      { nx: 0.65, ny: 0.85 },
      { nx: 0.35, ny: 0.85 },
    ];

    const res = await upsertPortal({
      sourceRoomSlug: enrollSourceRoom,
      sourceCameraId: defaultCamera,
      targetRoomSlug: enrollTargetRoom,
      title: targetTitle,
      polygon: defaultQuad,
      direction: enrollDirection,
      displayMode: "invisible_hitbox",
      icon: "door",
      enabled: true,
    });

    if (res.ok && res.portal) {
      await refreshPortals();
      // Directly load this new doorway into the canvas for corner calibration
      handleSelectPortalForCalibration(res.portal);
      setEnrollTitle("");
    }
  };

  // Simulate viewer tap
  const handleSimulateClick = (targetPortal?: RoomPortal) => {
    const portalToTest =
      targetPortal ||
      (draftPoints.length >= 4 && isPortalPolygonValid(draftPoints)
        ? {
            id: "draft-sim",
            sourceRoomSlug: selectedRoom,
            targetRoomSlug,
            title: portalTitle || targetRoomSlug,
            polygon: draftPoints,
            direction,
            displayMode: "invisible_hitbox" as const,
            icon: "door",
            enabled: true,
          }
        : null);

    if (!portalToTest) return;

    setSimulatedHit({ portal: portalToTest, timestamp: Date.now() });
    setTimeout(() => {
      setSimulatedHit(null);
    }, 600);
  };

  // Filtered portals in roster
  const filteredRoster = useMemo(() => {
    if (rosterRoomFilter === "all") return allEnrolledPortals;
    return allEnrolledPortals.filter((p) => p.sourceRoomSlug === rosterRoomFilter);
  }, [allEnrolledPortals, rosterRoomFilter]);

  return (
    <div className="rounded-xl border border-black/80 bg-[#14151a] p-4 text-white shadow-2xl space-y-4">
      {/* ── HEADER & NAVIGATION CONTROLS ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 text-black shadow-md">
            <DoorOpen className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black uppercase tracking-wider text-orange-400">
                Staff Doorway Enrolment & Spatial Matrix
              </h3>
              <span className="rounded bg-orange-950/60 border border-orange-500/40 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-orange-300">
                {allEnrolledPortals.length} DOORS ENROLLED
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              Bind house entryways to cameras as hardware moves, shape multi-point doorframes, and mask on Axis
            </p>
          </div>
        </div>

        {/* Action Toolbar & Axis Mask Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center rounded-lg bg-black/60 p-1 border border-white/10 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab("canvas")}
              className={`rounded px-2.5 py-1 font-bold uppercase transition flex items-center gap-1.5 ${
                activeTab === "canvas"
                  ? "bg-orange-600 text-black shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Camera className="h-3.5 w-3.5" />
              <span>Canvas</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("roster")}
              className={`rounded px-2.5 py-1 font-bold uppercase transition flex items-center gap-1.5 ${
                activeTab === "roster"
                  ? "bg-orange-600 text-black shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Door Roster ({allEnrolledPortals.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("enroll")}
              className={`rounded px-2.5 py-1 font-bold uppercase transition flex items-center gap-1.5 ${
                activeTab === "enroll"
                  ? "bg-orange-600 text-black shadow"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Enroll Door</span>
            </button>
          </div>

          {/* AXIS VISIBILITY TOGGLE (Direct user requirement) */}
          <button
            type="button"
            onClick={toggleHideOverlaysOnAxis}
            className={`rounded-lg px-3 py-1.5 text-xs font-black uppercase tracking-wider flex items-center gap-2 border transition ${
              hideOverlaysOnAxis
                ? "border-slate-700 bg-slate-900/80 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                : "border-cyan-500/80 bg-cyan-950/50 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.25)]"
            }`}
            title="When Hidden, doorway boxes do not appear on Axis during manual director operation"
          >
            {hideOverlaysOnAxis ? (
              <>
                <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                <span>Overlays: Hidden on Axis</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
                <span>Overlays: Visible on Axis</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── TAB 1: INTERACTIVE CALIBRATION CANVAS ── */}
      {activeTab === "canvas" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Interactive Video Viewport (8 Cols) */}
          <div className="lg:col-span-8 space-y-2">
            {/* Viewport Top Bar: Room + Camera Selector */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-black/40 p-2 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-400 uppercase text-[10px]">Room:</span>
                <select
                  value={selectedRoom}
                  onChange={(e) => {
                    setSelectedRoom(e.target.value);
                    setSelectedCameraId("");
                    handleResetPlotting();
                  }}
                  className="rounded border border-slate-700 bg-black/80 px-2 py-0.5 text-xs font-bold text-orange-300"
                >
                  {availableRooms.map((room) => (
                    <option key={room} value={room}>
                      {room.toUpperCase().replace("-", " ")}
                    </option>
                  ))}
                </select>

                <span className="font-bold text-slate-400 uppercase text-[10px] ml-2">Camera:</span>
                <select
                  value={activeCamera?.id || ""}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                  className="rounded border border-slate-700 bg-black/80 px-2 py-0.5 text-xs font-mono text-cyan-300 max-w-[180px] truncate"
                >
                  {roomCameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.name || cam.id} {cam.online ? "●" : "○"}
                    </option>
                  ))}
                </select>
              </div>

              {/* Viewport Tools */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsFrozen((f) => !f)}
                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase flex items-center gap-1 ${
                    isFrozen ? "bg-amber-600 text-black" : "bg-black/60 text-slate-300 hover:bg-black"
                  }`}
                  title={isFrozen ? "Unfreeze live video feed" : "Freeze camera frame to place pins"}
                >
                  {isFrozen ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                  <span>{isFrozen ? "Frozen" : "Freeze"}</span>
                </button>

                <div className="h-3 w-px bg-white/20 mx-1" />

                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(1, z - 0.5))}
                  disabled={zoomLevel <= 1}
                  className="rounded bg-black/60 p-1 hover:bg-black disabled:opacity-30"
                  title="Zoom Out"
                >
                  <ZoomOut className="h-3 w-3" />
                </button>
                <span className="font-mono text-[10px] font-bold w-7 text-center">
                  {zoomLevel}x
                </span>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(4, z + 0.5))}
                  disabled={zoomLevel >= 4}
                  className="rounded bg-black/60 p-1 hover:bg-black disabled:opacity-30"
                  title="Zoom In"
                >
                  <ZoomIn className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setZoomLevel(1);
                    setPanOffset({ x: 0, y: 0 });
                  }}
                  className="rounded bg-black/60 p-1 hover:bg-black"
                  title="Reset Zoom"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Video Canvas Element */}
            <div
              ref={canvasContainerRef}
              onClick={handleCanvasClick}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              className={`relative aspect-video w-full overflow-hidden rounded-lg border-2 bg-black select-none ${
                isPlotting
                  ? draggingPinIndex !== null
                    ? "cursor-grabbing border-orange-500"
                    : "border-orange-500/80 cursor-crosshair"
                  : "border-slate-800 cursor-default"
              }`}
            >
              {/* Camera Video Stream */}
              {effectivePlaybackUrl ? (
                <div
                  style={{
                    transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                    transformOrigin: "center center",
                    transition: "transform 0.1s ease-out",
                    width: "100%",
                    height: "100%",
                  }}
                >
                  <CameraPlayer
                    playbackUrl={effectivePlaybackUrl}
                    playbackProtocol={effectiveProtocol}
                    online={!isFrozen}
                    muted={true}
                    priority="hero"
                    prerollLoopUrl={clipUrl}
                    cameraSlug={selectedRoom}
                    className="h-full w-full object-cover pointer-events-none"
                  />
                </div>
              ) : clipUrl ? (
                <div
                  style={{
                    transform: `scale(${zoomLevel}) translate(${panOffset.x}px, ${panOffset.y}px)`,
                    transformOrigin: "center center",
                    transition: "transform 0.1s ease-out",
                    width: "100%",
                    height: "100%",
                  }}
                >
                  <video
                    ref={videoElRef}
                    key={clipUrl}
                    src={clipUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    webkit-playsinline="true"
                    className="h-full w-full object-cover pointer-events-none"
                  />
                </div>
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center text-slate-500 font-mono text-xs gap-2">
                  <DoorOpen className="h-8 w-8 text-slate-600" />
                  <span>Feed standby for {activeCamera?.name || selectedRoom.toUpperCase()}</span>
                  <span className="text-[10px] text-slate-600">Canvas ready for doorway perimeter plotting</span>
                </div>
              )}

              {/* Axis Mask Indicator Badge */}
              {hideOverlaysOnAxis && !isPlotting && portals.length > 0 && (
                <div className="absolute top-2 left-2 pointer-events-auto">
                  <button
                    type="button"
                    onClick={toggleHideOverlaysOnAxis}
                    className="flex items-center gap-1.5 rounded bg-black/80 backdrop-blur-sm border border-slate-700 px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-cyan-300 transition"
                  >
                    <EyeOff className="h-3 w-3" />
                    <span>{portals.length} Doorway{portals.length > 1 ? "s" : ""} Hidden on Axis (Click to Show)</span>
                  </button>
                </div>
              )}

              {/* Geometry uses a normalized numeric viewBox. SVG polygon and
                  polyline point lists do not reliably accept percentage
                  lengths, which previously left the pins visible while the
                  doorway outline itself disappeared. */}
              <svg
                className="absolute inset-0 h-full w-full pointer-events-none"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <filter id="studio-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="0.45" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Saved Portals: RENDER ONLY IF NOT HIDDEN ON AXIS (or currently selected) */}
                {(!hideOverlaysOnAxis || selectedPortalId) &&
                  portals.map((portal) => {
                    const isSelected = selectedPortalId === portal.id;
                    if (hideOverlaysOnAxis && !isSelected) return null;

                    const pointsStr = pointsToSvgViewBox(portal.polygon);

                    return (
                      <g key={portal.id}>
                        <polygon
                          points={pointsStr}
                          fill={isSelected ? "rgba(249, 115, 22, 0.35)" : "rgba(34, 211, 238, 0.12)"}
                          stroke={isSelected ? "#f97316" : "#22d3ee"}
                          strokeWidth={isSelected ? "3" : "1.5"}
                          strokeDasharray={isSelected ? "4 2" : undefined}
                          vectorEffect="non-scaling-stroke"
                        />
                      </g>
                    );
                  })}

                {/* Draft Connecting Path */}
                {draftPoints.length > 1 && (
                  <polyline
                    points={pointsToSvgViewBox(draftPoints)}
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="2"
                    strokeDasharray="4 2"
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {/* Filled doorway preview once a usable perimeter exists */}
                {draftPoints.length >= 3 && (
                  <polygon
                    points={pointsToSvgViewBox(draftPoints)}
                    fill="rgba(249, 115, 22, 0.3)"
                    stroke="#f97316"
                    strokeWidth="2.5"
                    filter="url(#studio-glow)"
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                {/* Simulation Visual Feedback */}
                {simulatedHit && (
                  <polygon
                    points={pointsToSvgViewBox(simulatedHit.portal.polygon)}
                    fill="rgba(249, 115, 22, 0.5)"
                    stroke="#ff5500"
                    strokeWidth="4"
                    filter="url(#studio-glow)"
                    className="animate-pulse"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </svg>

              {/* Pixel-sized annotations stay outside the stretched geometry
                  viewBox so calibration handles remain easy to drag. */}
              {(!hideOverlaysOnAxis || selectedPortalId) &&
                portals.map((portal) => {
                  const isSelected = selectedPortalId === portal.id;
                  if (hideOverlaysOnAxis && !isSelected) return null;
                  const centroid = calculateQuadCentroid(portal.polygon);
                  return (
                    <div
                      key={`${portal.id}-label`}
                      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${centroid.nx * 100}%`, top: `${centroid.ny * 100}%` }}
                    >
                      <span className="font-mono text-[10px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        {portal.title}
                      </span>
                    </div>
                  );
                })}

              {draftPoints.map((pt, idx) => (
                <button
                  key={`draft-pin-${idx}`}
                  type="button"
                  onPointerDown={(e) => handlePinPointerDown(e, idx)}
                  className={`absolute z-10 grid h-6 min-w-6 -translate-x-1/2 -translate-y-1/2 cursor-grab place-items-center rounded-sm border border-white/80 px-1 font-mono text-[9px] font-black text-white shadow-[0_1px_4px_rgba(0,0,0,0.9)] active:cursor-grabbing ${
                    draggingPinIndex === idx ? "bg-cyan-600" : "bg-[#1f2021]"
                  }`}
                  style={{ left: `${pt.nx * 100}%`, top: `${pt.ny * 100}%` }}
                  aria-label={`Doorway corner ${idx + 1}`}
                  title={`P${idx + 1}: drag to the doorway corner`}
                >
                  {idx + 1}
                </button>
              ))}

              {/* Simulation Destination Centroid Pill */}
              {simulatedHit && (
                <div
                  style={{
                    left: `${calculateQuadCentroid(simulatedHit.portal.polygon).nx * 100}%`,
                    top: `${calculateQuadCentroid(simulatedHit.portal.polygon).ny * 100}%`,
                  }}
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 animate-in zoom-in-90 duration-150"
                >
                  <div className="flex items-center gap-2 rounded-full border-2 border-orange-400 bg-black/95 px-4 py-2 text-xs font-black uppercase tracking-wider text-orange-200 shadow-[0_0_25px_rgba(249,115,22,0.9)]">
                    <DoorOpen className="h-4 w-4 text-orange-400 animate-bounce" />
                    <span>ENTERING {simulatedHit.portal.title.toUpperCase()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: Calibration & Doorway Binding Controls (4 Cols) */}
          <div className="lg:col-span-4 flex flex-col justify-between space-y-3 bg-black/40 p-3.5 rounded-lg border border-slate-800">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div>
                  <span className="text-xs font-black uppercase text-orange-400 block">
                    {selectedPortalId ? "Re-Calibrate Doorway" : "Doorway Boundary"}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {selectedRoom} camera stream
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {!isPlotting ? (
                    <>
                      <button
                        type="button"
                        onClick={handleAddStandardFrame}
                        className="flex items-center gap-1 rounded bg-slate-800 border border-orange-500/40 px-2 py-1 text-[11px] font-bold text-orange-300 hover:bg-slate-700"
                        title="Drop a standard doorway frame ready to reshape"
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>Preset</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleStartPlotting}
                        className="flex items-center gap-1 rounded bg-orange-600 px-2.5 py-1 text-xs font-bold text-black hover:bg-orange-500 shadow"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Plot</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResetPlotting}
                      className="rounded bg-slate-700 px-2.5 py-1 text-xs font-bold text-slate-200 hover:bg-slate-600"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Calibration Form */}
              {isPlotting && (
                <div className="rounded bg-orange-950/40 border border-orange-600/40 p-2.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-orange-300">
                      {draftPoints.length < 4
                        ? `Click perimeter corner ${draftPoints.length + 1}; four are required.`
                        : draftPoints.length < 12
                          ? `${draftPoints.length} corners. Click the image to add another, or drag a numbered handle.`
                          : "12-corner limit reached. Drag the numbered handles to finish the doorway."}
                    </p>
                    {draftPoints.length > 0 && (
                      <button
                        type="button"
                        onClick={handleUndoPoint}
                        className="flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold text-slate-300 hover:bg-black"
                      >
                        <Undo2 className="h-3 w-3" />
                        <span>Undo</span>
                      </button>
                    )}
                  </div>

                  {/* Destination Room */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400">
                      Target Room Destination
                    </label>
                    <select
                      value={targetRoomSlug}
                      onChange={(e) => {
                        setTargetRoomSlug(e.target.value);
                        if (!portalTitle || portalTitle === targetRoomSlug) {
                          setPortalTitle(e.target.value.replace("-", " "));
                        }
                      }}
                      className="w-full rounded border border-slate-700 bg-black px-2 py-1 text-xs font-bold text-orange-200"
                    >
                      {availableRooms
                        .filter((r) => r !== selectedRoom)
                        .map((room) => (
                          <option key={room} value={room}>
                            {room.toUpperCase().replace("-", " ")}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Portal Label */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400">
                      Display Title
                    </label>
                    <input
                      type="text"
                      value={portalTitle}
                      onChange={(e) => setPortalTitle(e.target.value)}
                      placeholder="e.g. Living Room Arch"
                      className="w-full rounded border border-slate-700 bg-black px-2 py-1 text-xs text-white"
                    />
                  </div>

                  {/* Camera Binding Confirmation */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400">
                      Bound Camera
                    </label>
                    <p className="font-mono text-[10px] text-cyan-300 bg-black/60 p-1 rounded border border-slate-800 truncate">
                      {activeCamera?.name || activeCamera?.id || "Auto (Room Default)"}
                    </p>
                  </div>

                  {/* Direction */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-slate-400">
                      Indicator Direction
                    </label>
                    <select
                      value={direction}
                      onChange={(e) => setDirection(e.target.value as any)}
                      className="w-full rounded border border-slate-700 bg-black px-2 py-1 text-xs text-white"
                    >
                      <option value="forward">Forward (Straight Ahead)</option>
                      <option value="left">Left (Hallway Left)</option>
                      <option value="right">Right (Hallway Right)</option>
                      <option value="back">Back (Behind)</option>
                    </select>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      disabled={draftPoints.length < 4 || !isPortalPolygonValid(draftPoints)}
                      onClick={() => handleSimulateClick()}
                      className="flex-1 flex items-center justify-center gap-1 rounded bg-slate-800 border border-orange-500/50 py-1.5 font-bold text-xs uppercase text-orange-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Simulate viewer tap"
                    >
                      <Zap className="h-3.5 w-3.5 text-orange-400" />
                      <span>Test Click</span>
                    </button>

                    <button
                      type="button"
                      disabled={draftPoints.length < 4 || !isPortalPolygonValid(draftPoints)}
                      onClick={handleSaveDraft}
                      className="flex-1 flex items-center justify-center gap-1 rounded bg-emerald-600 py-1.5 font-black text-xs uppercase tracking-wider text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed shadow"
                    >
                      <Check className="h-4 w-4" />
                      <span>Save</span>
                    </button>
                  </div>
                </div>
              )}

              {saveStatus && (
                <p className="text-[11px] font-mono text-center text-amber-300 font-bold">
                  {saveStatus}
                </p>
              )}

              {/* Doors mapped in this specific room */}
              <div className="space-y-1.5 pt-2">
                <span className="text-[11px] font-bold uppercase text-slate-400">
                  Doorways in {selectedRoom} ({portals.length})
                </span>
                {loadingPortals ? (
                  <p className="text-xs text-slate-500 font-mono">Loading...</p>
                ) : portals.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No doorways calibrated in this room.</p>
                ) : (
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {portals.map((portal) => (
                      <div
                        key={portal.id}
                        onClick={() => handleSelectPortalForCalibration(portal)}
                        className={`flex items-center justify-between p-2 rounded border transition cursor-pointer ${
                          selectedPortalId === portal.id
                            ? "border-orange-500 bg-orange-950/30"
                            : "border-slate-800 bg-black/30 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Navigation className="h-3.5 w-3.5 text-cyan-400" />
                          <div>
                            <p className="text-xs font-bold text-white leading-tight">
                              {portal.title}
                            </p>
                            <p className="text-[9px] font-mono text-slate-400">
                              ➔ {portal.targetRoomSlug} ({portal.direction})
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSimulateClick(portal);
                            }}
                            className="p-1 text-slate-400 hover:text-orange-400"
                            title="Simulate viewer tap"
                          >
                            <Zap className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePortal(portal.id);
                            }}
                            className="p-1 text-slate-400 hover:text-red-400"
                            title="Delete Doorway"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <p className="text-[10px] text-slate-500 text-center font-mono">
              Public View Guarantee: Zero idle overlays on Tank until clicked.
            </p>
          </div>
        </div>
      )}

      {/* ── TAB 2: ENROLLED DOORWAYS ROSTER (House Matrix) ── */}
      {activeTab === "roster" && (
        <div className="space-y-3 bg-black/30 p-4 rounded-lg border border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-orange-400">
                House Enrolled Doorways Roster
              </h4>
              <p className="text-[10px] text-slate-400">
                All physical doorways enrolled in the house and their assigned camera bindings
              </p>
            </div>

            {/* Filter by Room */}
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-slate-400">Filter Room:</span>
              <select
                value={rosterRoomFilter}
                onChange={(e) => setRosterRoomFilter(e.target.value)}
                className="rounded border border-slate-700 bg-black px-2.5 py-1 text-xs font-bold text-orange-300"
              >
                <option value="all">ALL ROOMS ({allEnrolledPortals.length})</option>
                {availableRooms.map((r) => (
                  <option key={r} value={r}>
                    {r.toUpperCase().replace("-", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredRoster.length === 0 ? (
            <div className="py-8 text-center text-slate-500 space-y-2">
              <DoorOpen className="h-8 w-8 mx-auto text-slate-600" />
              <p className="text-xs font-bold">No doorways enrolled for this filter.</p>
              <button
                type="button"
                onClick={() => setActiveTab("enroll")}
                className="rounded bg-orange-600 px-3 py-1 text-xs font-bold text-black hover:bg-orange-500"
              >
                Enroll New Doorway
              </button>
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRoster.map((portal) => {
                const boundCam = cameras.find((c) => c.id === portal.sourceCameraId);
                const isCalibrated = portal.polygon && portal.polygon.length >= 4;

                return (
                  <div
                    key={portal.id}
                    className="rounded-lg border border-slate-800 bg-[#191b22] p-3 space-y-2.5 hover:border-slate-700 transition"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-white/5 pb-2">
                      <div>
                        <h5 className="text-xs font-black uppercase text-white">
                          {portal.title}
                        </h5>
                        <p className="text-[10px] font-mono text-orange-400">
                          {portal.sourceRoomSlug.toUpperCase()} ➔ {portal.targetRoomSlug.toUpperCase()}
                        </p>
                      </div>

                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase flex items-center gap-1 ${
                          isCalibrated
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        {isCalibrated ? "Calibrated" : "Needs Pins"}
                      </span>
                    </div>

                    {/* Camera Re-binding Dropdown (When cameras move or are added) */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold uppercase text-slate-400 flex items-center gap-1">
                        <Camera className="h-3 w-3 text-cyan-400" />
                        Watching Camera (Re-bind if moved):
                      </label>
                      <select
                        value={portal.sourceCameraId || ""}
                        onChange={(e) => void handleRebindCamera(portal, e.target.value)}
                        className="w-full rounded border border-slate-700 bg-black/80 px-2 py-1 text-[11px] font-mono text-cyan-300 truncate"
                      >
                        <option value="">Select Camera...</option>
                        {cameras.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name || c.id} ({c.roomScope || "general"}) {c.online ? "●" : "○"}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSelectPortalForCalibration(portal)}
                        className="flex-1 flex items-center justify-center gap-1 rounded bg-orange-600/20 border border-orange-500/50 py-1 px-2 text-[10px] font-bold text-orange-300 hover:bg-orange-600/40"
                      >
                        <Sliders className="h-3 w-3" />
                        <span>Calibrate on Camera</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSimulateClick(portal)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                        title="Simulate tap"
                      >
                        <Zap className="h-3.5 w-3.5 text-orange-400" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePortal(portal.id)}
                        className="p-1 rounded bg-slate-800 hover:bg-red-950/60 text-slate-400 hover:text-red-400"
                        title="Delete doorway"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: ENROLL NEW DOORWAY ── */}
      {activeTab === "enroll" && (
        <div className="max-w-xl mx-auto space-y-4 bg-black/40 p-5 rounded-lg border border-slate-800">
          <div className="border-b border-white/10 pb-3">
            <h4 className="text-sm font-black uppercase tracking-wider text-orange-400 flex items-center gap-2">
              <Plus className="h-4 w-4" />
              <span>Enroll Physical Doorway Into House Registry</span>
            </h4>
            <p className="text-xs text-slate-400">
              Define the physical connection between rooms, assign the camera viewing it, then calibrate the 4 pins
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Doorway Name / Label
              </label>
              <input
                type="text"
                value={enrollTitle}
                onChange={(e) => setEnrollTitle(e.target.value)}
                placeholder="e.g. Living Room to Kitchen Double Doors"
                className="w-full rounded border border-slate-700 bg-black px-3 py-1.5 text-xs text-white font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Source Room (Physical Location)
                </label>
                <select
                  value={enrollSourceRoom}
                  onChange={(e) => setEnrollSourceRoom(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-black px-2.5 py-1.5 text-xs font-bold text-orange-300"
                >
                  {availableRooms.map((r) => (
                    <option key={r} value={r}>
                      {r.toUpperCase().replace("-", " ")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Target Destination Room
                </label>
                <select
                  value={enrollTargetRoom}
                  onChange={(e) => setEnrollTargetRoom(e.target.value)}
                  className="w-full rounded border border-slate-700 bg-black px-2.5 py-1.5 text-xs font-bold text-cyan-300"
                >
                  {availableRooms
                    .filter((r) => r !== enrollSourceRoom)
                    .map((r) => (
                      <option key={r} value={r}>
                        {r.toUpperCase().replace("-", " ")}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Assigned Watching Camera
              </label>
              <select
                value={enrollCameraId}
                onChange={(e) => setEnrollCameraId(e.target.value)}
                className="w-full rounded border border-slate-700 bg-black px-2.5 py-1.5 text-xs font-mono text-cyan-300"
              >
                <option value="">Default (First Camera in Room)</option>
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || c.id} — [{c.roomScope || "general"}] {c.online ? "●" : "○"}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-slate-500 mt-1">
                If cameras move later, you can easily re-bind this door to any other camera from the Door Roster.
              </p>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                Navigation Direction
              </label>
              <select
                value={enrollDirection}
                onChange={(e) => setEnrollDirection(e.target.value as any)}
                className="w-full rounded border border-slate-700 bg-black px-2.5 py-1.5 text-xs text-white"
              >
                <option value="forward">Forward (Straight Ahead)</option>
                <option value="left">Left (Hallway Left)</option>
                <option value="right">Right (Hallway Right)</option>
                <option value="back">Back (Behind)</option>
              </select>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleEnrollNewDoor}
                className="w-full flex items-center justify-center gap-2 rounded bg-orange-600 hover:bg-orange-500 py-2 text-xs font-black uppercase tracking-wider text-black shadow-lg"
              >
                <Plus className="h-4 w-4" />
                <span>Enroll Doorway & Open Calibration Canvas</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
