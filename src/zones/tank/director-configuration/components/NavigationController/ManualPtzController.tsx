"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { ChevronUp, ChevronDown, RotateCcw } from "lucide-react";

export type { VirtualPtzState } from "../../../director/ptzState";

export type ManualPtzControllerProps = {
  activeCameraName?: string;
  activeRoomKey?: string;
  ptzState: VirtualPtzState;
  onPtzChange: (newState: VirtualPtzState) => void;
  onSwitchToSnap?: () => void;
  onOscEmit?: (address: string, args: (string | number)[]) => void;
};

export function ManualPtzController({
  activeCameraName = "Current Camera",
  activeRoomKey = "game-room",
  ptzState,
  onPtzChange,
  onSwitchToSnap,
  onOscEmit,
}: ManualPtzControllerProps) {
  const [speedMode, setSpeedMode] = useState<"fine" | "sport">(ptzState.speedMode || "fine");
  const [isDragging, setIsDragging] = useState(false);
  const [joystickOffset, setJoystickOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const joystickRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const velocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const ptzStateRef = useRef(ptzState);
  ptzStateRef.current = ptzState;

  // ═══════════ SILENT MOVEMENT TELEMETRY LOGGING HARNESS ═══════════
  const lastLogTimeRef = useRef<number>(0);
  const logBatchBufferRef = useRef<any[]>([]);

  const flushLogs = useCallback(async () => {
    if (logBatchBufferRef.current.length === 0) return;
    const entries = [...logBatchBufferRef.current];
    logBatchBufferRef.current = [];
    try {
      await fetch("/api/tank/director/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries }),
      });
    } catch {}
  }, []);

  const pushMovementLog = useCallback(
    (entry: {
      eventType: string;
      source?: Partial<{ panX: number; panY: number; zoom: number }>;
      target?: Partial<{ panX: number; panY: number; zoom: number }>;
      trajectory?: Partial<{ vx: number; vy: number; deltaX: number; deltaY: number; deltaZoom: number; durationMs: number; easingCurve: string }>;
    }) => {
      const cur = ptzStateRef.current;
      logBatchBufferRef.current.push({
        eventType: entry.eventType,
        operator: {
          user: "Tyler",
          connectionType: "browser_web",
        },
        source: {
          roomId: activeRoomKey,
          cameraName: activeCameraName,
          panX: entry.source?.panX ?? cur.panOffsetX,
          panY: entry.source?.panY ?? cur.panOffsetY,
          zoom: entry.source?.zoom ?? cur.zoomFactor,
        },
        target: entry.target
          ? {
              roomId: activeRoomKey,
              cameraName: activeCameraName,
              panX: entry.target.panX ?? cur.panOffsetX,
              panY: entry.target.panY ?? cur.panOffsetY,
              zoom: entry.target.zoom ?? cur.zoomFactor,
            }
          : undefined,
        trajectory: {
          vx: entry.trajectory?.vx ?? 0,
          vy: entry.trajectory?.vy ?? 0,
          deltaX: entry.trajectory?.deltaX ?? 0,
          deltaY: entry.trajectory?.deltaY ?? 0,
          deltaZoom: entry.trajectory?.deltaZoom ?? 0,
          durationMs: entry.trajectory?.durationMs ?? 0,
          easingCurve: entry.trajectory?.easingCurve ?? speedMode,
        },
      });

      if (logBatchBufferRef.current.length >= 5) {
        void flushLogs();
      }
    },
    [activeRoomKey, activeCameraName, speedMode, flushLogs]
  );

  const emitOsc = useCallback(
    (address: string, args: (string | number)[]) => {
      onOscEmit?.(address, args);
    },
    [onOscEmit]
  );

  // Continuous animation frame loop during analog joystick drag
  const runJoystickLoop = useCallback(() => {
    const { vx, vy } = velocityRef.current;
    if (Math.abs(vx) > 0.05 || Math.abs(vy) > 0.05) {
      const current = ptzStateRef.current;
      const zoom = current.zoomFactor || 1;
      const speedMultiplier = speedMode === "sport" ? 22 : 10;
      const deltaX = (vx * speedMultiplier) / Math.sqrt(zoom);
      const deltaY = (vy * speedMultiplier) / Math.sqrt(zoom);

      const viewportW = Math.round(3840 / zoom);
      const viewportH = Math.round(2160 / zoom);
      const maxPanX = Math.max(0, 3840 - viewportW);
      const maxPanY = Math.max(0, 2160 - viewportH);

      const nextX = Math.min(maxPanX, Math.max(0, current.panOffsetX + deltaX));
      const nextY = Math.min(maxPanY, Math.max(0, current.panOffsetY + deltaY));

      if (nextX !== current.panOffsetX || nextY !== current.panOffsetY) {
        onPtzChange({
          ...current,
          panOffsetX: nextX,
          panOffsetY: nextY,
        });

        // Throttle vector logging to 5Hz to avoid flooding while capturing fine arcs
        const now = Date.now();
        if (now - lastLogTimeRef.current > 200) {
          lastLogTimeRef.current = now;
          pushMovementLog({
            eventType: "joystick_vector",
            source: { panX: current.panOffsetX, panY: current.panOffsetY, zoom },
            target: { panX: nextX, panY: nextY, zoom },
            trajectory: { vx, vy, deltaX, deltaY, deltaZoom: 0, easingCurve: speedMode },
          });
        }
      }
    }
    animFrameRef.current = requestAnimationFrame(runJoystickLoop);
  }, [speedMode, onPtzChange, pushMovementLog]);

  const updateJoystickPosition = useCallback(
    (clientX: number, clientY: number) => {
      if (!joystickRef.current) return;
      const rect = joystickRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const rawDx = clientX - centerX;
      const rawDy = clientY - centerY;

      const maxRadius = 40; // Travel radius within the inner disc
      const distance = Math.hypot(rawDx, rawDy);
      const clampedDist = Math.min(distance, maxRadius);
      const angle = Math.atan2(rawDy, rawDx);

      const targetX = Math.cos(angle) * clampedDist;
      const targetY = Math.sin(angle) * clampedDist;

      setJoystickOffset({ x: targetX, y: targetY });

      // Normalized continuous velocity vector [-1.0, 1.0]
      const vx = targetX / maxRadius;
      const vy = targetY / maxRadius;
      velocityRef.current = { vx, vy };

      emitOsc("/gimbal/speed", [Number(vx.toFixed(2)), Number(vy.toFixed(2))]);
    },
    [emitOsc]
  );

  // Pointer drag event handlers for direct analog thumbstick control
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!joystickRef.current) return;
    setIsDragging(true);
    try {
      joystickRef.current.setPointerCapture(e.pointerId);
    } catch {}

    updateJoystickPosition(e.clientX, e.clientY);

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(runJoystickLoop);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !joystickRef.current) return;
    updateJoystickPosition(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    if (joystickRef.current) {
      try {
        joystickRef.current.releasePointerCapture(e.pointerId);
      } catch {}
    }
    setJoystickOffset({ x: 0, y: 0 });
    velocityRef.current = { vx: 0, vy: 0 };
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    emitOsc("/gimbal/speed", [0, 0]);

    // End-of-drag keyframe log
    pushMovementLog({
      eventType: "ptz_pan",
      source: { panX: ptzStateRef.current.panOffsetX, panY: ptzStateRef.current.panOffsetY, zoom: ptzStateRef.current.zoomFactor },
      trajectory: { vx: 0, vy: 0, deltaX: 0, deltaY: 0, deltaZoom: 0, easingCurve: speedMode },
    });
    void flushLogs();
  };

  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Zoom control
  const handleZoomChange = (nextZoomVal: number) => {
    const nextZoom = Number(Math.min(3.0, Math.max(1.0, nextZoomVal)).toFixed(2));
    const viewportW = Math.round(3840 / nextZoom);
    const viewportH = Math.round(2160 / nextZoom);
    const maxPanX = Math.max(0, 3840 - viewportW);
    const maxPanY = Math.max(0, 2160 - viewportH);

    const prevZoom = ptzState.zoomFactor || 1;
    onPtzChange({
      ...ptzState,
      zoomFactor: nextZoom,
      panOffsetX: Math.min(maxPanX, ptzState.panOffsetX),
      panOffsetY: Math.min(maxPanY, ptzState.panOffsetY),
    });
    emitOsc("/zoom", [nextZoom, speedMode === "sport" ? 8 : 4]);

    pushMovementLog({
      eventType: "ptz_zoom",
      source: { zoom: prevZoom },
      target: { zoom: nextZoom },
      trajectory: { vx: 0, vy: 0, deltaX: 0, deltaY: 0, deltaZoom: Number((nextZoom - prevZoom).toFixed(2)) },
    });
    void flushLogs();
  };

  const transitionTimerRef = useRef<number | null>(null);

  // Smooth cinematic ease-out interpolation for preset jumps
  const animateTo = useCallback(
    (targetZoom: number, targetPanX: number, targetPanY: number, durationMs = 320) => {
      if (transitionTimerRef.current) cancelAnimationFrame(transitionTimerRef.current);
      const startZoom = ptzStateRef.current.zoomFactor || 1;
      const startPanX = ptzStateRef.current.panOffsetX || 0;
      const startPanY = ptzStateRef.current.panOffsetY || 0;
      const startTime = performance.now();

      const step = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        // Smooth cubic ease out
        const ease = 1 - Math.pow(1 - progress, 3);

        const curZoom = Number((startZoom + (targetZoom - startZoom) * ease).toFixed(2));
        const curPanX = Math.round(startPanX + (targetPanX - startPanX) * ease);
        const curPanY = Math.round(startPanY + (targetPanY - startPanY) * ease);

        onPtzChange({
          ...ptzStateRef.current,
          zoomFactor: curZoom,
          panOffsetX: curPanX,
          panOffsetY: curPanY,
        });

        if (progress < 1) {
          transitionTimerRef.current = requestAnimationFrame(step);
        } else {
          transitionTimerRef.current = null;
        }
      };

      transitionTimerRef.current = requestAnimationFrame(step);
    },
    [onPtzChange]
  );

  // Preset recall with smooth camera moves: 1 = Wide (1.0x), 2 = Medium (1.5x), 3 = Narrow (2.5x)
  const applyPreset = useCallback(
    (presetIndex: 1 | 2 | 3) => {
      if (presetIndex === 1) {
        animateTo(1.0, 0, 0);
        emitOsc("/preset", [1]);
        pushMovementLog({
          eventType: "preset_jump",
          target: { zoom: 1.0, panX: 0, panY: 0 },
          trajectory: { vx: 0, vy: 0, deltaX: 0, deltaY: 0, deltaZoom: 0, durationMs: 320, easingCurve: "cubic-ease-out" },
        });
      } else if (presetIndex === 2) {
        animateTo(1.5, 640, 360);
        emitOsc("/preset", [2]);
        pushMovementLog({
          eventType: "preset_jump",
          target: { zoom: 1.5, panX: 640, panY: 360 },
          trajectory: { vx: 0, vy: 0, deltaX: 640, deltaY: 360, deltaZoom: 0.5, durationMs: 320, easingCurve: "cubic-ease-out" },
        });
      } else {
        animateTo(2.5, 1152, 648);
        emitOsc("/preset", [3]);
        pushMovementLog({
          eventType: "preset_jump",
          target: { zoom: 2.5, panX: 1152, panY: 648 },
          trajectory: { vx: 0, vy: 0, deltaX: 1152, deltaY: 648, deltaZoom: 1.5, durationMs: 320, easingCurve: "cubic-ease-out" },
        });
      }
      void flushLogs();
    },
    [animateTo, emitOsc, pushMovementLog, flushLogs]
  );

  // Recenter / Reset with ease-out
  const handleReset = useCallback(() => {
    animateTo(1.0, 0, 0);
    emitOsc("/recenter", []);
    pushMovementLog({
      eventType: "preset_jump",
      target: { zoom: 1.0, panX: 0, panY: 0 },
      trajectory: { vx: 0, vy: 0, deltaX: 0, deltaY: 0, deltaZoom: 0, durationMs: 320, easingCurve: "recenter-home" },
    });
    void flushLogs();
  }, [animateTo, emitOsc, pushMovementLog, flushLogs]);

  // Global pilot keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.key === "1") {
        e.preventDefault();
        applyPreset(1);
      } else if (e.key === "2") {
        e.preventDefault();
        applyPreset(2);
      } else if (e.key === "3") {
        e.preventDefault();
        applyPreset(3);
      } else if (e.key.toLowerCase() === "r" || e.key === "0") {
        e.preventDefault();
        handleReset();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        handleZoomChange(ptzStateRef.current.zoomFactor + 0.1);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        handleZoomChange(ptzStateRef.current.zoomFactor - 0.1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (transitionTimerRef.current) cancelAnimationFrame(transitionTimerRef.current);
    };
  }, [applyPreset, handleReset, handleZoomChange]);

  const isWide = ptzState.zoomFactor <= 1.1;
  const isMedium = ptzState.zoomFactor > 1.1 && ptzState.zoomFactor < 2.2;
  const isNarrow = ptzState.zoomFactor >= 2.2;

  const currentCropW = Math.round(3840 / (ptzState.zoomFactor || 1));
  const currentCropH = Math.round(2160 / (ptzState.zoomFactor || 1));

  return (
    <div className="w-full rounded-2xl bg-[#181a1f] border border-[#262a33] p-4 shadow-2xl text-slate-100 space-y-4 font-sans select-none max-w-sm">
      {/* ── TOP HEADER BAR: View and Gimbal + Speed Mode Pill ── */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[#e2e8f0] tracking-wide">
          View and Gimbal
        </span>

        <button
          type="button"
          onClick={() => {
            const nextMode = speedMode === "fine" ? "sport" : "fine";
            setSpeedMode(nextMode);
            emitOsc("/track-speed", [nextMode === "sport" ? 1 : 0]);
          }}
          className="rounded-md bg-[#333842] hover:bg-[#3d434f] px-3 py-1 text-[11px] font-semibold text-[#cbd5e1] border border-white/5 transition flex items-center gap-1 shadow-sm"
          title="Toggle Gimbal Sensitivity (Fine / Sport)"
        >
          <span>{speedMode === "fine" ? "Fine" : "Sport"}</span>
          <ChevronUp className="h-3 w-3 text-slate-400" />
        </button>
      </div>

      {/* ── RADIAL GIMBAL JOYSTICK CONTROLLER (Matches Hardware Reference) ── */}
      <div className="flex justify-center py-1">
        <div
          ref={joystickRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative h-44 w-44 rounded-full bg-[#191b1f] border border-[#2c3038] shadow-[inset_0_2px_8px_rgba(0,0,0,0.5)] flex items-center justify-center cursor-grab active:cursor-grabbing touch-none select-none"
        >
          {/* Subtle Directional Triangle Markers on Outer Frame (Non-clickable visual guides) */}
          <span className="absolute top-2 left-1/2 -translate-x-1/2 text-[#64748b] text-[9px] font-black pointer-events-none select-none opacity-40 leading-none">
            ▲
          </span>
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748b] text-[9px] font-black pointer-events-none select-none opacity-40 leading-none">
            ▶
          </span>
          <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[#64748b] text-[9px] font-black pointer-events-none select-none opacity-40 leading-none">
            ▼
          </span>
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#64748b] text-[9px] font-black pointer-events-none select-none opacity-40 leading-none">
            ◀
          </span>

          {/* Inner Dark Circular Disc (The Travel Arena) */}
          <div className="relative h-28 w-28 rounded-full bg-[#2d333c] border border-[#383f4a] shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)] flex items-center justify-center pointer-events-none">
            {/* The Solid Light-Silver Joystick Puck / Knob */}
            <div
              className={`h-8 w-8 rounded-full bg-[#e2e8f0] shadow-[0_2px_8px_rgba(0,0,0,0.6)] flex items-center justify-center transition-transform ${
                isDragging ? "duration-0 scale-95" : "duration-150 ease-out"
              }`}
              style={{
                transform: `translate(${joystickOffset.x}px, ${joystickOffset.y}px)`,
              }}
            />
          </div>
        </div>
      </div>

      {/* ── ZOOM SLIDER & STEPPER VALUE BOX ── */}
      <div className="flex items-center gap-3 pt-1">
        {/* Continuous Horizontal Range Slider with White Thumb */}
        <input
          type="range"
          min="1.00"
          max="3.00"
          step="0.05"
          value={ptzState.zoomFactor}
          onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
          className="flex-1 h-1 bg-[#2d323b] rounded-lg appearance-none cursor-pointer accent-white"
        />

        {/* Stepper Pill Box */}
        <div className="flex items-center rounded-md bg-[#252830] border border-[#333842] px-2.5 py-1 text-xs font-mono font-medium text-[#e2e8f0]">
          <span className="min-w-[46px]">{ptzState.zoomFactor.toFixed(2)} x</span>
          <div className="flex flex-col ml-1 border-l border-white/10 pl-1">
            <button
              type="button"
              onClick={() => handleZoomChange(ptzState.zoomFactor + 0.1)}
              className="text-slate-400 hover:text-white leading-none text-[7px]"
              title="Zoom In"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => handleZoomChange(ptzState.zoomFactor - 0.1)}
              className="text-slate-400 hover:text-white leading-none text-[7px] mt-0.5"
              title="Zoom Out"
            >
              ▼
            </button>
          </div>
        </div>
      </div>

      {/* ── 3 FOV PRESETS (WIDE / MEDIUM / NARROW) ── */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <button
          type="button"
          onClick={() => applyPreset(1)}
          className={`py-2.5 rounded-lg text-xs font-semibold transition shadow-sm ${
            isWide
              ? "bg-[#e60039] text-white shadow-[0_0_12px_rgba(230,0,57,0.35)]"
              : "bg-[#2e333d] hover:bg-[#383e4a] text-[#cbd5e1] border border-transparent"
          }`}
        >
          Wide
        </button>

        <button
          type="button"
          onClick={() => applyPreset(2)}
          className={`py-2.5 rounded-lg text-xs font-semibold transition shadow-sm ${
            isMedium
              ? "bg-[#e60039] text-white shadow-[0_0_12px_rgba(230,0,57,0.35)]"
              : "bg-[#2e333d] hover:bg-[#383e4a] text-[#cbd5e1] border border-transparent"
          }`}
        >
          Medium
        </button>

        <button
          type="button"
          onClick={() => applyPreset(3)}
          className={`py-2.5 rounded-lg text-xs font-semibold transition shadow-sm ${
            isNarrow
              ? "bg-[#e60039] text-white shadow-[0_0_12px_rgba(230,0,57,0.35)]"
              : "bg-[#2e333d] hover:bg-[#383e4a] text-[#cbd5e1] border border-transparent"
          }`}
        >
          Narrow
        </button>
      </div>

      {/* ── BOTTOM RESET / RECENTER BUTTON ── */}
      <button
        type="button"
        onClick={handleReset}
        className="w-full py-2.5 rounded-lg bg-[#2e333d] hover:bg-[#383e4a] text-[#cbd5e1] font-semibold text-xs transition border border-transparent active:scale-[0.99] shadow-sm flex items-center justify-center gap-1.5"
      >
        <span>Reset</span>
      </button>

      {/* ── SUB-PIXEL TELEMETRY HUD FOOTER ── */}
      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[9px] font-mono text-slate-400">
        <span className="truncate">
          Pan: [{Math.round(ptzState.panOffsetX)}, {Math.round(ptzState.panOffsetY)}]
        </span>
        <span className={ptzState.zoomFactor > 1 ? "text-cyan-400 font-bold" : "text-slate-400"}>
          {currentCropW}×{currentCropH} {ptzState.zoomFactor > 1 ? `(${ptzState.zoomFactor.toFixed(2)}x)` : "(NATIVE)"}
        </span>
      </div>
    </div>
  );
}
export default ManualPtzController;
