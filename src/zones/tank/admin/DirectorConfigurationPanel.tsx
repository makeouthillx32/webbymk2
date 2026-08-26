"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Video,
  Eye,
  Sliders,
  Sparkles,
  Volume2,
  Users,
  Footprints,
  Flame,
  Zap,
  Play,
  RotateCcw,
  CheckCircle2,
  Grid,
  Maximize2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Gamepad2,
  Crosshair,
  Layers,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { ChromePanel } from "../public/components/ChromePanel";
import { ConsoleButton } from "../public/components/ConsoleButton";
import { ACTIVE_THEME } from "../theme";
import {
  computeDynamicAtlasLayout,
  evaluateDirectorStep,
  type DirectorViewportState,
  type SubjectMode,
  type FramingMode,
  type MotionCurve,
  type CameraTelemetryInput,
  type CameraTileBounds,
} from "../server/directorVirtualAtlas";

const SAMPLE_CAMERAS = [
  { id: "cam-1", name: "Game Room", slug: "game-room" },
  { id: "cam-2", name: "Living Room", slug: "living-room" },
  { id: "cam-3", name: "The Foyer", slug: "foyer" },
  { id: "cam-4", name: "Makeup Room", slug: "makeup-room" },
  { id: "cam-5", name: "Game Room 2", slug: "game-room-2" },
  { id: "cam-6", name: "Kitchen", slug: "kitchen" },
  { id: "cam-7", name: "Backyard Cam", slug: "backyard" },
  { id: "cam-8", name: "Front Porch", slug: "front-porch" },
  { id: "cam-9", name: "Workshop", slug: "workshop" },
  { id: "cam-10", name: "Gym Room", slug: "gym-room" },
  { id: "cam-11", name: "Balcony Deck", slug: "balcony" },
  { id: "cam-12", name: "Pool Area", slug: "pool" },
  { id: "cam-13", name: "IRL Roaming 1", slug: "irl-1" },
  { id: "cam-14", name: "IRL Roaming 2", slug: "irl-2" },
  { id: "cam-15", name: "OBS Stage Main", slug: "obs-main" },
  { id: "cam-16", name: "OBS Esports Feed", slug: "obs-esports" },
];

export function DirectorConfigurationPanel() {
  const [cameraCount, setCameraCount] = useState<number>(6);
  const [subjectMode, setSubjectMode] = useState<SubjectMode>("feet");
  const [framingMode, setFramingMode] = useState<FramingMode>("camera");
  const [motionCurve, setMotionCurve] = useState<MotionCurve>("snap");
  const [showDetectionBoxes, setShowDetectionBoxes] = useState<boolean>(true);
  const [gamepadConnected, setGamepadConnected] = useState<boolean>(false);

  // Dynamic Atlas layout based on camera count
  const activeCameras = useMemo(() => SAMPLE_CAMERAS.slice(0, cameraCount), [cameraCount]);
  const atlasLayout = useMemo(() => computeDynamicAtlasLayout(activeCameras), [activeCameras]);

  // Initial simulated live telemetry inputs
  const [inputs, setInputs] = useState<CameraTelemetryInput[]>([
    { cameraId: "cam-1", peopleCount: 1, visibleFeetCount: 2, feetConfidence: 0.85, faceCount: 1, motionScore: 0.2, audioPeak: 30, isSpeaking: false },
    { cameraId: "cam-2", peopleCount: 0, visibleFeetCount: 0, feetConfidence: 0.0, faceCount: 0, motionScore: 0.05, audioPeak: 10, isSpeaking: false },
    { cameraId: "cam-3", peopleCount: 2, visibleFeetCount: 4, feetConfidence: 0.9, faceCount: 2, motionScore: 0.4, audioPeak: 75, isSpeaking: true },
    { cameraId: "cam-4", peopleCount: 1, visibleFeetCount: 2, feetConfidence: 0.7, faceCount: 1, motionScore: 0.1, audioPeak: 15, isSpeaking: false },
    { cameraId: "cam-5", peopleCount: 4, visibleFeetCount: 8, feetConfidence: 0.95, faceCount: 3, motionScore: 0.85, audioPeak: 40, isSpeaking: false },
    { cameraId: "cam-6", peopleCount: 0, visibleFeetCount: 0, feetConfidence: 0.0, faceCount: 0, motionScore: 0.0, audioPeak: 5, isSpeaking: false },
  ]);

  const [directorState, setDirectorState] = useState<DirectorViewportState>({
    activeCameraId: "cam-5",
    activeCameraSlug: "game-room-2",
    subjectMode: "feet",
    framingMode: "camera",
    motionCurve: "snap",
    viewportX: 3840,
    viewportY: 2160,
    viewportWidth: 3840,
    viewportHeight: 2160,
    zoomFactor: 1,
    currentScore: 146,
    shotStartedAt: Date.now(),
    challengerId: null,
    challengerSince: null,
    scores: [],
    rotationCameraIds: [],
    rotationIntervalMs: 170_000,
    rotationIndex: 0,
    rotationSlotStartedAt: null,
  });

  // Re-evaluate on mode, telemetry or canvas layout change
  useEffect(() => {
    setDirectorState((prev) =>
      evaluateDirectorStep(
        { ...prev, subjectMode, framingMode, motionCurve },
        inputs,
        atlasLayout.tiles,
        Date.now()
      )
    );
  }, [subjectMode, framingMode, motionCurve, inputs, atlasLayout]);

  // Current active tile object
  const currentActiveTile = useMemo(() => {
    return (
      atlasLayout.tiles.find((t) => t.cameraId === directorState.activeCameraId) ||
      atlasLayout.tiles[0]
    );
  }, [atlasLayout, directorState.activeCameraId]);

  // Directional Snapping Handler (Up, Down, Left, Right)
  const handleSnapDirection = useCallback(
    (direction: "up" | "down" | "left" | "right") => {
      const { cols, rows } = atlasLayout.grid;
      const curCol = currentActiveTile?.col ?? 0;
      const curRow = currentActiveTile?.row ?? 0;

      let targetCol = curCol;
      let targetRow = curRow;

      if (direction === "up") targetRow = Math.max(0, curRow - 1);
      if (direction === "down") targetRow = Math.min(rows - 1, curRow + 1);
      if (direction === "left") targetCol = Math.max(0, curCol - 1);
      if (direction === "right") targetCol = Math.min(cols - 1, curCol + 1);

      // Find matching tile in grid
      const targetTile =
        atlasLayout.tiles.find((t) => t.col === targetCol && t.row === targetRow) ||
        atlasLayout.tiles.find((t) => t.row === targetRow) ||
        currentActiveTile;

      if (targetTile && targetTile.cameraId !== directorState.activeCameraId) {
        setSubjectMode("manual");
        setDirectorState((prev) => ({
          ...prev,
          activeCameraId: targetTile.cameraId,
          activeCameraSlug: targetTile.slug,
          subjectMode: "manual",
          viewportX: targetTile.xMin,
          viewportY: targetTile.yMin,
          shotStartedAt: Date.now(),
        }));
      }
    },
    [atlasLayout, currentActiveTile, directorState.activeCameraId]
  );

  // Keyboard navigation listener (Arrow Keys & WASD)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;

      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        handleSnapDirection("up");
      } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        handleSnapDirection("down");
      } else if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        handleSnapDirection("left");
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        handleSnapDirection("right");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSnapDirection]);

  // Gamepad / Joystick Controller Polling
  useEffect(() => {
    let animationFrameId: number;
    let lastButtonPress = 0;

    const pollGamepad = () => {
      if (typeof navigator !== "undefined" && navigator.getGamepads) {
        const gamepads = navigator.getGamepads();
        const gp = gamepads[0] || gamepads[1];
        if (gp) {
          if (!gamepadConnected) setGamepadConnected(true);
          const now = Date.now();
          if (now - lastButtonPress > 220) {
            // D-Pad buttons: 12=Up, 13=Down, 14=Left, 15=Right
            // Analog Sticks: Axis 0 (X), Axis 1 (Y)
            const axisX = gp.axes[0] ?? 0;
            const axisY = gp.axes[1] ?? 0;

            if (gp.buttons[12]?.pressed || axisY < -0.5) {
              handleSnapDirection("up");
              lastButtonPress = now;
            } else if (gp.buttons[13]?.pressed || axisY > 0.5) {
              handleSnapDirection("down");
              lastButtonPress = now;
            } else if (gp.buttons[14]?.pressed || axisX < -0.5) {
              handleSnapDirection("left");
              lastButtonPress = now;
            } else if (gp.buttons[15]?.pressed || axisX > 0.5) {
              handleSnapDirection("right");
              lastButtonPress = now;
            }
          }
        } else if (gamepadConnected) {
          setGamepadConnected(false);
        }
      }
      animationFrameId = requestAnimationFrame(pollGamepad);
    };

    animationFrameId = requestAnimationFrame(pollGamepad);
    return () => cancelAnimationFrame(animationFrameId);
  }, [handleSnapDirection, gamepadConnected]);

  const handleAdjustFeet = (camId: string, delta: number) => {
    setInputs((prev) => {
      const existing = prev.find((i) => i.cameraId === camId);
      if (existing) {
        const newFeet = Math.max(0, existing.visibleFeetCount + delta);
        return prev.map((inp) =>
          inp.cameraId === camId
            ? { ...inp, visibleFeetCount: newFeet, peopleCount: Math.ceil(newFeet / 2) }
            : inp
        );
      }
      return [
        ...prev,
        {
          cameraId: camId,
          peopleCount: Math.ceil(delta / 2),
          visibleFeetCount: Math.max(0, delta),
          feetConfidence: 0.9,
          faceCount: 1,
          motionScore: 0.5,
          audioPeak: 30,
          isSpeaking: false,
        },
      ];
    });
  };

  const handleAdjustAudio = (camId: string, delta: number) => {
    setInputs((prev) => {
      const existing = prev.find((i) => i.cameraId === camId);
      if (existing) {
        const newPeak = Math.max(0, Math.min(100, existing.audioPeak + delta));
        return prev.map((inp) =>
          inp.cameraId === camId
            ? { ...inp, audioPeak: newPeak, isSpeaking: newPeak > 50 }
            : inp
        );
      }
      return [
        ...prev,
        {
          cameraId: camId,
          peopleCount: 1,
          visibleFeetCount: 0,
          feetConfidence: 0.0,
          faceCount: 0,
          motionScore: 0.1,
          audioPeak: Math.max(0, Math.min(100, delta)),
          isSpeaking: delta > 50,
        },
      ];
    });
  };

  // Grid style helper
  const gridColsClass =
    atlasLayout.grid.cols === 1
      ? "grid-cols-1"
      : atlasLayout.grid.cols === 2
      ? "grid-cols-2"
      : atlasLayout.grid.cols === 3
      ? "grid-cols-3"
      : atlasLayout.grid.cols === 4
      ? "grid-cols-4"
      : "grid-cols-5";

  return (
    <ChromePanel withScrews className="w-full">
      <div className="space-y-5 font-sans select-none p-2">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/15 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded bg-orange-950/40 border border-orange-500/40 text-orange-400 shadow">
              <Crosshair className="h-5 w-5" />
            </div>
            <div>
              <h2
                className="text-sm font-black uppercase tracking-wider text-[#241f14]"
                style={{ fontFamily: ACTIVE_THEME.fonts.label }}
              >
                Director Hover Viewport & Grid Snapping Controller
              </h2>
              <p className="text-[11px] font-semibold text-[#5a5442]">
                TouchDesigner Virtual Camera Bridge · Directional Snapping (WASD / D-Pad / Joystick)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/director-configuration"
              className="flex items-center gap-1 rounded bg-orange-600 hover:bg-orange-500 text-white px-3 py-1 text-xs font-black uppercase shadow transition active:scale-95"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Configure
            </Link>

            {gamepadConnected && (
              <span className="flex items-center gap-1 rounded bg-blue-900/60 border border-blue-400/40 px-2 py-0.5 text-[10px] font-mono font-bold text-blue-300 animate-pulse">
                <Gamepad2 className="h-3 w-3" /> Gamepad Ready
              </span>
            )}
            <span className="rounded bg-black/90 px-3 py-1 text-xs font-mono font-bold text-emerald-400 border border-black/60 shadow">
              Program 4K: {directorState.activeCameraSlug.toUpperCase()} [X: {directorState.viewportX}, Y: {directorState.viewportY}]
            </span>
          </div>
        </div>

        {/* Top Control Bar: Grid Presets + Directional Snapping D-Pad */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left: Dynamic Grid Presets (8 Cols) */}
          <div className="lg:col-span-8 rounded-lg bg-black/5 p-3 border border-black/15 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#241f14] flex items-center gap-1.5">
                <Grid className="h-4 w-4 text-orange-600" />
                Adaptive Video Atlas Solver
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                {atlasLayout.grid.cols}x{atlasLayout.grid.rows} Grid ({atlasLayout.canvasWidth}x{atlasLayout.canvasHeight} px)
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                { count: 4, label: "4 Cams (2x2)" },
                { count: 6, label: "6 Cams (3x2)" },
                { count: 8, label: "8 Cams (3x3)" },
                { count: 9, label: "9 Cams (3x3)" },
                { count: 12, label: "12 Cams (4x3)" },
                { count: 16, label: "16 Cams (4x4)" },
              ].map((p) => (
                <button
                  key={p.count}
                  type="button"
                  onClick={() => setCameraCount(p.count)}
                  className={`rounded px-2.5 py-1 text-xs font-black transition-all ${
                    cameraCount === p.count
                      ? "bg-[#241f14] text-orange-400 border border-orange-500 shadow"
                      : "bg-white/70 text-[#4c4630] border border-black/15 hover:bg-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-black/10 text-[11px]">
              <span className="font-bold text-[#4c4630]">
                Keyboard: <kbd className="px-1 py-0.5 rounded bg-black/10 font-mono">W A S D</kbd> or <kbd className="px-1 py-0.5 rounded bg-black/10 font-mono">Arrow Keys</kbd>
              </span>
              <button
                type="button"
                onClick={() => setShowDetectionBoxes(!showDetectionBoxes)}
                className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-bold uppercase transition ${
                  showDetectionBoxes
                    ? "bg-emerald-800 text-white"
                    : "bg-black/20 text-[#4c4630]"
                }`}
              >
                <Layers className="h-3 w-3" />
                {showDetectionBoxes ? "Detection Boxes: ON" : "Detection Boxes: OFF"}
              </button>
            </div>
          </div>

          {/* Right: Directional Joystick & Snapping D-Pad (4 Cols) */}
          <div className="lg:col-span-4 rounded-lg bg-black/80 border border-orange-500/40 p-3 shadow text-white flex flex-col items-center justify-center">
            <span className="text-[10px] font-black uppercase text-orange-400 tracking-wider mb-1.5 flex items-center gap-1">
              <Crosshair className="h-3.5 w-3.5" /> Viewport Snapping D-Pad
            </span>

            <div className="grid grid-cols-3 gap-1 w-32">
              <div />
              <button
                type="button"
                onClick={() => handleSnapDirection("up")}
                className="h-8 w-10 rounded bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center justify-center shadow active:scale-95 transition"
                title="Snap Up"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <div />

              <button
                type="button"
                onClick={() => handleSnapDirection("left")}
                className="h-8 w-10 rounded bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center justify-center shadow active:scale-95 transition"
                title="Snap Left"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="h-8 w-10 rounded bg-[#1a1b1e] border border-orange-500/40 flex items-center justify-center text-[9px] font-black text-orange-400 font-mono">
                SNAP
              </div>
              <button
                type="button"
                onClick={() => handleSnapDirection("right")}
                className="h-8 w-10 rounded bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center justify-center shadow active:scale-95 transition"
                title="Snap Right"
              >
                <ArrowRight className="h-4 w-4" />
              </button>

              <div />
              <button
                type="button"
                onClick={() => handleSnapDirection("down")}
                className="h-8 w-10 rounded bg-orange-600 hover:bg-orange-500 text-white font-bold flex items-center justify-center shadow active:scale-95 transition"
                title="Snap Down"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <div />
            </div>
          </div>
        </div>

        {/* ═══════════ THE VIRTUAL CANVAS MATRIX & HOVERING VIEWPORT RETICLE ═══════════ */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black uppercase tracking-wider text-[#241f14] flex items-center gap-1.5">
              <Video className="h-4 w-4 text-orange-600" />
              Live Virtual Canvas Matrix (Hovering Reticle Relays Active Program)
            </p>
            <span className="text-[10px] font-mono text-emerald-700 font-bold">
              Current Snap: Col {currentActiveTile.col + 1}/{atlasLayout.grid.cols}, Row {currentActiveTile.row + 1}/{atlasLayout.grid.rows}
            </span>
          </div>

          {/* Container with dynamic Grid */}
          <div className={`grid gap-3 relative ${gridColsClass}`}>
            {atlasLayout.tiles.map((tile) => {
              const inp = inputs.find((i) => i.cameraId === tile.cameraId);
              const isLead = directorState.activeCameraId === tile.cameraId;
              const isChallenger = directorState.challengerId === tile.cameraId;
              const calcScore = directorState.scores.find((s) => s.tile.cameraId === tile.cameraId)?.score || 0;

              return (
                <div
                  key={tile.cameraId}
                  onClick={() => {
                    setSubjectMode("manual");
                    setDirectorState((prev) => ({
                      ...prev,
                      activeCameraId: tile.cameraId,
                      activeCameraSlug: tile.slug,
                      subjectMode: "manual",
                      viewportX: tile.xMin,
                      viewportY: tile.yMin,
                      shotStartedAt: Date.now(),
                    }));
                  }}
                  className={`relative rounded-xl border p-3 cursor-pointer transition-all ${
                    isLead
                      ? "border-2 border-orange-500 bg-orange-950/80 text-white shadow-[0_0_20px_rgba(249,115,22,0.6)] ring-2 ring-orange-400"
                      : isChallenger
                      ? "border-2 border-yellow-400 bg-yellow-950/60 text-white shadow-[0_0_10px_rgba(234,179,8,0.3)]"
                      : "border-black/30 bg-[#17191d] text-slate-300 hover:border-orange-500/50"
                  }`}
                >
                  {/* Glowing Hover Reticle Box over Active Director Cutout */}
                  {isLead && (
                    <div className="absolute inset-0 pointer-events-none rounded-xl border-2 border-dashed border-orange-400 animate-pulse flex flex-col justify-between p-1 z-20">
                      <div className="flex items-center justify-between text-[8px] font-black uppercase text-orange-400 bg-black/90 px-1.5 py-0.5 rounded border border-orange-500/40">
                        <span>┌ DIRECTOR VIEWPORT SNAP ┐</span>
                        <span>[4K PROGRAM RELAY]</span>
                      </div>
                      <div className="flex items-center justify-between text-[8px] font-mono text-orange-300 bg-black/90 px-1.5 py-0.5 rounded border border-orange-500/40">
                        <span>X: {tile.xMin} · Y: {tile.yMin}</span>
                        <span>└ 3840x2160 NATIVE ┘</span>
                      </div>
                    </div>
                  )}

                  {/* Header */}
                  <div className="flex items-center justify-between pb-1.5 border-b border-white/10 relative z-10">
                    <div>
                      <p className="text-xs font-black text-white flex items-center gap-1.5">
                        {tile.cameraName}
                        {isLead && (
                          <span className="rounded bg-orange-500 px-1.5 py-0.2 text-[8px] font-black text-black">
                            ACTIVE RELAY ★
                          </span>
                        )}
                      </p>
                      <p className="text-[9px] font-mono text-slate-400">
                        [{tile.xMin}, {tile.yMin}] &rarr; [{tile.xMax}, {tile.yMax}]
                      </p>
                    </div>
                    <span className="text-base font-black font-mono text-emerald-400">
                      {calcScore}
                    </span>
                  </div>

                  {/* Simulated Pose / Detection Keypoints Layer (Canvas Only — Never on Public Footage) */}
                  {showDetectionBoxes && (
                    <div className="relative aspect-video my-2 bg-black/60 rounded border border-white/10 overflow-hidden flex items-center justify-center">
                      <div className="absolute inset-0 flex items-center justify-center opacity-20 text-[10px] font-mono text-slate-400">
                        CANVAS MESH [{tile.unitSlot.unitsWide}x{tile.unitSlot.unitsHigh} UNITS]
                      </div>

                      {/* Mock Pose Detection Bounding Boxes */}
                      {(inp?.visibleFeetCount ?? 0) > 0 && (
                        <div className="absolute bottom-2 left-4 border border-emerald-400 bg-emerald-500/20 px-2 py-1 rounded text-[9px] font-mono text-emerald-300 flex items-center gap-1 shadow">
                          <span>👣 Feet Keypoints: {inp?.visibleFeetCount}</span>
                        </div>
                      )}

                      {(inp?.peopleCount ?? 0) > 0 && (
                        <div className="absolute top-2 right-4 border border-cyan-400 bg-cyan-500/20 px-2 py-0.5 rounded text-[8px] font-mono text-cyan-300">
                          👤 Person Track #{tile.col + 1}
                        </div>
                      )}

                      {/* Crosshairs */}
                      <div className="w-4 h-4 border-t border-l border-orange-500/60 absolute top-1 left-1" />
                      <div className="w-4 h-4 border-t border-r border-orange-500/60 absolute top-1 right-1" />
                      <div className="w-4 h-4 border-b border-l border-orange-500/60 absolute bottom-1 left-1" />
                      <div className="w-4 h-4 border-b border-r border-orange-500/60 absolute bottom-1 right-1" />
                    </div>
                  )}

                  {/* Telemetry Live Sliders & Controls */}
                  <div className="space-y-1.5 mt-2 text-xs relative z-10">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-300 flex items-center gap-1">
                        👣 Feet: <strong className="text-white">{inp?.visibleFeetCount ?? 0}</strong>
                      </span>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleAdjustFeet(tile.cameraId, -2)}
                          className="h-5 w-5 rounded bg-white/10 text-white text-xs font-bold hover:bg-white/20"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustFeet(tile.cameraId, 2)}
                          className="h-5 w-5 rounded bg-white/10 text-white text-xs font-bold hover:bg-white/20"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-300 flex items-center gap-1">
                        🔊 Audio: <strong className="text-white">{inp?.audioPeak ?? 0}%</strong>
                      </span>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleAdjustAudio(tile.cameraId, -15)}
                          className="h-5 w-5 rounded bg-white/10 text-white text-xs font-bold hover:bg-white/20"
                        >
                          -
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustAudio(tile.cameraId, 15)}
                          className="h-5 w-5 rounded bg-white/10 text-white text-xs font-bold hover:bg-white/20"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ChromePanel>
  );
}
export default DirectorConfigurationPanel;
